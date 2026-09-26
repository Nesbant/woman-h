"""EST-05 (issue #11, revised 2026-09-26): `OpenRouterBrain` exercised through the real HTTP endpoints, but
always against a FAKE OpenRouter transport (`httpx.MockTransport` — no network, no real API key).
`pytest tests/test_agent_llm.py`."""
import json
from uuid import uuid4
import httpx
import pytest
from app.agent import openrouter as openrouter_module
from app.agent import turn as turn_module
from app.agent.tools import TOOL_SCHEMAS
from conftest import login

_RealClient = httpx.Client  # captured before any test monkeypatches `openrouter_module.httpx.Client`

MARIA = "maria@example.test"
MESSAGE_TEXT = "El miércoles mi supervisor me hizo un comentario que me incomodó."
NARRATE_QUOTE = "mi supervisor me hizo un comentario que me incomodó"


def start_case(client, email=MARIA):
    login(client, email)
    return client.post("/api/conversations").json()["case_id"]


def send(client, case_id, text, client_message_id=None):
    return client.post(f"/api/records/{case_id}/conversation/messages", json={
        "text": text, "client_message_id": client_message_id or str(uuid4()), "attachment_ids": []})


@pytest.fixture
def openrouter_settings(monkeypatch):
    """`CHAT_BRAIN=openrouter` with a present (fake) key, keeping every other real setting as-is."""
    from app.config import settings as real_settings
    fake = real_settings().model_copy(update={
        "chat_brain": "openrouter", "openrouter_api_key": "fake-test-key",
        "chat_model": "google/gemini-3.1-flash-lite", "chat_fallback_models": ["deepseek/deepseek-v4-flash"]})
    monkeypatch.setattr("app.config.settings", lambda: fake)
    return fake


def _tool_call_response(name, arguments, call_id="call-1"):
    body = {"choices": [{"finish_reason": "tool_calls", "message": {
        "role": "assistant", "content": None,
        "tool_calls": [{"id": call_id, "type": "function",
                       "function": {"name": name, "arguments": json.dumps(arguments)}}]}}]}
    return httpx.Response(200, json=body)


def _final_response(reply_text, suggested_actions=()):
    payload = json.dumps({"reply_text": reply_text, "suggested_actions": list(suggested_actions)})
    body = {"choices": [{"finish_reason": "stop", "message": {"role": "assistant", "content": payload}}]}
    return httpx.Response(200, json=body)


class FakeTransport:
    """Queues canned `httpx.Response`s in call order; records every outgoing `httpx.Request` for shape
    assertions, exactly like the previous Anthropic fake recorded every `client.messages.create(**kwargs)`."""
    def __init__(self, responses):
        self.responses = list(responses)
        self.requests: list[httpx.Request] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        assert self.responses, "El test se quedó sin respuestas falsas encoladas"
        return self.responses.pop(0)

    def bodies(self):
        return [json.loads(request.content) for request in self.requests]


def install_fake_transport(monkeypatch, responses):
    """Every `httpx.Client(...)` construction inside `OpenRouterBrain.next_step` (one per round) gets this
    same fake transport instead of real network, so its response queue is shared and consumed in order
    across rounds and turns."""
    fake = FakeTransport(responses)

    def fake_client(**kwargs):
        kwargs["transport"] = httpx.MockTransport(fake.handler)
        return _RealClient(**kwargs)

    monkeypatch.setattr(openrouter_module.httpx, "Client", fake_client)
    return fake


# --- acceptance criteria (issue #11) --------------------------------------------------------------------

def test_happy_path_reaches_mode_ai_through_the_est04_flow_with_a_stable_request_shape(client, monkeypatch, openrouter_settings):
    case_id = start_case(client)
    create_args = {"event_id": None, "title": "Comentario del supervisor", "description": MESSAGE_TEXT,
                   "date_kind": "unknown", "event_date": None, "approximate_date": None, "event_time": None,
                   "origin": "user_statement", "user_quote": NARRATE_QUOTE}
    fake = install_fake_transport(monkeypatch, [
        _tool_call_response("create_or_update_candidate_event", create_args),
        _final_response("Genial, dejé anotado ese comentario. Contame si pasó algo más."),
    ])

    narrated = send(client, case_id, MESSAGE_TEXT)
    assert narrated.status_code == 200
    body = narrated.json()
    assert body["mode"] == "ai"
    events = body["case_state"]["events"]
    assert len(events) == 1 and events[0]["status"] == "candidate"
    event_id = events[0]["id"]

    fake.responses.extend([
        _tool_call_response("confirm_event", {"event_id": event_id, "user_quote": "quiero dejar constancia de eso"}),
        _final_response("Quedó confirmado, gracias por contármelo."),
    ])
    confirmed = send(client, case_id, "Guárdalo, quiero dejar constancia de eso.")
    assert confirmed.status_code == 200
    confirmed_body = confirmed.json()
    assert confirmed_body["mode"] == "ai"
    confirmed_event = next(e for e in confirmed_body["case_state"]["events"] if e["id"] == event_id)
    assert confirmed_event["status"] == "confirmed"

    # Request shape: 2 rounds x 2 turns = 4 calls, all sharing the same stable, provider-cacheable prefix
    # (system message + tools never change across any of them).
    bodies = fake.bodies()
    assert len(bodies) == 4
    expected_tools = [{"type": "function", "function": {"name": schema["name"], "description": schema["description"],
                                                        "parameters": schema["input_schema"], "strict": True}}
                      for schema in TOOL_SCHEMAS]
    for request, body in zip(fake.requests, bodies):
        assert body["messages"][0] == {"role": "system", "content": openrouter_module.SYSTEM_PROMPT}
        assert body["tools"] == expected_tools
        assert body["tool_choice"] == "auto"
        assert "parallel_tool_calls" not in body  # excludes every provider under require_parameters
        assert body["model"] == "google/gemini-3.1-flash-lite"
        assert body["models"] == ["google/gemini-3.1-flash-lite", "deepseek/deepseek-v4-flash"]
        assert body["provider"] == {"require_parameters": True, "sort": "throughput"}
        assert body["response_format"]["type"] == "json_schema"
        assert body["response_format"]["json_schema"]["strict"] is True
        assert body["response_format"]["json_schema"]["name"] == "vera_reply"
        assert request.headers["authorization"] == "Bearer fake-test-key"

    # The 2nd call of each turn carries the 1st round's tool call/result as an assistant `tool_calls` message
    # plus a matching `role: "tool"` message, correctly id-matched.
    for round_2_body in (bodies[1], bodies[3]):
        tool_messages = [message for message in round_2_body["messages"] if message["role"] == "assistant"
                         and message.get("tool_calls")]
        assert len(tool_messages) == 1
        call_id = tool_messages[0]["tool_calls"][0]["id"]
        tool_result = next(message for message in round_2_body["messages"] if message["role"] == "tool")
        assert tool_result["tool_call_id"] == call_id
        result_payload = json.loads(tool_result["content"])
        assert result_payload["is_error"] is False


# --- fact-detection slice 1: several `create_or_update_candidate_event` calls in one turn, one per round -----

def test_two_facts_in_one_message_via_two_tool_rounds_then_confirm_the_right_one(client, monkeypatch, openrouter_settings):
    case_id = start_case(client)
    text = ("En la reunión hizo un comentario sobre mi cuerpo y ayer me escribió a las 11 preguntándome si "
           "estaba despierta.")
    reunion_quote = "En la reunión hizo un comentario sobre mi cuerpo"
    mensaje_quote = "ayer me escribió a las 11 preguntándome si estaba despierta."
    create_reunion = {"event_id": None, "title": "Comentario en la reunión", "description": reunion_quote,
                      "date_kind": "unknown", "event_date": None, "approximate_date": None, "event_time": None,
                      "origin": "user_statement", "user_quote": reunion_quote}
    create_mensaje = {"event_id": None, "title": "Mensaje de ayer", "description": mensaje_quote,
                      "date_kind": "unknown", "event_date": None, "approximate_date": None, "event_time": None,
                      "origin": "user_statement", "user_quote": mensaje_quote}
    fake = install_fake_transport(monkeypatch, [
        _tool_call_response("create_or_update_candidate_event", create_reunion, call_id="call-1"),
        _tool_call_response("create_or_update_candidate_event", create_mensaje, call_id="call-2"),
        _final_response("Entendí dos momentos distintos: el de la reunión y el del mensaje de ayer. Los dejé "
                        "pendientes para que los revises."),
    ])

    narrated = send(client, case_id, text)
    assert narrated.status_code == 200
    body = narrated.json()
    assert body["mode"] == "ai"
    events = body["case_state"]["events"]
    assert len(events) == 2
    assert all(event["status"] == "candidate" for event in events)
    message_event = next(e for e in events if e["source"]["quote"] == mensaje_quote)
    other_event = next(e for e in events if e["id"] != message_event["id"])
    assert set(body["touched_event_ids"]) == {message_event["id"], other_event["id"]}

    fake.responses.extend([
        _tool_call_response("confirm_event", {"event_id": message_event["id"], "user_quote": "guarda el del mensaje"}),
        _final_response("Quedó confirmado ese hecho, gracias por contármelo."),
    ])
    confirmed = send(client, case_id, "Sí, guarda el del mensaje.")
    assert confirmed.status_code == 200
    confirmed_body = confirmed.json()
    assert confirmed_body["mode"] == "ai"
    updated_message = next(e for e in confirmed_body["case_state"]["events"] if e["id"] == message_event["id"])
    updated_other = next(e for e in confirmed_body["case_state"]["events"] if e["id"] == other_event["id"])
    assert updated_message["status"] == "confirmed"
    assert updated_other["status"] == "candidate"  # untouched

    timeline = client.get(f"/api/records/{case_id}/timeline").json()
    persisted = next(e for e in timeline["events"] if e["id"] == message_event["id"])
    assert persisted["status"] == "accepted" and persisted["reviewed"] is True
    other_persisted = next(e for e in timeline["events"] if e["id"] == other_event["id"])
    assert other_persisted["status"] == "proposed"

    # 3 rounds x 1st turn (2 creates + 1 final) + 2 rounds x 2nd turn (1 confirm + 1 final) = 5 calls.
    assert len(fake.bodies()) == 5


# --- exactly at, and one over, the round budget: the extra `final_only` round -------------------------------

QUOTE_1, QUOTE_2, QUOTE_3, QUOTE_4 = ("me escribió pidiéndome explicaciones", "me llamó tres veces seguidas",
                                     "me mandó un correo agresivo", "hizo un comentario delante de todos")
FOUR_FACTS_TEXT = f"El lunes {QUOTE_1}; el martes {QUOTE_2}; el miércoles {QUOTE_3} y el jueves {QUOTE_4}."


def _create_args(quote, title):
    return {"event_id": None, "title": title, "description": quote, "date_kind": "unknown", "event_date": None,
           "approximate_date": None, "event_time": None, "origin": "user_statement", "user_quote": quote}


def test_all_four_rounds_spent_on_tools_get_one_extra_final_only_round_for_the_reply(client, monkeypatch, openrouter_settings):
    case_id = start_case(client)
    creates = [_create_args(quote, f"Hecho {index + 1}")
              for index, quote in enumerate([QUOTE_1, QUOTE_2, QUOTE_3, QUOTE_4])]
    fake = install_fake_transport(monkeypatch, [
        *(_tool_call_response("create_or_update_candidate_event", args, call_id=f"call-{index}")
         for index, args in enumerate(creates)),
        _final_response("Entendí cuatro momentos distintos. Los dejé pendientes para que los revises."),
    ])

    response = send(client, case_id, FOUR_FACTS_TEXT)
    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "ai"
    assert len(body["case_state"]["events"]) == 4
    assert body["assistant_message"]["text"] != turn_module.ROUND_LIMIT_TEXT

    bodies = fake.bodies()
    assert len(bodies) == 5  # 4 tool rounds + 1 extra final-only round
    assert all(body["tool_choice"] == "auto" for body in bodies[:4])
    assert bodies[4]["tool_choice"] == "none"  # the extra round forces a plain answer, never another tool call
    assert bodies[4]["tools"] == bodies[0]["tools"]  # kept, so the reconstructed history stays valid


def test_final_only_round_still_returning_a_tool_call_falls_back_to_the_round_limit_reply(client, monkeypatch, openrouter_settings):
    case_id = start_case(client)
    creates = [_create_args(quote, f"Hecho {index + 1}")
              for index, quote in enumerate([QUOTE_1, QUOTE_2, QUOTE_3, QUOTE_4])]
    misbehaving_extra = _create_args(QUOTE_1, "Quinto hecho, no debería ejecutarse")
    fake = install_fake_transport(monkeypatch, [
        *(_tool_call_response("create_or_update_candidate_event", args, call_id=f"call-{index}")
         for index, args in enumerate(creates)),
        _tool_call_response("create_or_update_candidate_event", misbehaving_extra, call_id="call-extra"),
    ])

    response = send(client, case_id, FOUR_FACTS_TEXT)
    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "ai"  # a normal step, not a BrainError: no fallback to ScriptedBrain
    assert len(body["case_state"]["events"]) == 4  # the 5th (final-only) tool call was never executed
    assert body["assistant_message"]["text"] == turn_module.ROUND_LIMIT_TEXT
    assert len(fake.bodies()) == 5


def test_missing_api_key_falls_back_to_scripted_with_no_5xx(client, monkeypatch):
    from app.config import settings as real_settings
    fake = real_settings().model_copy(update={"chat_brain": "openrouter", "openrouter_api_key": None})
    monkeypatch.setattr("app.config.settings", lambda: fake)

    case_id = start_case(client)
    response = send(client, case_id, MESSAGE_TEXT)
    assert response.status_code == 200
    assert response.json()["mode"] == "demo"


def test_a_5xx_falls_back_to_scripted_with_no_5xx_to_the_client(client, monkeypatch, openrouter_settings):
    install_fake_transport(monkeypatch, [httpx.Response(503, json={"error": {"message": "provider overloaded"}})])

    case_id = start_case(client)
    response = send(client, case_id, MESSAGE_TEXT)
    assert response.status_code == 200
    assert response.json()["mode"] == "demo"


def test_a_timeout_falls_back_to_scripted_with_no_5xx(client, monkeypatch, openrouter_settings):
    def raising_handler(request):
        raise httpx.ReadTimeout("timed out", request=request)

    monkeypatch.setattr(openrouter_module.httpx, "Client",
                        lambda **kwargs: _RealClient(transport=httpx.MockTransport(raising_handler)))

    case_id = start_case(client)
    response = send(client, case_id, MESSAGE_TEXT)
    assert response.status_code == 200
    assert response.json()["mode"] == "demo"


def test_invalid_json_body_falls_back_to_scripted_with_no_5xx(client, monkeypatch, openrouter_settings):
    install_fake_transport(monkeypatch, [httpx.Response(200, content=b"not json at all")])

    case_id = start_case(client)
    response = send(client, case_id, MESSAGE_TEXT)
    assert response.status_code == 200
    assert response.json()["mode"] == "demo"


def test_judgment_language_reply_never_reaches_the_user(client, monkeypatch, openrouter_settings):
    install_fake_transport(monkeypatch, [
        _final_response("Creo que esto no es creíble y hay alta probabilidad de sanción.")])

    case_id = start_case(client)
    response = send(client, case_id, MESSAGE_TEXT)
    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "demo"  # the judged reply was discarded; the whole turn reran with ScriptedBrain
    reply = body["assistant_message"]["text"].lower()
    assert "creíble" not in reply and "sanción" not in reply
    # ScriptedBrain still did its job with the same user text: a candidate was created from it.
    assert len(body["case_state"]["events"]) == 1
