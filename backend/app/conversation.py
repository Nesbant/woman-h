"""Conversation endpoints (epic #5). FASE 0 (EST-00) froze the contract; EST-01 (persistence), EST-02
(typed events), EST-03 (`agent/state.py::build_case_state`) and EST-04 (`agent/turn.py`, the real turn
orchestrator) replaced every frozen example with the real thing. Every route sits behind the same session
and ownership checks as the rest of the private API."""
from datetime import datetime, timezone
from uuid import UUID
from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from .agent.contracts import CaseState, ChatMessage, ChatTurnRequest, ChatTurnResponse, ConversationView
from .agent.state import build_case_state
from .agent.turn import run_turn
from .db import get_db
from .models import ConversationMessage, PrivateRecord, Timeline, User
from .records import RecordInput, add_record, owned_record
from .security import current_user

router = APIRouter(tags=["Conversación"])
MAX_HISTORY = 50


@router.post("/api/conversations", status_code=201)
def start_conversation(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Creates the private situation the conversation lives in (decision D1, odd/tasks/conversational-vera.md):
    a case is an existing `PrivateRecord`, so this needs no new table. The title stays a numbered placeholder;
    naming it from what the person actually said is future work, not part of this epic's scope."""
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
    return ConversationView(case_id=str(record_id), messages=recent_messages(db, record_id),
                            case_state=build_case_state(db, record_id))


@router.post("/api/records/{record_id}/conversation/messages", response_model=ChatTurnResponse)
def send_message(record_id: UUID, data: ChatTurnRequest, user: User = Depends(current_user), db: Session = Depends(get_db)):
    owned_record(db, record_id, user)
    return run_turn(db, str(record_id), data)


@router.get("/api/records/{record_id}/conversation/state", response_model=CaseState)
def read_case_state(record_id: UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    owned_record(db, record_id, user)
    return build_case_state(db, record_id)
