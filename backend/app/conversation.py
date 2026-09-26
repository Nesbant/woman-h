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
from .agent.contracts import CaseState, ChatTurnRequest, ChatTurnResponse, ConversationView
from .db import get_db
from .models import PrivateRecord, User
from .records import RecordInput, add_record, owned_record
from .security import current_user

router = APIRouter(tags=["Conversación"])
EXAMPLES = Path(__file__).resolve().parents[2] / "contracts" / "examples"


def load_example(name, model):
    """Reads and validates a frozen example, so a broken fixture fails at import time, not mid-request."""
    return model.model_validate(json.loads((EXAMPLES / name).read_text(encoding="utf-8")))


def for_case(state: CaseState, case_id: str) -> CaseState:
    """A stub example always answers for the record the person actually opened, never a fixed id."""
    return state.model_copy(update={"case_id": case_id})


@router.post("/api/conversations", status_code=201)
def start_conversation(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Creates the private situation the conversation lives in (decision D1, odd/tasks/conversational-vera.md):
    a case is an existing `PrivateRecord`, so this needs no new table. EST-01 fills its title from the first message."""
    count = db.scalar(select(func.count()).select_from(PrivateRecord).where(PrivateRecord.owner_id == user.id))
    record = add_record(db, user, RecordInput(title=f"Conversación #{count + 1:03d}",
                                              description="Conversación iniciada desde el chat."))
    db.commit()
    return {"case_id": record.id}


@router.get("/api/records/{record_id}/conversation", response_model=ConversationView)
def read_conversation(record_id: UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    owned_record(db, record_id, user)
    view = load_example("conversation.json", ConversationView)
    return view.model_copy(update={"case_id": str(record_id), "case_state": for_case(view.case_state, str(record_id))})


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
