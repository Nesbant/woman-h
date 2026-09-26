"""EST-00: the contract is frozen (Pydantic models + JSON examples) and the four stub endpoints
answer behind the same session/ownership checks as the rest of the private API."""
import json
from pathlib import Path
from uuid import uuid4
import pytest
from app.agent.contracts import CaseState, ChatTurnResponse, ConversationView
from conftest import login

EXAMPLES = Path(__file__).resolve().parents[2] / "contracts" / "examples"
HEADERS = {"Origin": "http://localhost:5173", "X-VERA-Request": "1"}


def example(name):
    return json.loads((EXAMPLES / name).read_text(encoding="utf-8"))


@pytest.mark.parametrize("filename, model", [
    ("conversation.json", ConversationView),
    ("chat_turn_candidate.json", ChatTurnResponse),
    ("chat_turn_register.json", ChatTurnResponse),
    ("chat_turn_share.json", ChatTurnResponse),
    ("case_state.json", CaseState),
])
def test_every_example_parses_with_its_model(filename, model):
    parsed = model.model_validate(example(filename))
    # Round-tripping back to JSON must not silently drop or invent fields (extra="forbid" on every model).
    assert model.model_validate(json.loads(parsed.model_dump_json())) == parsed


def test_start_conversation_requires_a_session_and_creates_a_case(client):
    anonymous = client.post("/api/conversations")
    assert anonymous.status_code == 401
    login(client)
    started = client.post("/api/conversations")
    assert started.status_code == 201
    case_id = started.json()["case_id"]
    assert client.get(f"/api/records/{case_id}").status_code == 200


def test_conversation_view_matches_the_contract_and_is_scoped_to_its_owner(client):
    login(client)
    case_id = client.post("/api/conversations").json()["case_id"]
    response = client.get(f"/api/records/{case_id}/conversation")
    assert response.status_code == 200
    view = ConversationView.model_validate(response.json())
    # EST-01: message history is real, so a conversation that was just started truly has none yet.
    # `case_state` is EST-03's real derivation (`agent/state.py::build_case_state`, see conversation.py).
    assert view.case_id == case_id and view.case_state.case_id == case_id and view.messages == []

    login(client, "bea@example.test")
    assert client.get(f"/api/records/{case_id}/conversation").status_code == 404
    assert client.get(f"/api/records/{uuid4()}/conversation").status_code == 404


def test_case_state_matches_the_contract_and_is_scoped_to_its_owner(client):
    login(client)
    case_id = client.post("/api/conversations").json()["case_id"]
    response = client.get(f"/api/records/{case_id}/conversation/state")
    assert response.status_code == 200
    state = CaseState.model_validate(response.json())
    # EST-03: `case_state` is now the real derivation (`agent/state.py::build_case_state`), not EST-00's
    # frozen example — a conversation that was just started truly has no events yet.
    assert state.case_id == case_id and state.events == [] and state.goal == "unspecified"

    login(client, "bea@example.test")
    assert client.get(f"/api/records/{case_id}/conversation/state").status_code == 404


def test_case_state_reflects_a_confirmed_event_from_the_conversation(client):
    from app.agent.state import build_case_state
    from app.agent.tools import ToolContext, execute
    from app.db import SessionLocal
    from app.models import Timeline

    login(client)
    case_id = client.post("/api/conversations").json()["case_id"]
    message_text = "El miércoles tuve una reunión con mi supervisor que me incomodó."
    db = SessionLocal()
    ctx = ToolContext(db=db, record_id=case_id, row=db.get(Timeline, case_id), message_id="msg-1",
                      message_text=message_text)
    created = execute("create_or_update_candidate_event", {
        "event_id": None, "title": "Reunión incómoda", "description": message_text, "date_kind": "unknown",
        "event_date": None, "approximate_date": None, "event_time": None, "origin": "user_statement",
        "user_quote": "reunión con mi supervisor que me incomodó"}, ctx)
    execute("confirm_event", {"event_id": created.content["event_id"], "user_quote": "el miércoles"}, ctx)
    db.commit()
    db.close()

    response = client.get(f"/api/records/{case_id}/conversation/state")
    state = CaseState.model_validate(response.json())
    assert state.counts.confirmed == 1
    assert state.events[0].status == "confirmed" and state.events[0].source.kind == "message"


def test_send_message_validates_input_and_answers_with_the_contract(client):
    login(client)
    case_id = client.post("/api/conversations").json()["case_id"]
    path = f"/api/records/{case_id}/conversation/messages"

    empty_text = client.post(path, json={"text": "", "client_message_id": "c-1"})
    assert empty_text.status_code == 422
    missing_client_id = client.post(path, json={"text": "Hola"})
    assert missing_client_id.status_code == 422
    unknown_field = client.post(path, json={"text": "Hola", "client_message_id": "c-1", "unexpected": True})
    assert unknown_field.status_code == 422

    response = client.post(path, json={"text": "Ese día me sentí muy incómoda con el comentario.", "client_message_id": "c-1"})
    assert response.status_code == 200
    turn = ChatTurnResponse.model_validate(response.json())
    assert turn.user_message.text == "Ese día me sentí muy incómoda con el comentario."
    assert turn.user_message.client_message_id == "c-1"
    assert turn.case_state.case_id == case_id
    assert turn.mode in ("ai", "demo")

    login(client, "bea@example.test")
    assert client.post(path, json={"text": "Hola", "client_message_id": "c-2"}).status_code == 404
