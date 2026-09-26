"""EST-04 (issue #10): the turn orchestrator. One `POST .../messages` becomes: a per-case lock (so two
messages for the same case can never run at once, see `_locked_turn`) → idempotency by `client_message_id`
(a repeated one returns the same `ChatTurn`, never redone) → save the user's message → build context (the
derived `CaseState` plus the last `CONTEXT_MESSAGES` messages) → run the chosen `AgentBrain`'s tool loop, at
most `MAX_ROUNDS` rounds, through the single validated executor in `agent/tools.py` → save the assistant's
reply (and which events it touched) → answer with the same `ChatTurnResponse` shape EST-00 froze.

Lock strategy (must work on SQLite and PostgreSQL): a per-case `threading.Lock`, tried non-blocking, rejects
a second concurrent request for the same case with 409 instead of queueing or racing it — this alone is
correct for a single Python process, which is what the test suite and a one-worker dev server are. A real
multi-process PostgreSQL deployment additionally takes a transaction-scoped advisory lock
(`pg_try_advisory_xact_lock`, released automatically at commit/rollback) keyed by the same case id, so two
different worker processes serialize the same way; on SQLite `_advisory_lock` is a no-op (always granted),
since SQLite has no such mechanism and, being single-process here, does not need one.

EST-05 (issue #11): when the configured brain is `claude` and it raises `agent/llm.py::BrainError` on any
round (missing key, a typed SDK error, a `refusal`/`max_tokens` stop, a judgment-language reply, ...),
`_claude_or_fallback` rolls the whole attempted turn back — discarding any tool-call mutations that
provider's earlier rounds already made in memory this turn, exactly like a normal exception would have to —
and reruns it from scratch with a fresh `ScriptedBrain`, so the person always gets `mode: "demo"` and never a
5xx or a half-written turn. Known limitation: on PostgreSQL, `db.rollback()` ends the transaction that held
`_advisory_lock`'s advisory lock; the fallback attempt runs without it (the in-process `threading.Lock` still
serializes this case for the whole request either way, so this only matters for true multi-process races
during the rare fallback path itself)."""
import logging
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from uuid import uuid4
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from ..models import ConversationMessage, Timeline
from .brain import BrainStep, RoundContext, RoundResult, get_brain
from .contracts import ChatMessage, ChatTurnRequest, ChatTurnResponse
from .llm import BrainError
from .scripted import ScriptedBrain
from .state import build_case_state
from .tools import ToolContext, execute

MAX_ROUNDS = 4
CONTEXT_MESSAGES = 20
REPLY_SUFFIX = "::reply"
BUSY = "Ya hay un mensaje en proceso para este caso. Espera un momento e inténtalo de nuevo."
ROUND_LIMIT_TEXT = "Avancé lo que pude con esto. Cuéntame si falta algo y seguimos."
logger = logging.getLogger(__name__)

_case_locks: dict[str, threading.Lock] = {}
_registry_lock = threading.Lock()


def _case_lock(case_id: str) -> threading.Lock:
    with _registry_lock:
        return _case_locks.setdefault(case_id, threading.Lock())


def _advisory_lock(db: Session, case_id: str) -> bool:
    """Best-effort, transaction-scoped PostgreSQL advisory lock; a no-op (always granted) on SQLite."""
    if db.bind.dialect.name != "postgresql":
        return True
    return bool(db.scalar(select(func.pg_try_advisory_xact_lock(func.hashtext(case_id)))))


@contextmanager
def _locked_turn(db: Session, case_id: str):
    lock = _case_lock(case_id)
    if not lock.acquire(blocking=False):
        raise HTTPException(409, BUSY)
    try:
        if not _advisory_lock(db, case_id):
            raise HTTPException(409, BUSY)
        yield
    finally:
        lock.release()


def reply_client_id(client_message_id: str) -> str:
    """The assistant reply's own `client_message_id`, derived from the user's so a retried request can find
    its previous reply by an exact lookup — no extra table or column, reusing the column already there."""
    return f"{client_message_id}{REPLY_SUFFIX}"


def _chat_message(row: ConversationMessage) -> ChatMessage:
    return ChatMessage(id=row.id, role=row.role, text=row.text, created_at=row.created_at,
                       client_message_id=row.client_message_id, intent=None,
                       attachment_ids=row.attachment_ids, event_ids=row.event_ids)


def _existing_turn(db: Session, record_id: str, data: ChatTurnRequest):
    """The previous (user, reply) pair for this exact `client_message_id`, if this is a retried request.
    `run_turn` commits the user message and its reply together, in one transaction, so in practice `reply`
    is only ever `None` here for a `client_message_id` that has never been processed at all — `user` is
    checked for defense in depth (never re-inserting it, which would violate its unique constraint) rather
    than because a real deployment is expected to see the two out of sync."""
    user_row = db.scalar(select(ConversationMessage).where(
        ConversationMessage.record_id == record_id, ConversationMessage.client_message_id == data.client_message_id))
    if user_row is None:
        return None, None
    reply_row = db.scalar(select(ConversationMessage).where(
        ConversationMessage.record_id == record_id,
        ConversationMessage.client_message_id == reply_client_id(data.client_message_id)))
    return user_row, reply_row


def _save_user_message(db: Session, record_id: str, data: ChatTurnRequest) -> ConversationMessage:
    row = ConversationMessage(id=str(uuid4()), record_id=record_id, role="user", text=data.text,
                              client_message_id=data.client_message_id, attachment_ids=data.attachment_ids,
                              event_ids=[], created_at=datetime.now(timezone.utc))
    db.add(row)
    db.flush()
    return row


def _recent_history(db: Session, record_id: str, limit=CONTEXT_MESSAGES) -> list[ChatMessage]:
    rows = db.scalars(select(ConversationMessage).where(ConversationMessage.record_id == record_id)
                      .order_by(ConversationMessage.created_at.desc(), ConversationMessage.id.desc())
                      .limit(limit)).all()
    return [_chat_message(row) for row in reversed(rows)]


def _run_brain(brain, db: Session, record_id: str, user_row: ConversationMessage) -> tuple[BrainStep, list[str]]:
    """The manual tool loop (at most `MAX_ROUNDS` rounds): ask the brain for its next step, run the tool it
    names through `agent/tools.py`'s single validated executor, refresh the case state, and repeat until the
    brain answers with final text — or the round cap forces one, so the person is never left without a
    reply."""
    tool_ctx = ToolContext(db=db, record_id=record_id, row=db.get(Timeline, record_id),
                           message_id=user_row.id, message_text=user_row.text)
    round_results: list[RoundResult] = []
    history = _recent_history(db, record_id)
    for _ in range(MAX_ROUNDS):
        case_state = build_case_state(db, record_id)
        step = brain.next_step(RoundContext(case_state=case_state, recent_messages=history, user_text=user_row.text,
                                            attachment_ids=user_row.attachment_ids, round_results=round_results))
        if step.tool_call is None:
            return step, tool_ctx.touched_event_ids
        result = execute(step.tool_call.name, step.tool_call.arguments, tool_ctx)
        round_results.append(RoundResult(name=step.tool_call.name, arguments=step.tool_call.arguments,
                                         content=result.content, is_error=result.is_error))
    return BrainStep(tool_call=None, reply_text=ROUND_LIMIT_TEXT), tool_ctx.touched_event_ids


def _save_reply(db: Session, record_id: str, data: ChatTurnRequest, step: BrainStep, touched: list[str]) -> ConversationMessage:
    row = ConversationMessage(id=str(uuid4()), record_id=record_id, role="assistant",
                              text=step.reply_text or ROUND_LIMIT_TEXT, client_message_id=reply_client_id(data.client_message_id),
                              attachment_ids=[], event_ids=touched, created_at=datetime.now(timezone.utc))
    db.add(row)
    db.flush()
    return row


def _response(db: Session, record_id: str, user_row, reply_row, mode, suggested_actions=()) -> ChatTurnResponse:
    return ChatTurnResponse(user_message=_chat_message(user_row), assistant_message=_chat_message(reply_row),
                            touched_event_ids=reply_row.event_ids, suggested_actions=list(suggested_actions),
                            case_state=build_case_state(db, record_id), mode=mode)


def _claude_or_fallback(db: Session, record_id: str, data: ChatTurnRequest, existing_user, brain):
    """Runs this turn's brain loop; on `BrainError` (see the module docstring), discards everything this
    attempt staged and reruns the whole turn with a fresh `ScriptedBrain`. Returns `(user_row, step, touched,
    mode)` — a fresh `user_row` too, since a rollback expires (and, if it was only flushed and never
    committed by this attempt, discards) the one already saved."""
    user_row = existing_user or _save_user_message(db, record_id, data)
    try:
        step, touched = _run_brain(brain, db, record_id, user_row)
        return user_row, step, touched, brain.mode
    except BrainError as error:
        logger.warning("%s failed this turn (%s); falling back to ScriptedBrain", type(brain).__name__, error)
        db.rollback()
        fallback = ScriptedBrain()
        user_row = existing_user or _save_user_message(db, record_id, data)
        step, touched = _run_brain(fallback, db, record_id, user_row)
        return user_row, step, touched, fallback.mode


def run_turn(db: Session, record_id: str, data: ChatTurnRequest, brain=None) -> ChatTurnResponse:
    """The whole per-record, idempotent, tool-using turn described in the module docstring. Commits exactly
    once, after every tool call in this turn's loop already succeeded (or the brain's final step needed no
    tool at all) — a per-case lock during the whole call is what makes that single commit race-free without
    needing a client-supplied revision, unlike the plain HTTP timeline endpoints.

    `brain` defaults to `get_brain()` (the configured `CHAT_BRAIN`), exactly as before this parameter existed
    — every HTTP call site keeps passing none. EST-07 (issue #13) added the parameter only so the demo seed
    (`app/seed.py::ensure_conversation`) can force a fresh `ScriptedBrain` for María's seeded conversation
    regardless of whatever `CHAT_BRAIN` the environment has configured (so seeding never depends on, or
    silently calls, a real provider).

    Idempotency note: replaying a `client_message_id` returns the exact same persisted `user_message`,
    `assistant_message` text and `event_ids`, and a `case_state` re-derived from that same persisted data —
    everything that actually changed the case. `suggested_actions` is the one field this does not replay
    (it is never persisted, being a transient per-turn UI hint); a retried request gets an empty list for it
    instead of the original one."""
    brain = brain or get_brain()
    with _locked_turn(db, record_id):
        existing_user, existing_reply = _existing_turn(db, record_id, data)
        if existing_user is not None and existing_reply is not None:
            return _response(db, record_id, existing_user, existing_reply, brain.mode)

        user_row, step, touched, mode = _claude_or_fallback(db, record_id, data, existing_user, brain)
        reply_row = _save_reply(db, record_id, data, step, touched)
        db.commit()
        return _response(db, record_id, user_row, reply_row, mode, step.suggested_actions)
