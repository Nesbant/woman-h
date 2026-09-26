"""EST-06 (issue #12): `prepare_share_preview` reuses `drafts.refresh_draft` (built on `draft_fields.
build_fields`) to refresh the real private draft, then returns only the `open_share_preview` action —
default selection is confirmed facts plus their linked files, same as the teammate's `useShareSelection`
frontend hook. Never submits: no `InstitutionalCase` is created. `pytest tests/test_agent_share.py`."""
import json
from datetime import datetime, timezone
from uuid import uuid4
from sqlalchemy import select
from app.agent.tools import ToolContext, execute
from app.db import SessionLocal
from app.models import Account, ComplaintDraft, InstitutionalCase, PrivateRecord, RecordFile, Timeline
from conftest import login

MARIA = "maria@example.test"
MESSAGE_TEXT = "El miércoles mi supervisor me hizo un comentario que me incomodó mucho."


def start_case(client, email=MARIA):
    login(client, email)
    return client.post("/api/conversations").json()["case_id"]


def open_ctx(record_id, message_text=MESSAGE_TEXT, message_id="msg-1"):
    db = SessionLocal()
    row = db.get(Timeline, record_id)
    return db, ToolContext(db=db, record_id=record_id, row=row, message_id=message_id, message_text=message_text)


def candidate_args(**overrides):
    return {"event_id": None, "title": "Comentario del supervisor", "description": MESSAGE_TEXT,
            "date_kind": "unknown", "event_date": None, "approximate_date": None, "event_time": None,
            "origin": "user_statement",
            "user_quote": "mi supervisor me hizo un comentario que me incomodó mucho", **overrides}


def make_file(record_id, filename="captura.png", description=None):
    with SessionLocal.begin() as db:
        file = RecordFile(id=str(uuid4()), record_id=record_id, filename=filename, description=description,
                          media_type="image/png", size=1, sha256="a" * 64,
                          original_key=f"originals/{uuid4().hex}", preview_key=f"previews/{uuid4().hex}",
                          created_at=datetime.now(timezone.utc))
        db.add(file)
    return file.id


def confirm_one(ctx, user_quote="el miércoles"):
    """Creates one candidate from `MESSAGE_TEXT` and confirms it; returns its id."""
    created = execute("create_or_update_candidate_event", candidate_args(), ctx)
    assert created.is_error is False
    event_id = created.content["event_id"]
    confirmed = execute("confirm_event", {"event_id": event_id, "user_quote": user_quote}, ctx)
    assert confirmed.is_error is False
    return event_id


# --- acceptance criteria (issue #12) --------------------------------------------------------------------

def test_prepare_share_preview_never_creates_an_institutional_case(client):
    case_id = start_case(client)
    file_id = make_file(case_id)
    db, ctx = open_ctx(case_id)
    event_id = confirm_one(ctx)
    execute("attach_evidence", {"event_id": event_id, "file_id": file_id}, ctx)
    result = execute("prepare_share_preview", {}, ctx)
    assert result.is_error is False and result.content["action"] == "open_share_preview"
    db.commit()
    with SessionLocal() as fresh:
        assert fresh.scalar(select(InstitutionalCase)) is None
    db.close()


def test_share_preview_excludes_relato_note_and_unlinked_files(client):
    case_id = start_case(client)
    linked_file = make_file(case_id, filename="vinculado.png")
    make_file(case_id, filename="sin_vincular.png")  # never selected: not linked to any event
    now = datetime.now(timezone.utc)
    with SessionLocal.begin() as db:
        record = db.get(PrivateRecord, case_id)
        record.private_note = "Nota privada que nunca debe salir de aquí."
        db.add(Account(id=str(uuid4()), record_id=case_id,
                       description="Relato libre que nunca debe salir de aquí.", date_kind="unknown",
                       event_date=None, approximate_date=None, place=None, mentioned_people=None,
                       created_at=now, updated_at=now))

    db, ctx = open_ctx(case_id)
    event_id = confirm_one(ctx)
    execute("attach_evidence", {"event_id": event_id, "file_id": linked_file}, ctx)
    result = execute("prepare_share_preview", {}, ctx)
    db.commit()

    assert result.content["file_ids"] == [linked_file]  # the unlinked file never appears
    with SessionLocal() as fresh:
        draft = fresh.scalar(select(ComplaintDraft).where(ComplaintDraft.record_id == case_id))
    serialized = json.dumps(draft.fields_json)
    assert "Nota privada" not in serialized
    assert "Relato libre" not in serialized
    db.close()


# --- implementation: reuses `drafts.refresh_draft`/`build_fields`, same draft `complaint/generate` uses ----

def test_prepare_share_preview_refreshes_the_real_private_draft(client):
    case_id = start_case(client)
    file_id = make_file(case_id, description="Captura de los mensajes fuera de horario.")
    db, ctx = open_ctx(case_id)
    event_id = confirm_one(ctx)
    execute("attach_evidence", {"event_id": event_id, "file_id": file_id}, ctx)
    result = execute("prepare_share_preview", {}, ctx)
    db.commit()
    assert result.content == {"action": "open_share_preview", "event_ids": [event_id], "file_ids": [file_id]}
    db.close()

    with SessionLocal() as fresh:
        draft = fresh.scalar(select(ComplaintDraft).where(ComplaintDraft.record_id == case_id))
        assert draft is not None
        facts = draft.fields_json["facts"]["events"]
        assert len(facts) == 1 and facts[0]["event_id"] == event_id and facts[0]["description"] == MESSAGE_TEXT
        assert draft.fields_json["evidence"]["file_ids"] == [file_id]
        assert draft.timeline_revision == fresh.get(Timeline, case_id).revision

    # It is the very draft `POST .../complaint/generate` maintains, not a separate one.
    timeline_revision = client.get(f"/api/records/{case_id}/timeline").json()["revision"]
    generated = client.post(f"/api/records/{case_id}/complaint/generate",
                            json={"revision": timeline_revision}).json()
    assert generated["draft"]["fields"]["facts"]["events"][0]["event_id"] == event_id


def test_prepare_share_preview_defaults_to_empty_before_anything_is_confirmed(client):
    case_id = start_case(client)
    db, ctx = open_ctx(case_id)
    execute("create_or_update_candidate_event", candidate_args(), ctx)  # still just a candidate
    result = execute("prepare_share_preview", {}, ctx)
    db.commit()
    assert result.content == {"action": "open_share_preview", "event_ids": [], "file_ids": []}
    db.close()
