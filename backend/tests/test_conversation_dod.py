"""EST-08 (issue #14): the epic's Definition of Done walked through the real HTTP API with the scripted brain.
Covers the backend side of points 2–3, 5, 7–12 and 14–16; the UI points (1, 4, 6, 13) belong to the teammate's
e2e, and point 17 (real AI) needs a provider key. `pytest tests/test_conversation_dod.py`."""
from uuid import uuid4
from sqlalchemy import func, select
from app.db import SessionLocal
from app.models import InstitutionalCase, RecordSubmission
from conftest import login
from test_files import image_bytes

MARIA = "maria@example.test"
FIRST = "El 3 de marzo mi supervisor me hizo un comentario que me incomodó en la reunión de equipo."
SECOND = "El 1 de marzo ya me había escrito un mensaje fuera de horario."


def send(client, case_id, text, attachment_ids=()):
    response = client.post(f"/api/records/{case_id}/conversation/messages", json={
        "text": text, "client_message_id": str(uuid4()), "attachment_ids": list(attachment_ids)})
    assert response.status_code == 200, response.text
    return response.json()


def event_by_id(turn, event_id):
    return next(event for event in turn["case_state"]["events"] if event["id"] == event_id)


def shared_count():
    with SessionLocal() as db:
        return db.scalar(select(func.count()).select_from(InstitutionalCase)), \
            db.scalar(select(func.count()).select_from(RecordSubmission))


def test_definition_of_done_through_the_api(client, store):
    login(client, MARIA)
    before = shared_count()

    # 2 · conversation starts without any form
    started = client.post("/api/conversations")
    assert started.status_code == 201
    case_id = started.json()["case_id"]

    # 3, 5 · a narrated fact becomes a structured, message-sourced candidate
    narrated = send(client, case_id, FIRST)
    first_id = narrated["touched_event_ids"][0]
    first = event_by_id(narrated, first_id)
    assert first["status"] == "candidate" and first["source"]["kind"] == "message"

    # 7, 8, 9 · keeps talking, explicitly asks to save → confirmed
    saved = send(client, case_id, "Guárdalo, quiero dejar constancia de eso.")
    assert event_by_id(saved, first_id)["status"] == "confirmed"

    # 10 · the person corrects it with the existing timeline endpoint
    timeline = client.get(f"/api/records/{case_id}/timeline").json()
    corrected = client.put(f"/api/records/{case_id}/timeline/events/{first_id}", json={
        "revision": timeline["revision"], "status": "accepted", "title": "Comentario en la reunión",
        "description": "Mi supervisor hizo un comentario sobre mí en la reunión de equipo.",
        "date_kind": "exact", "event_date": "2026-03-03"})
    assert corrected.status_code == 200, corrected.text
    state = client.get(f"/api/records/{case_id}/conversation/state").json()
    assert next(e for e in state["events"] if e["id"] == first_id)["status"] == "corrected"

    # 11 · attaches evidence from the chat
    upload = client.post(f"/api/records/{case_id}/files", files={"file": ("captura.png", image_bytes(), "image/png")},
                         data={"description": "", "account_ids": "[]"})
    assert upload.status_code == 201, upload.text
    file_id = upload.json()["id"]
    with_file = send(client, case_id, SECOND, attachment_ids=[file_id])
    assert any(item["file_id"] == file_id for item in with_file["case_state"]["evidence"])
    second_id = with_file["touched_event_ids"][0]
    send(client, case_id, "Anota eso también.")

    # 12 · "1 de marzo" is not a literal date, so the person sets it; facts then come back in date order
    timeline = client.get(f"/api/records/{case_id}/timeline").json()
    dated = client.put(f"/api/records/{case_id}/timeline/events/{second_id}", json={
        "revision": timeline["revision"], "status": "accepted", "description": SECOND,
        "date_kind": "exact", "event_date": "2026-03-01"})
    assert dated.status_code == 200, dated.text
    state = client.get(f"/api/records/{case_id}/conversation/state").json()
    kept = [e for e in state["events"] if e["id"] in {first_id, second_id}]
    assert [e["id"] for e in kept] == [second_id, first_id]

    # 14, 15 · asks what would be shared → preview with the confirmed facts only
    preview = send(client, case_id, "Quiero ver la vista previa de lo que compartiría.")
    action = next(a for a in preview["suggested_actions"] if a["type"] == "open_share_preview")
    assert set(action["event_ids"]) == {first_id, second_id}

    # 16 · nothing left Private without an explicit submit
    assert shared_count() == before
