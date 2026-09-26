"""EST-01: real, private conversation history and state (epic #5).

Decision D1 (odd/tasks/conversational-vera.md): the conversation is saved in Private from the first
message, is deleted with the situation, and saving it never registers facts by itself."""
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from sqlalchemy import select
from app.db import SessionLocal
from app.models import ConversationMessage, ConversationState, Timeline
from conftest import login

REVISORA = "revisora@example.test"
EPOCH = datetime(2026, 9, 26, tzinfo=timezone.utc)


def add_message(record_id, role, text, client_message_id=None, created_at=None):
    with SessionLocal.begin() as db:
        db.add(ConversationMessage(id=str(uuid4()), record_id=record_id, role=role, text=text,
                                   client_message_id=client_message_id, attachment_ids=[], event_ids=[],
                                   created_at=created_at or datetime.now(timezone.utc)))


def test_start_conversation_creates_an_empty_timeline(client):
    login(client)
    case_id = client.post("/api/conversations").json()["case_id"]
    with SessionLocal() as db:
        row = db.get(Timeline, case_id)
    assert row is not None and row.events == [] and row.revision == 0


def test_conversation_history_is_real_ordered_and_capped_at_fifty(client):
    login(client)
    case_id = client.post("/api/conversations").json()["case_id"]
    for index in range(55):
        add_message(case_id, "user" if index % 2 == 0 else "assistant", f"Mensaje {index}", f"c-{index}",
                   created_at=EPOCH + timedelta(seconds=index))
    view = client.get(f"/api/records/{case_id}/conversation").json()
    assert len(view["messages"]) == 50
    assert [m["text"] for m in view["messages"]] == [f"Mensaje {index}" for index in range(5, 55)]
    assert view["messages"][0]["role"] == "assistant" and view["messages"][0]["client_message_id"] == "c-5"
    assert view["messages"][1]["role"] == "user" and view["messages"][1]["client_message_id"] == "c-6"


def test_another_person_cannot_read_someone_elses_conversation(client):
    login(client)
    case_id = client.post("/api/conversations").json()["case_id"]
    add_message(case_id, "user", "Un hecho privado.", "c-1")

    login(client, "bea@example.test")
    assert client.get(f"/api/records/{case_id}/conversation").status_code == 404
    assert client.get(f"/api/records/{uuid4()}/conversation").status_code == 404


def test_institutional_reviewer_sees_nothing_from_a_private_conversation(client):
    login(client)
    case_id = client.post("/api/conversations").json()["case_id"]
    add_message(case_id, "user", "Un hecho privado.", "c-1")
    client.post("/api/auth/logout")

    login(client, REVISORA)
    assert client.get(f"/api/records/{case_id}/conversation").status_code == 404
    assert client.get(f"/api/records/{case_id}/conversation/state").status_code == 404
    assert client.get("/api/records").json() == []


def test_deleting_the_situation_deletes_its_conversation(client):
    login(client)
    case_id = client.post("/api/conversations").json()["case_id"]
    add_message(case_id, "user", "Se borra conmigo.", "c-1")
    with SessionLocal.begin() as db:
        db.add(ConversationState(record_id=case_id, goal="unspecified", people=[], missing_information=[],
                                 updated_at=datetime.now(timezone.utc)))

    assert client.delete(f"/api/records/{case_id}").status_code == 204

    with SessionLocal() as db:
        assert db.scalar(select(ConversationMessage).where(ConversationMessage.record_id == case_id)) is None
        assert db.get(ConversationState, case_id) is None
        assert db.get(Timeline, case_id) is None
    assert client.get(f"/api/records/{case_id}/conversation").status_code == 404
