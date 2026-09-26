"""EST-03 (issue #9): `build_case_state` derives the contract's `CaseState` from the case's actual data —
`Timeline.events` (via `agent/events.py`), `RecordFile` and `ConversationState` — instead of EST-00's frozen
example. Shared by `GET .../conversation`, `GET .../conversation/state` (`conversation.py`) and the
`get_case_summary` tool (`tools.py`), so there is exactly one place that turns the internal case into what
the conversation contract shows."""
from collections import Counter
from datetime import datetime, timezone
from sqlalchemy import select
from ..models import ConversationState, RecordFile, Timeline
from .contracts import CaseCounts, CaseState, EvidenceItem, MissingInfo, Person
from .events import exact_dates_in_order, to_case_events

STATUSES = ("candidate", "confirmed", "corrected", "discarded")


def _utc(value):
    """SQLite stores naive datetimes in tests; PostgreSQL may return them in the session's zone."""
    return value.replace(tzinfo=value.tzinfo or timezone.utc).astimezone(timezone.utc) if value else None


def _counts(events):
    tally = Counter(event.status for event in events)
    with_evidence = sum(1 for event in events if any(source.kind == "file" for source in event.sources))
    return CaseCounts(**{status: tally.get(status, 0) for status in STATUSES}, with_evidence=with_evidence)


def _evidence(files, events):
    return [EvidenceItem(
        file_id=file.id, filename=file.filename, media_type=file.media_type, description=file.description,
        linked_event_ids=[event.id for event in events
                          if any(source.kind == "file" and source.source_id == file.id for source in event.sources)])
        for file in files]


def in_date_order(events):
    return exact_dates_in_order(events, lambda e: (e.date.date_kind, e.date.event_date, e.event_time))


def build_case_state(db, record_id) -> CaseState:
    """Pure read: never mutates anything. `record_id` may be a `UUID` or `str`; both are used across the app.
    A case with no `Timeline` row yet (a conversation just started) has no events, no evidence and the
    `ConversationState` defaults (`goal='unspecified'`, no people, nothing missing) — never an error."""
    record_id = str(record_id)
    row = db.get(Timeline, record_id)
    events = in_date_order(to_case_events(row.events) if row else [])
    files = db.scalars(select(RecordFile).where(RecordFile.record_id == record_id)
                       .order_by(RecordFile.created_at, RecordFile.id)).all()
    conv_state = db.get(ConversationState, record_id)
    updated_at = max((value for value in (_utc(row.processed_at) if row else None,
                                          _utc(conv_state.updated_at) if conv_state else None) if value is not None),
                     default=datetime.now(timezone.utc))
    return CaseState(
        case_id=record_id,
        goal=conv_state.goal if conv_state else "unspecified",
        people=[Person(**person) for person in (conv_state.people if conv_state else [])],
        events=events,
        counts=_counts(events),
        missing_information=[MissingInfo(**item) for item in (conv_state.missing_information if conv_state else [])],
        evidence=_evidence(files, events),
        updated_at=updated_at,
    )
