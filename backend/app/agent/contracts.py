"""Frozen wire contract for VERA conversacional (epic #5, FASE 0 — EST-00).

These models describe what backend and frontend exchange over the chat, independent of how the
backend stores anything internally. They are a *view*: `CaseEvent` is a superset of the fields the
existing private timeline event dict already carries (see `timeline.py`, `proposals.py`), so a later
phase (EST-02) can convert between the two without losing information, but a `CaseEvent` itself is
never persisted as-is.

Status mapping the epic freezes (`timeline.py` keeps using the internal names):
    candidate = proposed · confirmed = accepted · corrected = accepted + edited · discarded = discarded

Non-negotiable principles this contract exists to support (see epic #5): VERA never judges harassment,
credibility or guilt; never recommends sanctions; never pushes to report; never shares automatically.
`origin = "model_inference"` never becomes `status = "confirmed"` without an explicit human action.
"""
from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field

# --- Small enums -------------------------------------------------------------------------------

# Where a fact came from: the person said it plainly, VERA inferred it from context, it was read
# from attached evidence (a file), or the person typed it directly as their own fact (like `manual`
# events in `timeline.py`, kind "person").
Origin = Literal["user_statement", "model_inference", "evidence", "manual"]

# Public-facing status (see module docstring for the mapping to the internal one).
EventStatus = Literal["candidate", "confirmed", "corrected", "discarded"]

# What the person seems to want out of the conversation right now; drives tone, never urgency.
Goal = Literal["understand_options", "document_privately", "decide_whether_to_report", "prepare_to_share", "unspecified"]

# What a single user message is doing, as VERA reads it. Used to decide which tool (if any) to call;
# never used to judge the person or the story.
Intent = Literal["narrate", "confirm", "correct", "discard", "ask_question", "attach_evidence",
                 "request_share_preview", "other"]

SourceKind = Literal["account", "record", "file", "person", "message"]
PersonRole = Literal["affected", "respondent", "witness", "other"]
SuggestedActionType = Literal["open_share_preview", "review_timeline", "attach_evidence", "confirm_event", "open_draft"]
BrainMode = Literal["ai", "demo"]


# --- Shared shapes -----------------------------------------------------------------------------

class DateInfo(BaseModel):
    """Same exact/approximate/unknown rule as the rest of the app: nothing is guessed or completed."""
    model_config = ConfigDict(extra="forbid")
    date_kind: Literal["exact", "approximate", "unknown"]
    event_date: str | None = None
    approximate_date: str | None = Field(default=None, max_length=200)


class SourceRef(BaseModel):
    """Points at exactly what VERA read: a message, a file, an account or the person themselves."""
    model_config = ConfigDict(extra="forbid")
    id: str
    kind: SourceKind
    source_id: str
    label: str = Field(max_length=200)
    quote: str = Field(max_length=2000)
    page: int | None = None
    version: str | None = None
    field: str | None = None
    date: DateInfo | None = None


class CaseEvent(BaseModel):
    """One fact in the person's private case, as shown in the conversation."""
    model_config = ConfigDict(extra="forbid")
    id: str
    title: str = Field(max_length=200)
    description: str = Field(max_length=2000)
    date: DateInfo
    event_time: str | None = None
    status: EventStatus
    origin: Origin
    reviewed: bool
    edited: bool
    needs_review: bool
    source: SourceRef
    sources: list[SourceRef] = Field(default_factory=list)
    support_quotes: list[str] = Field(default_factory=list)
    note: str | None = Field(default=None, max_length=200)


class Person(BaseModel):
    """Someone mentioned in the case. Never scored, never labeled as credible or not."""
    model_config = ConfigDict(extra="forbid")
    name: str = Field(max_length=200)
    role: PersonRole
    detail: str | None = Field(default=None, max_length=200)


class EvidenceItem(BaseModel):
    """A file the person attached, and which events it currently supports."""
    model_config = ConfigDict(extra="forbid")
    file_id: str
    filename: str = Field(max_length=255)
    media_type: str = Field(max_length=100)
    description: str | None = Field(default=None, max_length=2000)
    linked_event_ids: list[str] = Field(default_factory=list)


class MissingInfo(BaseModel):
    """A gap VERA may ask about, never a requirement to keep talking or a nudge to report."""
    model_config = ConfigDict(extra="forbid")
    field: str = Field(max_length=100)
    prompt: str = Field(max_length=300)
    event_id: str | None = None


class CaseCounts(BaseModel):
    model_config = ConfigDict(extra="forbid")
    candidate: int = Field(default=0, ge=0)
    confirmed: int = Field(default=0, ge=0)
    corrected: int = Field(default=0, ge=0)
    discarded: int = Field(default=0, ge=0)
    with_evidence: int = Field(default=0, ge=0)


class CaseState(BaseModel):
    """Everything the UI's "what I'm understanding so far" panel needs, derived from the case."""
    model_config = ConfigDict(extra="forbid")
    case_id: str
    goal: Goal
    people: list[Person] = Field(default_factory=list)
    events: list[CaseEvent] = Field(default_factory=list)
    counts: CaseCounts
    missing_information: list[MissingInfo] = Field(default_factory=list)
    evidence: list[EvidenceItem] = Field(default_factory=list)
    updated_at: datetime


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    role: Literal["user", "assistant"]
    text: str = Field(max_length=4000)
    created_at: datetime
    client_message_id: str | None = None
    intent: Intent | None = None
    attachment_ids: list[str] = Field(default_factory=list)
    event_ids: list[str] = Field(default_factory=list)


class SuggestedAction(BaseModel):
    """A next step the UI can offer as a button; never something the backend does on its own."""
    model_config = ConfigDict(extra="forbid")
    type: SuggestedActionType
    label: str = Field(max_length=120)
    event_ids: list[str] = Field(default_factory=list)
    file_ids: list[str] = Field(default_factory=list)


# --- Request / response envelopes ---------------------------------------------------------------

class ChatTurnRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    text: str = Field(min_length=1, max_length=4000)
    client_message_id: str = Field(min_length=1, max_length=64)
    attachment_ids: list[str] = Field(default_factory=list, max_length=10)


class ChatTurnResponse(BaseModel):
    """One turn: what the person said, what VERA answered, and the case state after it."""
    model_config = ConfigDict(extra="forbid")
    user_message: ChatMessage
    assistant_message: ChatMessage
    touched_event_ids: list[str] = Field(default_factory=list)
    suggested_actions: list[SuggestedAction] = Field(default_factory=list)
    case_state: CaseState
    mode: BrainMode


# The epic calls this `ChatTurn`; kept as an alias so either name resolves to the same model.
ChatTurn = ChatTurnResponse


class ConversationView(BaseModel):
    """`GET /api/records/{id}/conversation`: history plus the current derived state."""
    model_config = ConfigDict(extra="forbid")
    case_id: str
    messages: list[ChatMessage] = Field(default_factory=list)
    case_state: CaseState
