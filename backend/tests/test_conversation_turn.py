"""EST-04 (issue #10): the turn orchestrator + `ScriptedBrain` fallback, exercised end to end through the
real HTTP endpoints. `pytest tests/test_conversation_turn.py`."""
from uuid import uuid4
from app.agent import turn as turn_module
from conftest import login

MARIA = "maria@example.test"


def start_case(client):
    login(client, MARIA)
    return client.post("/api/conversations").json()["case_id"]


def send(client, case_id, text, client_message_id=None, attachment_ids=None):
    return client.post(f"/api/records/{case_id}/conversation/messages", json={
        "text": text, "client_message_id": client_message_id or str(uuid4()),
        "attachment_ids": attachment_ids or []})


def candidate_events(state):
    return [event for event in state["case_state"]["events"] if event["status"] == "candidate"]


# --- acceptance criteria (issue #10) --------------------------------------------------------------------

def test_narrating_a_fact_creates_a_message_sourced_candidate(client):
    case_id = start_case(client)
    response = send(client, case_id, "El miércoles mi supervisor me hizo un comentario que me incomodó.")
    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "demo"
    events = body["case_state"]["events"]
    assert len(events) == 1
    event = events[0]
    assert event["status"] == "candidate" and event["origin"] == "user_statement"
    assert event["source"]["kind"] == "message"
    assert body["touched_event_ids"] == [event["id"]]
    assert body["assistant_message"]["role"] == "assistant" and body["assistant_message"]["text"]


def test_guardalo_confirms_it_and_it_appears_in_the_timeline_and_the_draft(client):
    case_id = start_case(client)
    narrated = send(client, case_id, "El miércoles mi supervisor me hizo un comentario que me incomodó.").json()
    event_id = narrated["case_state"]["events"][0]["id"]

    confirmed = send(client, case_id, "Guárdalo, quiero dejar constancia de eso.").json()
    event = next(e for e in confirmed["case_state"]["events"] if e["id"] == event_id)
    assert event["status"] == "confirmed"

    timeline = client.get(f"/api/records/{case_id}/timeline").json()
    persisted = next(e for e in timeline["events"] if e["id"] == event_id)
    assert persisted["status"] == "accepted" and persisted["reviewed"] is True

    generated = client.post(f"/api/records/{case_id}/complaint/generate", json={"revision": timeline["revision"]}).json()
    draft_event_ids = {fact["event_id"] for fact in generated["draft"]["fields"]["facts"]["events"]}
    assert event_id in draft_event_ids


def test_an_ambiguous_turn_asks_instead_of_saving(client):
    case_id = start_case(client)
    send(client, case_id, "El miércoles mi supervisor me hizo un comentario que me incomodó.")
    send(client, case_id, "El jueves me volvió a escribir fuera de horario.")

    response = send(client, case_id, "Guárdalo, quiero dejar constancia de eso.")
    assert response.status_code == 200
    body = response.json()
    assert body["touched_event_ids"] == []  # nothing confirmed
    assert len(candidate_events(body)) == 2  # both still open, untouched
    assert "¿" in body["assistant_message"]["text"]


def test_the_same_client_message_id_twice_returns_the_same_turn(client):
    case_id = start_case(client)
    client_message_id = "cmsg-repeat"
    first = send(client, case_id, "El miércoles mi supervisor me hizo un comentario.", client_message_id).json()
    second = send(client, case_id, "El miércoles mi supervisor me hizo un comentario.", client_message_id).json()

    assert first["user_message"]["id"] == second["user_message"]["id"]
    assert first["assistant_message"]["id"] == second["assistant_message"]["id"]
    assert first["assistant_message"]["text"] == second["assistant_message"]["text"]
    assert first["touched_event_ids"] == second["touched_event_ids"]
    assert len(second["case_state"]["events"]) == 1  # never redone: still exactly one candidate


# --- other behaviour -------------------------------------------------------------------------------------

def test_one_turn_at_a_time_per_case_returns_409(client):
    case_id = start_case(client)
    lock = turn_module._case_lock(case_id)
    assert lock.acquire(blocking=False)
    try:
        response = send(client, case_id, "Un mensaje mientras otro está en proceso.")
        assert response.status_code == 409
    finally:
        lock.release()


def test_a_message_over_the_length_limit_is_rejected(client):
    case_id = start_case(client)
    response = send(client, case_id, "x" * 4001)
    assert response.status_code == 422


def test_attaching_evidence_links_it_to_the_most_recent_event(client):
    from datetime import datetime, timezone
    from app.db import SessionLocal
    from app.models import RecordFile

    case_id = start_case(client)
    send(client, case_id, "El miércoles mi supervisor me hizo un comentario que me incomodó.")
    with SessionLocal.begin() as db:
        file = RecordFile(id=str(uuid4()), record_id=case_id, filename="captura.png", description=None,
                          media_type="image/png", size=1, sha256="a" * 64,
                          original_key=f"originals/{uuid4().hex}", preview_key=f"previews/{uuid4().hex}",
                          created_at=datetime.now(timezone.utc))
        db.add(file)
        file_id = file.id

    response = send(client, case_id, "Además subí una captura de esos mensajes.", attachment_ids=[file_id])
    assert response.status_code == 200
    body = response.json()
    evidence = next(item for item in body["case_state"]["evidence"] if item["file_id"] == file_id)
    assert evidence["linked_event_ids"] == body["touched_event_ids"]


def test_request_share_preview_returns_a_preview_action_without_confirming_anything(client):
    case_id = start_case(client)
    send(client, case_id, "El miércoles mi supervisor me hizo un comentario que me incomodó.")
    response = send(client, case_id, "Quiero ver la vista previa de lo que compartiría.")
    assert response.status_code == 200
    body = response.json()
    actions = [action for action in body["suggested_actions"] if action["type"] == "open_share_preview"]
    assert actions and actions[0]["event_ids"] == []  # nothing confirmed yet, so nothing would be shared
