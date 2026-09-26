"""Conversation endpoints (epic #5). FASE 0 (EST-00) freezes the contract and answers with the
examples in `contracts/examples/`: real persistence, turn orchestration and tools land in EST-01…EST-06.
Every route sits behind the same session and ownership checks as the rest of the private API."""
import json
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID
from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from .agent.contracts import CaseState, ChatMessage, ChatTurnRequest, ChatTurnResponse, ConversationView
from .db import get_db
from .models import ConversationMessage, PrivateRecord, Timeline, User
from .records import RecordInput, add_record, owned_record
from .security import current_user

router = APIRouter(tags=["Conversación"])
EXAMPLES = Path(__file__).resolve().parents[2] / "contracts" / "examples"
MAX_HISTORY = 50


def load_example(name, model):
    """Reads and validates a frozen example, so a broken fixture fails at import time, not mid-request."""
    return model.model_validate(json.loads((EXAMPLES / name).read_text(encoding="utf-8")))


def for_case(state: CaseState, case_id: str) -> CaseState:
    """A stub example always answers for the record the person actually opened, never a fixed id."""
    return state.model_copy(update={"case_id": case_id})


@router.post("/api/conversations", status_code=201)
def start_conversation(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Creates the private situation the conversation lives in (decision D1, odd/tasks/conversational-vera.md):
    a case is an existing `PrivateRecord`, so this needs no new table. The title is a placeholder until a real
    turn (EST-04) can name it from what the person actually said."""
    now = datetime.now(timezone.utc)
    count = db.scalar(select(func.count()).select_from(PrivateRecord).where(PrivateRecord.owner_id == user.id))
    record = add_record(db, user, RecordInput(title=f"Conversación #{count + 1:03d}",
                                              description="Conversación iniciada desde el chat."))
    # Started empty so the person can add facts (manual events, later tool calls) without an "analyze" step first.
    db.add(Timeline(record_id=record.id, revision=0, confirmed_revision=None, mode="empty",
                    events=[], warnings=[], review_items=[], processed_at=now))
    db.commit()
    return {"case_id": record.id}


def chat_message(row: ConversationMessage) -> ChatMessage:
    return ChatMessage(id=row.id, role=row.role, text=row.text, created_at=row.created_at,
                       client_message_id=row.client_message_id, intent=None,
                       attachment_ids=row.attachment_ids, event_ids=row.event_ids)


def recent_messages(db: Session, record_id: UUID) -> list[ChatMessage]:
    """Last `MAX_HISTORY` messages, oldest first (chat reading order)."""
    rows = db.scalars(select(ConversationMessage).where(ConversationMessage.record_id == str(record_id))
                      .order_by(ConversationMessage.created_at.desc(), ConversationMessage.id.desc())
                      .limit(MAX_HISTORY)).all()
    return [chat_message(row) for row in reversed(rows)]


@router.get("/api/records/{record_id}/conversation", response_model=ConversationView)
def read_conversation(record_id: UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    owned_record(db, record_id, user)
    # `case_state` is still EST-00's frozen example: deriving it for real (goal/people from `conversation_states`,
    # events from `Timeline` via `agent/events.py`, evidence from `RecordFile`) is `agent/state.py::build_case_state`,
    # explicitly scoped to EST-03/EST-04 (see odd/tasks/conversational-vera.md). Returning real message history here
    # while keeping that placeholder is intentional and documented, not silently stubbed.
    view = load_example("conversation.json", ConversationView)
    return view.model_copy(update={"case_id": str(record_id), "messages": recent_messages(db, record_id),
                                   "case_state": for_case(view.case_state, str(record_id))})


@router.post("/api/records/{record_id}/conversation/messages", response_model=ChatTurnResponse)
def send_message(record_id: UUID, data: ChatTurnRequest, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Stub turn: echoes what was actually sent in `user_message`, then answers with a frozen example.
    EST-04 replaces this with the real orchestrator (idempotency, tools, ScriptedBrain/Claude)."""
    owned_record(db, record_id, user)
    turn = load_example("chat_turn_register.json", ChatTurnResponse)
    sent = turn.user_message.model_copy(update={"text": data.text, "client_message_id": data.client_message_id,
                                                "attachment_ids": data.attachment_ids, "created_at": datetime.now(timezone.utc)})
    return turn.model_copy(update={"user_message": sent, "case_state": for_case(turn.case_state, str(record_id))})


@router.get("/api/records/{record_id}/conversation/state", response_model=CaseState)
def read_case_state(record_id: UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    owned_record(db, record_id, user)
    return for_case(load_example("case_state.json", CaseState), str(record_id))
