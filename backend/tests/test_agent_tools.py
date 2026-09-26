"""EST-03 (issue #9): the six agent tools, tested as plain functions over the DB — no LLM involved.
`pytest tests/test_agent_tools.py`."""
from datetime import datetime, timezone
from uuid import uuid4
from sqlalchemy import select
from app.agent.state import build_case_state
from app.agent.tools import TOOL_SCHEMAS, ToolContext, execute
from app.db import SessionLocal
from app.models import InstitutionalCase, RecordFile, Timeline
from conftest import login

MARIA = "maria@example.test"
MESSAGE_ID = "msg-1"
MESSAGE_TEXT = "El miércoles 16 de septiembre mi supervisor me hizo un comentario que me incomodó mucho."


def start_case(client, email=MARIA):
    login(client, email)
    return client.post("/api/conversations").json()["case_id"]


def open_ctx(record_id, message_text=MESSAGE_TEXT, message_id=MESSAGE_ID):
    """A fresh session and a `ToolContext` over this case's already-created `Timeline` row. The caller
    commits (or not) and closes; tools never commit themselves (see `tools.py`'s module docstring)."""
    db = SessionLocal()
    row = db.get(Timeline, record_id)
    return db, ToolContext(db=db, record_id=record_id, row=row, message_id=message_id, message_text=message_text)


def reread_events(record_id):
    with SessionLocal() as fresh:
        return fresh.get(Timeline, record_id).events


def read_state(record_id):
    with SessionLocal() as fresh:
        return build_case_state(fresh, record_id)


def make_file(record_id, filename="captura_01.png", description=None):
    with SessionLocal.begin() as db:
        file = RecordFile(id=str(uuid4()), record_id=record_id, filename=filename, description=description,
                          media_type="image/png", size=1, sha256="a" * 64,
                          original_key=f"originals/{uuid4().hex}", preview_key=f"previews/{uuid4().hex}",
                          created_at=datetime.now(timezone.utc))
        db.add(file)
    return file.id


def candidate_args(**overrides):
    # `date_kind='unknown'` by default: the shared quote below never spells out a literal numeric date, so
    # `exact_date` would drop one anyway. Tests that care about date verification set date_kind explicitly.
    return {"event_id": None, "title": "Comentario del supervisor",
            "description": "El miércoles 16 de septiembre mi supervisor me hizo un comentario que me incomodó mucho.",
            "date_kind": "unknown", "event_date": None, "approximate_date": None, "event_time": None,
            "origin": "user_statement",
            "user_quote": "mi supervisor me hizo un comentario que me incomodó mucho", **overrides}


# --- tool schemas: strict-compatible shape ------------------------------------------------------------------

def test_tool_schemas_cover_the_six_tools_and_are_strict():
    names = {schema["name"] for schema in TOOL_SCHEMAS}
    assert names == {"create_or_update_candidate_event", "confirm_event", "discard_event",
                     "attach_evidence", "get_case_summary", "prepare_share_preview"}
    for schema in TOOL_SCHEMAS:
        assert schema["strict"] is True
        input_schema = schema["input_schema"]
        assert input_schema["additionalProperties"] is False
        # Strict tools require every property to be listed as required (optionality is a nullable type union).
        assert set(input_schema["required"]) == set(input_schema["properties"])


# --- acceptance criteria (issue #9) --------------------------------------------------------------------------

def test_an_invented_quote_is_rejected(client):
    case_id = start_case(client)
    db, ctx = open_ctx(case_id)
    result = execute("create_or_update_candidate_event", candidate_args(user_quote="esto nunca lo escribí"), ctx)
    assert result.is_error is True
    assert "cita" in result.content["message"].lower()
    assert reread_events(case_id) == []
    db.close()


def test_confirm_event_without_a_user_phrase_is_rejected(client):
    case_id = start_case(client)
    db, ctx = open_ctx(case_id)
    created = execute("create_or_update_candidate_event", candidate_args(), ctx)
    assert created.is_error is False
    result = execute("confirm_event", {"event_id": created.content["event_id"], "user_quote": "esto jamás lo dije"}, ctx)
    assert result.is_error is True
    db.commit()
    events = reread_events(case_id)
    assert events[0]["status"] == "proposed"  # never confirmed without a real quote
    db.close()


def test_a_file_id_from_another_case_is_rejected(client):
    case_id = start_case(client)
    other_case = start_case(client)  # same owner, different case
    other_file_id = make_file(other_case)
    db, ctx = open_ctx(case_id)
    created = execute("create_or_update_candidate_event", candidate_args(), ctx)
    result = execute("attach_evidence", {"event_id": created.content["event_id"], "file_id": other_file_id}, ctx)
    assert result.is_error is True
    assert "archivo" in result.content["message"].lower()
    db.close()


def test_no_tool_ever_creates_an_institutional_case(client):
    case_id = start_case(client)
    file_id = make_file(case_id)
    db, ctx = open_ctx(case_id)
    created = execute("create_or_update_candidate_event", candidate_args(), ctx)
    execute("attach_evidence", {"event_id": created.content["event_id"], "file_id": file_id}, ctx)
    execute("confirm_event", {"event_id": created.content["event_id"],
                             "user_quote": "el miércoles 16 de septiembre"}, ctx)
    execute("get_case_summary", {}, ctx)
    preview = execute("prepare_share_preview", {}, ctx)
    assert preview.is_error is False and preview.content["action"] == "open_share_preview"
    db.commit()
    with SessionLocal() as fresh:
        assert fresh.scalar(select(InstitutionalCase)) is None
    db.close()


# --- create_or_update_candidate_event: content and dates are only ever what the quote proves -----------------

def test_creating_a_candidate_builds_a_message_sourced_proposed_event(client):
    case_id = start_case(client)
    db, ctx = open_ctx(case_id)
    result = execute("create_or_update_candidate_event", candidate_args(), ctx)
    assert result.is_error is False
    db.commit()
    events = reread_events(case_id)
    assert len(events) == 1
    event = events[0]
    assert event["mode"] == "message" and event["status"] == "proposed" and event["reviewed"] is False
    assert event["origin"] == "user_statement"
    assert event["source"]["kind"] == "message" and event["source"]["source_id"] == MESSAGE_ID
    # No literal numeric date in the quote, so it stays unknown (see test_exact_date_falls_back_to_unknown_...).
    assert event["date_kind"] == "unknown" and event["event_date"] is None
    db.close()


def test_exact_date_falls_back_to_unknown_when_not_written_in_the_quote(client):
    case_id = start_case(client)
    db, ctx = open_ctx(case_id)
    # The quote never mentions 2026-01-01: an 'exact' date is only kept when it is literally written there.
    args = candidate_args(date_kind="exact", event_date="2026-01-01",
                          user_quote="mi supervisor me hizo un comentario que me incomodó mucho")
    result = execute("create_or_update_candidate_event", args, ctx)
    assert result.is_error is False
    db.commit()
    event = reread_events(case_id)[0]
    assert event["date_kind"] == "unknown" and event["event_date"] is None
    db.close()


def test_event_time_is_kept_only_when_written_in_the_quote(client):
    case_id = start_case(client)
    db, ctx = open_ctx(case_id, message_text="El 2026-09-16 a las 22:43 me escribió fuera de horario.")
    args = candidate_args(date_kind="exact", user_quote="El 2026-09-16 a las 22:43 me escribió fuera de horario.",
                          event_date="2026-09-16", event_time="22:43")
    result = execute("create_or_update_candidate_event", args, ctx)
    assert result.is_error is False
    db.commit()
    event = reread_events(case_id)[0]
    assert event["date_kind"] == "exact" and event["event_time"] == "22:43"
    db.close()

    db2, ctx2 = open_ctx(case_id, message_text="El 2026-09-17 me volvió a escribir, no recuerdo la hora exacta.")
    args2 = candidate_args(event_id=None, date_kind="exact", user_quote="El 2026-09-17 me volvió a escribir",
                           event_date="2026-09-17", event_time="10:00")  # 10:00 never appears in this quote
    result2 = execute("create_or_update_candidate_event", args2, ctx2)
    assert result2.is_error is False
    db2.commit()
    second = reread_events(case_id)[1]
    # The date is written in the quote (kept), the time is not (dropped) — verified independently.
    assert second["date_kind"] == "exact" and second["event_date"] == "2026-09-17"
    assert second["event_time"] is None
    db2.close()


def test_forbidden_judgment_language_is_rejected(client):
    case_id = start_case(client)
    db, ctx = open_ctx(case_id, message_text="Creo que fue un acoso, no sé si es creíble lo que digo.")
    args = candidate_args(description="Creo que fue un acoso, no sé si es creíble lo que digo.",
                          user_quote="no sé si es creíble lo que digo")
    result = execute("create_or_update_candidate_event", args, ctx)
    assert result.is_error is True
    db.close()


def test_updating_a_candidate_replaces_its_content_and_keeps_its_id(client):
    case_id = start_case(client)
    db, ctx = open_ctx(case_id)
    created = execute("create_or_update_candidate_event", candidate_args(), ctx)
    event_id = created.content["event_id"]
    db.commit()
    db.close()

    db2, ctx2 = open_ctx(case_id, message_text="En realidad fue el jueves 17, no el miércoles.")
    args = candidate_args(event_id=event_id, title="Comentario, fecha corregida",
                          description="En realidad fue el jueves 17, no el miércoles.",
                          event_date="2026-09-17", user_quote="fue el jueves 17")
    result = execute("create_or_update_candidate_event", args, ctx2)
    assert result.is_error is False and result.content["event_id"] == event_id
    db2.commit()
    events = reread_events(case_id)
    assert len(events) == 1 and events[0]["title"] == "Comentario, fecha corregida"
    db2.close()


def test_cannot_update_an_event_that_is_not_a_message_candidate(client):
    case_id = start_case(client)
    with SessionLocal.begin() as db:
        row = db.get(Timeline, case_id)
        row.events = [{"id": "manual-1", "title": "Hecho manual", "description": "x", "date_kind": "unknown",
                      "event_date": None, "approximate_date": None, "event_time": None, "status": "accepted",
                      "reviewed": True, "edited": False, "needs_review": False, "mode": "person",
                      "source": {"id": "manual:manual-1", "kind": "person", "source_id": "manual-1",
                                "label": "Agregado por ti", "quote": "x", "page": None, "version": None,
                                "field": None, "date": {"date_kind": "unknown", "event_date": None, "approximate_date": None}},
                      "sources": [], "support_quotes": [], "original": {}}]
    db, ctx = open_ctx(case_id)
    result = execute("create_or_update_candidate_event", candidate_args(event_id="manual-1"), ctx)
    assert result.is_error is True
    db.close()


def test_cannot_edit_a_candidate_that_was_already_reviewed(client):
    case_id = start_case(client)
    db, ctx = open_ctx(case_id)
    created = execute("create_or_update_candidate_event", candidate_args(), ctx)
    event_id = created.content["event_id"]
    execute("confirm_event", {"event_id": event_id, "user_quote": "el miércoles 16 de septiembre"}, ctx)
    db.commit()
    db.close()

    db2, ctx2 = open_ctx(case_id)
    result = execute("create_or_update_candidate_event", candidate_args(event_id=event_id), ctx2)
    assert result.is_error is True
    db2.close()


# --- confirm_event / discard_event -----------------------------------------------------------------------

def test_confirm_event_marks_it_accepted_and_reviewed(client):
    case_id = start_case(client)
    db, ctx = open_ctx(case_id)
    created = execute("create_or_update_candidate_event", candidate_args(), ctx)
    result = execute("confirm_event", {"event_id": created.content["event_id"],
                                      "user_quote": "el miércoles 16 de septiembre"}, ctx)
    assert result.is_error is False
    db.commit()
    event = reread_events(case_id)[0]
    assert event["status"] == "accepted" and event["reviewed"] is True
    state = read_state(case_id)
    confirmed = next(e for e in state.events if e.id == event["id"])
    assert confirmed.status == "confirmed"
    db.close()


def test_discard_event_marks_it_discarded_but_keeps_it(client):
    case_id = start_case(client)
    db, ctx = open_ctx(case_id)
    created = execute("create_or_update_candidate_event", candidate_args(), ctx)
    result = execute("discard_event", {"event_id": created.content["event_id"],
                                      "user_quote": "el miércoles 16 de septiembre"}, ctx)
    assert result.is_error is False
    db.commit()
    events = reread_events(case_id)
    assert len(events) == 1 and events[0]["status"] == "discarded"
    db.close()


def test_discarding_an_already_discarded_event_is_rejected(client):
    case_id = start_case(client)
    db, ctx = open_ctx(case_id)
    created = execute("create_or_update_candidate_event", candidate_args(), ctx)
    execute("discard_event", {"event_id": created.content["event_id"], "user_quote": "el miércoles 16 de septiembre"}, ctx)
    result = execute("discard_event", {"event_id": created.content["event_id"], "user_quote": "el miércoles 16 de septiembre"}, ctx)
    assert result.is_error is True
    db.close()


def test_confirming_an_already_confirmed_event_is_rejected(client):
    case_id = start_case(client)
    db, ctx = open_ctx(case_id)
    created = execute("create_or_update_candidate_event", candidate_args(), ctx)
    execute("confirm_event", {"event_id": created.content["event_id"], "user_quote": "el miércoles 16 de septiembre"}, ctx)
    result = execute("confirm_event", {"event_id": created.content["event_id"], "user_quote": "el miércoles 16 de septiembre"}, ctx)
    assert result.is_error is True
    db.close()


def test_an_unknown_event_id_is_rejected_by_every_event_tool(client):
    case_id = start_case(client)
    db, ctx = open_ctx(case_id)
    for name, arguments in [("confirm_event", {"event_id": "nope", "user_quote": "algo"}),
                            ("discard_event", {"event_id": "nope", "user_quote": "algo"}),
                            ("attach_evidence", {"event_id": "nope", "file_id": "nope"})]:
        assert execute(name, arguments, ctx).is_error is True
    db.close()


# --- attach_evidence ---------------------------------------------------------------------------------------

def test_attach_evidence_links_the_file_and_it_shows_up_in_the_case_state(client):
    case_id = start_case(client)
    file_id = make_file(case_id, description="Captura de los mensajes fuera de horario.")
    db, ctx = open_ctx(case_id)
    created = execute("create_or_update_candidate_event", candidate_args(), ctx)
    result = execute("attach_evidence", {"event_id": created.content["event_id"], "file_id": file_id}, ctx)
    assert result.is_error is False and result.content["status"] == "linked"
    db.commit()
    state = read_state(case_id)
    assert state.counts.with_evidence == 1
    evidence = next(item for item in state.evidence if item.file_id == file_id)
    assert evidence.linked_event_ids == [created.content["event_id"]]
    db.close()


def test_attaching_the_same_file_twice_is_idempotent(client):
    case_id = start_case(client)
    file_id = make_file(case_id)
    db, ctx = open_ctx(case_id)
    created = execute("create_or_update_candidate_event", candidate_args(), ctx)
    first = execute("attach_evidence", {"event_id": created.content["event_id"], "file_id": file_id}, ctx)
    second = execute("attach_evidence", {"event_id": created.content["event_id"], "file_id": file_id}, ctx)
    assert first.content["status"] == "linked" and second.content["status"] == "already_linked"
    db.commit()
    event = reread_events(case_id)[0]
    assert len(event["sources"]) == 2  # the message plus the file, not duplicated
    db.close()


# --- get_case_summary shares `build_case_state` --------------------------------------------------------------

def test_get_case_summary_matches_build_case_state(client):
    case_id = start_case(client)
    db, ctx = open_ctx(case_id)
    execute("create_or_update_candidate_event", candidate_args(), ctx)
    summary = execute("get_case_summary", {}, ctx)
    assert summary.is_error is False
    fresh_state = build_case_state(ctx.db, case_id)
    assert summary.content == fresh_state.model_dump(mode="json")
    db.close()


def test_build_case_state_defaults_for_a_freshly_started_conversation(client):
    case_id = start_case(client)
    with SessionLocal() as db:
        state = build_case_state(db, case_id)
    assert state.case_id == case_id and state.events == [] and state.people == []
    assert state.goal == "unspecified" and state.missing_information == [] and state.evidence == []
    assert state.counts.model_dump() == {"candidate": 0, "confirmed": 0, "corrected": 0, "discarded": 0, "with_evidence": 0}


# --- prepare_share_preview: default selection --------------------------------------------------------------

def test_prepare_share_preview_defaults_to_confirmed_facts_and_their_linked_files(client):
    case_id = start_case(client)
    file_id = make_file(case_id)
    db, ctx = open_ctx(case_id)
    created = execute("create_or_update_candidate_event", candidate_args(), ctx)
    event_id = created.content["event_id"]
    execute("attach_evidence", {"event_id": event_id, "file_id": file_id}, ctx)
    # Still just a candidate: the preview should not include it yet.
    preview_before = execute("prepare_share_preview", {}, ctx)
    assert preview_before.content["event_ids"] == [] and preview_before.content["file_ids"] == []

    execute("confirm_event", {"event_id": event_id, "user_quote": "el miércoles 16 de septiembre"}, ctx)
    preview_after = execute("prepare_share_preview", {}, ctx)
    assert preview_after.content == {"action": "open_share_preview", "event_ids": [event_id], "file_ids": [file_id]}
    db.close()
