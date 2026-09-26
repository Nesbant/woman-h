"""EST-02 (issue #8): CaseEvent <-> internal timeline dict, origin defaults, and the message source kind."""
from types import SimpleNamespace
from uuid import uuid4
import pytest
from app.agent.events import (ModelInferenceNotReviewed, internal_status, message_source, new_message_event,
                              origin_of, public_status, quote_in_message, to_case_event)
from app.db import SessionLocal
from app.models import Timeline
from app.timeline import merge_proposals, new_event
from app.sources import unknown_date
from conftest import login

MARIA = "maria@example.test"


def fragment_proposal(title, description, source_id="account:acc-1:0"):
    source = {"id": source_id, "kind": "account", "source_id": "acc-1", "label": "Relato 1", "quote": description,
              "page": None, "version": "v1", "field": None, "date": unknown_date()}
    return {"title": title, "description": description, "date_kind": "unknown", "event_date": None,
            "approximate_date": None, "event_time": None, "sources": [source], "support_quotes": [description]}


def base_event(**overrides):
    proposal = fragment_proposal("Un hecho", "Un hecho contado")
    event = new_event(proposal, overrides.pop("mode", "extractive"))
    event.update(overrides)
    return event


# --- origin defaults for legacy events ----------------------------------------------------------------

def test_manual_events_default_to_manual_origin():
    assert origin_of(base_event(mode="person")) == "manual"


def test_propose_pipeline_events_default_to_model_inference_origin():
    assert origin_of(base_event(mode="extractive")) == "model_inference"
    assert origin_of(base_event(mode="ai")) == "model_inference"
    assert origin_of(base_event(mode="fixture")) == "model_inference"


def test_an_explicit_origin_tag_wins_over_the_legacy_mode_default():
    assert origin_of(base_event(mode="message", origin="user_statement")) == "user_statement"


# --- status mapping ------------------------------------------------------------------------------------

@pytest.mark.parametrize("status, edited, expected", [
    ("proposed", False, "candidate"), ("accepted", False, "confirmed"),
    ("accepted", True, "corrected"), ("discarded", False, "discarded")])
def test_public_status_mapping(status, edited, expected):
    event = base_event(mode="person", status=status, edited=edited, reviewed=True)
    assert public_status(event) == expected


@pytest.mark.parametrize("public, internal", [
    ("candidate", "proposed"), ("confirmed", "accepted"), ("corrected", "accepted"), ("discarded", "discarded")])
def test_internal_status_mapping(public, internal):
    assert internal_status(public) == internal


# --- the message source kind --------------------------------------------------------------------------

def test_message_source_verifies_the_quote_against_the_saved_message_text():
    text = "Ese día   me SENTÍ muy incómoda con el comentario."
    source = message_source("msg-1", text, "me sentí muy incómoda", "Tu mensaje en el chat")
    assert source == {"id": "message:msg-1", "kind": "message", "source_id": "msg-1", "label": "Tu mensaje en el chat",
                      "quote": "me sentí muy incómoda", "page": None, "version": None, "field": None,
                      "date": unknown_date()}


def test_message_source_rejects_a_quote_that_was_never_actually_said():
    assert quote_in_message("nunca lo dije", "Lo que sí dije es otra cosa.") is False
    with pytest.raises(ValueError):
        message_source("msg-1", "Lo que sí dije es otra cosa.", "nunca lo dije", "Tu mensaje en el chat")


def test_new_message_event_builds_a_conversation_candidate_that_converts_cleanly():
    event = new_message_event("msg-1", "Conté que hubo una reunión rara.", "una reunión rara",
                              "Reunión rara", "Conté que hubo una reunión rara.", "unknown")
    assert event["mode"] == "message" and event["status"] == "proposed" and event["reviewed"] is False
    case_event = to_case_event(event)
    assert case_event.status == "candidate" and case_event.origin == "user_statement"
    assert case_event.source.kind == "message" and case_event.source.quote == "una reunión rara"


# --- MUST FIX: reprocessing must not drop conversation/person candidates --------------------------------

def test_reprocessing_keeps_unreviewed_conversation_candidates_but_drops_plain_unreviewed_proposals():
    plain = base_event(mode="extractive")  # a propose-pipeline candidate, never reviewed
    conversation = new_message_event("msg-2", "Además pasó otra cosa.", "otra cosa",
                                     "Otra cosa", "Además pasó otra cosa.", "unknown")
    row = SimpleNamespace(events=[plain, conversation])

    merged = merge_proposals(row, proposed=[], mode="extractive")

    assert [event["id"] for event in merged] == [conversation["id"]]


def test_reprocessing_keeps_conversation_candidates_end_to_end(client, demo_record):
    login(client, MARIA)
    state = client.post(f"/api/records/{demo_record}/timeline/analyze", json={"revision": 0}).json()
    injected = new_message_event(str(uuid4()), "Conté algo más en el chat.", "algo más",
                                 "Hecho contado en el chat", "Conté algo más en el chat.", "unknown")
    with SessionLocal.begin() as db:
        row = db.get(Timeline, demo_record)
        row.events = [*row.events, injected]

    again = client.post(f"/api/records/{demo_record}/timeline/analyze",
                        json={"revision": state["revision"]}).json()
    kept = next((event for event in again["events"] if event["id"] == injected["id"]), None)
    assert kept is not None and kept["status"] == "proposed" and kept["reviewed"] is False


# --- non-negotiable: model_inference never becomes accepted without an explicit action -------------------

def test_model_inference_event_never_becomes_accepted_without_explicit_action():
    bypassed = base_event(mode="extractive", status="accepted", reviewed=False)  # never went through review
    assert origin_of(bypassed) == "model_inference"
    with pytest.raises(ModelInferenceNotReviewed):
        to_case_event(bypassed)


def test_model_inference_event_can_be_accepted_once_actually_reviewed():
    reviewed = base_event(mode="extractive", status="accepted", reviewed=True)
    case_event = to_case_event(reviewed)
    assert case_event.origin == "model_inference" and case_event.status == "confirmed"


def test_timeline_order_sorts_exact_dates_in_place_and_never_moves_the_rest():
    from app.agent.events import timeline_order
    events = [{"id": "approx", "date_kind": "approximate", "event_date": None},
              {"id": "mar3", "date_kind": "exact", "event_date": "2026-03-03"},
              {"id": "unknown", "date_kind": "unknown", "event_date": None},
              {"id": "mar1", "date_kind": "exact", "event_date": "2026-03-01"},
              {"id": "mar1-later", "date_kind": "exact", "event_date": "2026-03-01"}]
    assert [e["id"] for e in timeline_order(events)] == ["approx", "mar1", "unknown", "mar1-later", "mar3"]
