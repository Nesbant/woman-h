"""`CaseEvent` (`agent/contracts.py`) view of the internal timeline event dict (`timeline.py`).

The internal dict is the only thing ever persisted (`Timeline.events`); `CaseEvent` is a read-only
projection of it for the conversation contract and is never itself stored. Events created before this
module existed (or by the plain propose pipeline, see `proposals.py`) have no `origin` field, so
`origin_of` derives a safe default from the legacy `mode`: a person's own manual entry is `manual`;
anything else defaults to `model_inference`, the most restrictive origin (epic #5: `model_inference`
never confirms itself), which is a conservative label rather than a precise one for old evidence-based
events — it never loosens what is required to accept them.
"""
from uuid import uuid4
from ..sources import unknown_date
from .contracts import CaseEvent, DateInfo, SourceRef

# Event `mode`s that come from the person, not from VERA proposing something: their own manual timeline
# entries (`person`, see `timeline.py`) and, going forward, anything the conversation creates (`message`).
# `merge_proposals` (`timeline.py`) must keep these across reprocessing even before they are reviewed
# (MUST FIX, epic #5 / issue #8): re-running "Organizar cronología" must never drop what the person
# contributed themselves, whether they typed it directly or told VERA about it in the chat.
CONVERSATION_MODES = frozenset({"person", "message"})

_LEGACY_ORIGIN_BY_MODE = {"person": "manual"}

_PUBLIC_STATUS = {"proposed": "candidate", "discarded": "discarded"}
_INTERNAL_STATUS = {"candidate": "proposed", "confirmed": "accepted", "corrected": "accepted", "discarded": "discarded"}


class ModelInferenceNotReviewed(ValueError):
    """A `model_inference` event was about to be exposed as accepted (`confirmed`/`corrected`) without
    ever having been reviewed. This should be unreachable through the existing review flow (accepting an
    event always sets `reviewed=True` at the same time); it exists as a defense-in-depth guard for future
    callers (tool executor, EST-03) so the non-negotiable rule stays enforced in one place."""


def origin_of(event: dict) -> str:
    """The event's `origin` if one was tagged on it, otherwise a default derived from its legacy `mode`."""
    return event.get("origin") or _LEGACY_ORIGIN_BY_MODE.get(event.get("mode"), "model_inference")


def public_status(event: dict) -> str:
    """candidate = proposed · confirmed = accepted · corrected = accepted + edited · discarded = discarded."""
    if event["status"] == "accepted":
        return "corrected" if event.get("edited") else "confirmed"
    return _PUBLIC_STATUS[event["status"]]


def internal_status(status: str) -> str:
    """The inverse of `public_status` (imprecise on purpose: both `confirmed` and `corrected` are `accepted`
    internally; `edited` is tracked separately)."""
    return _INTERNAL_STATUS[status]


def _source_ref(source: dict) -> SourceRef:
    return SourceRef(id=source["id"], kind=source["kind"], source_id=source["source_id"], label=source["label"],
                     quote=source["quote"], page=source.get("page"), version=source.get("version"),
                     field=source.get("field"), date=source.get("date"))


def to_case_event(event: dict) -> CaseEvent:
    """Builds the contract's view of one internal timeline event. Pure: never mutates or persists anything."""
    origin, status = origin_of(event), public_status(event)
    if origin == "model_inference" and status in ("confirmed", "corrected") and not event["reviewed"]:
        raise ModelInferenceNotReviewed(f"El evento {event['id']!r} es model_inference y figura aceptado sin revisión")
    sources = event.get("sources") or [event["source"]]
    return CaseEvent(
        id=event["id"], title=event["title"], description=event["description"],
        date=DateInfo(date_kind=event["date_kind"], event_date=event["event_date"],
                      approximate_date=event["approximate_date"]),
        event_time=event.get("event_time"), status=status, origin=origin,
        reviewed=event["reviewed"], edited=event.get("edited", False), needs_review=event.get("needs_review", False),
        source=_source_ref(event["source"]), sources=[_source_ref(s) for s in sources],
        support_quotes=event.get("support_quotes") or [], note=event.get("note"))


def to_case_events(events: list[dict]) -> list[CaseEvent]:
    return [to_case_event(event) for event in events]


def squash(text: str) -> str:
    return " ".join(text.split()).casefold()


def quote_in_message(quote: str, message_text: str) -> bool:
    """A `message`-sourced quote must appear literally (case/whitespace-insensitive) in what was actually
    saved — the same rule `proposals.cite` already applies to every other source kind."""
    return bool(quote and quote.strip()) and squash(quote) in squash(message_text)


def message_source(message_id, message_text: str, quote: str, label: str, date: dict | None = None) -> dict:
    """A `SourceRef`-shaped dict pointing at one saved chat message. Raises if the quote cannot be verified
    against the message text actually stored: a tool call merely claiming what was said is never enough."""
    if not quote_in_message(quote, message_text):
        raise ValueError("La cita no aparece en el mensaje guardado")
    return {"id": f"message:{message_id}", "kind": "message", "source_id": str(message_id), "label": label,
            "quote": quote, "page": None, "version": None, "field": None, "date": date or unknown_date()}


def new_message_event(message_id, message_text: str, quote: str, title: str, description: str, date_kind: str,
                      event_date: str | None = None, approximate_date: str | None = None, event_time: str | None = None,
                      origin: str = "user_statement", label: str = "Tu mensaje en el chat") -> dict:
    """A new conversation-origin candidate event (`mode='message'`), shaped like `timeline.new_event` builds.
    For the tool executor (EST-03) to call once it can turn a chat message into a candidate fact; `origin`
    defaults to `user_statement` (a literal narration) and can be set to `model_inference` for a pattern VERA
    noticed rather than something the person stated directly."""
    source = message_source(message_id, message_text, quote, label)
    content = {"title": title, "description": description, "date_kind": date_kind, "event_date": event_date,
              "approximate_date": approximate_date, "event_time": event_time}
    return {"id": str(uuid4()), "source": source, "sources": [source], "support_quotes": [quote],
            "original": dict(content), **content, "status": "proposed", "reviewed": False, "edited": False,
            "needs_review": True, "mode": "message", "origin": origin}


def update_message_event(event: dict, message_id, message_text: str, quote: str, title: str, description: str,
                         date_kind: str, event_date: str | None = None, approximate_date: str | None = None,
                         event_time: str | None = None, origin: str = "user_statement",
                         label: str = "Tu mensaje en el chat") -> dict:
    """Replaces a still-`proposed`, `mode='message'` candidate's content with a fresher telling, re-sourced to
    the message that just restated it (the tool executor, EST-03, enforces the mode/status precondition before
    calling this). Keeps the event's `id`, `mode`, `status`, review flags and `original`; only content, source
    and quotes move."""
    source = message_source(message_id, message_text, quote, label)
    content = {"title": title, "description": description, "date_kind": date_kind, "event_date": event_date,
              "approximate_date": approximate_date, "event_time": event_time}
    quotes = list(dict.fromkeys([*(event.get("support_quotes") or []), quote]))
    return {**event, "source": source, "sources": [source], "support_quotes": quotes, **content}
