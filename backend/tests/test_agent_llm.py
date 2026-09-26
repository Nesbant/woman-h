"""EST-05 (issue #11): `ClaudeBrain` exercised through the real HTTP endpoints, but always against a FAKE
Anthropic client — no network, no real API key. `pytest tests/test_agent_llm.py`."""
import json
from types import SimpleNamespace
from uuid import uuid4
import pytest
import anthropic
import httpx2
from app.agent import llm as llm_module
from app.agent.tools import TOOL_SCHEMAS
from conftest import login

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
def claude_settings(monkeypatch):
    """`CHAT_BRAIN=claude` with a present (fake) key, keeping every other real setting as-is."""
    from app.config import settings as real_settings
    fake = real_settings().model_copy(update={"chat_brain": "claude", "anthropic_api_key": "fake-test-key",
                                              "chat_model": "claude-sonnet-5", "chat_effort": "low"})
    monkeypatch.setattr("app.config.settings", lambda: fake)
    return fake


def _block(kind, **fields):
    return SimpleNamespace(type=kind, **fields)


def _tool_use(name, arguments):
    return SimpleNamespace(stop_reason="tool_use", stop_details=None,
                           content=[_block("tool_use", id="call-1", name=name, input=arguments)])


def _final(reply_text, suggested_actions=()):
    payload = json.dumps({"reply_text": reply_text, "suggested_actions": list(suggested_actions)})
    return SimpleNamespace(stop_reason="end_turn", stop_details=None, content=[_block("text", text=payload)])


class FakeMessages:
    """Queues canned responses in call order; records every outgoing request for shape assertions."""
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        assert self.responses, "El test se quedó sin respuestas falsas encoladas"
        return self.responses.pop(0)


class FakeClient:
    def __init__(self, responses):
        self.messages = FakeMessages(responses)


def install_fake_client(monkeypatch, responses):
    """Every `anthropic.Anthropic(...)` construction (one per turn, see `ClaudeBrain._client_or_none`)
    returns this same fake, so its response queue is shared and consumed in order across turns."""
    fake = FakeClient(responses)
    monkeypatch.setattr(llm_module.anthropic, "Anthropic", lambda **kwargs: fake)
    return fake


# --- acceptance criteria (issue #11) --------------------------------------------------------------------

def test_happy_path_reaches_mode_ai_through_the_est04_flow_with_a_stable_cached_prefix(client, monkeypatch, claude_settings):
    case_id = start_case(client)
    create_args = {"event_id": None, "title": "Comentario del supervisor", "description": MESSAGE_TEXT,
                   "date_kind": "unknown", "event_date": None, "approximate_date": None, "event_time": None,
                   "origin": "user_statement", "user_quote": NARRATE_QUOTE}
    fake = install_fake_client(monkeypatch, [
        _tool_use("create_or_update_candidate_event", create_args),
        _final("Genial, dejé anotado ese comentario. Contame si pasó algo más."),
    ])

    narrated = send(client, case_id, MESSAGE_TEXT)
    assert narrated.status_code == 200
    body = narrated.json()
    assert body["mode"] == "ai"
    events = body["case_state"]["events"]
    assert len(events) == 1 and events[0]["status"] == "candidate"
    event_id = events[0]["id"]

    fake.messages.responses.extend([
        _tool_use("confirm_event", {"event_id": event_id, "user_quote": "quiero dejar constancia de eso"}),
        _final("Quedó confirmado, gracias por contármelo."),
    ])
    confirmed = send(client, case_id, "Guárdalo, quiero dejar constancia de eso.")
    assert confirmed.status_code == 200
    confirmed_body = confirmed.json()
    assert confirmed_body["mode"] == "ai"
    confirmed_event = next(e for e in confirmed_body["case_state"]["events"] if e["id"] == event_id)
    assert confirmed_event["status"] == "confirmed"

    # Request shape: `system` (with its cache_control breakpoint) and `tools` never change across any of
    # these 4 calls (2 rounds x 2 turns) — the exact condition that lets `cache_read_input_tokens` be > 0
    # from the second call on, in the real API (unreachable from this sandboxed test).
    assert len(fake.messages.calls) == 4
    for call in fake.messages.calls:
        assert call["system"] == [{"type": "text", "text": llm_module.SYSTEM_PROMPT,
                                   "cache_control": {"type": "ephemeral"}}]
        assert call["tools"] == TOOL_SCHEMAS
        assert call["model"] == "claude-sonnet-5"


def test_missing_api_key_falls_back_to_scripted_with_no_5xx(client, monkeypatch):
    from app.config import settings as real_settings
    fake = real_settings().model_copy(update={"chat_brain": "claude", "anthropic_api_key": None})
    monkeypatch.setattr("app.config.settings", lambda: fake)

    case_id = start_case(client)
    response = send(client, case_id, MESSAGE_TEXT)
    assert response.status_code == 200
    assert response.json()["mode"] == "demo"


def test_a_typed_sdk_error_falls_back_to_scripted_with_no_5xx(client, monkeypatch, claude_settings):
    class RaisingMessages:
        def create(self, **kwargs):
            raise anthropic.APIConnectionError(request=httpx2.Request("POST", "https://api.anthropic.com/v1/messages"))

    monkeypatch.setattr(llm_module.anthropic, "Anthropic", lambda **kwargs: SimpleNamespace(messages=RaisingMessages()))

    case_id = start_case(client)
    response = send(client, case_id, MESSAGE_TEXT)
    assert response.status_code == 200
    assert response.json()["mode"] == "demo"


def test_judgment_language_reply_never_reaches_the_user(client, monkeypatch, claude_settings):
    install_fake_client(monkeypatch, [_final("Creo que esto no es creíble y hay alta probabilidad de sanción.")])

    case_id = start_case(client)
    response = send(client, case_id, MESSAGE_TEXT)
    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "demo"  # the judged reply was discarded; the whole turn reran with ScriptedBrain
    reply = body["assistant_message"]["text"].lower()
    assert "creíble" not in reply and "sanción" not in reply
    # ScriptedBrain still did its job with the same user text: a candidate was created from it.
    assert len(body["case_state"]["events"]) == 1
