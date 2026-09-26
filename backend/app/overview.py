"""Owner-only progress summary of a private record: what the home and the stepper need in one call."""
from datetime import timezone
from uuid import UUID
from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from .db import get_db
from .models import Account, ComplaintDraft, RecordFile, RecordSubmission, Timeline, User
from .records import owned_record
from .security import current_user

router = APIRouter(prefix="/api/records/{record_id}", tags=["Registros privados"])


class Note(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    private_note: str | None = Field(default=None, max_length=5000)


def utc(value):
    return value.replace(tzinfo=value.tzinfo or timezone.utc).astimezone(timezone.utc).isoformat() if value else None


@router.get("/overview")
def overview(record_id: UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    record = owned_record(db, record_id, user)
    story = db.scalar(select(Account).where(Account.record_id == record.id).order_by(Account.created_at, Account.id))
    files = db.scalar(select(func.count()).select_from(RecordFile).where(RecordFile.record_id == record.id))
    timeline = db.get(Timeline, record.id)
    events = timeline.events if timeline else []
    count = lambda status: sum(event['status'] == status for event in events)
    draft = db.scalar(select(ComplaintDraft).where(ComplaintDraft.record_id == record.id))
    submissions = db.scalars(select(RecordSubmission).where(RecordSubmission.record_id == record.id)
                             .order_by(RecordSubmission.submitted_at.desc())).all()
    return {
        "record": {"id": record.id, "title": record.title, "private_note": record.private_note,
                   "created_at": utc(record.created_at), "updated_at": utc(record.updated_at)},
        "story": {"account_id": story.id, "description": story.description} if story else None,
        "files": files,
        "timeline": {"processed": timeline is not None, "revision": timeline.revision if timeline else 0,
                     "total": len(events), "pending": count("proposed"), "accepted": count("accepted"),
                     "discarded": count("discarded"),
                     "open_review_items": sum(item['status'] == 'open' for item in (timeline.review_items or []))
                     if timeline else 0},
        "draft": {"exists": draft is not None, "reviewed": bool(draft and draft.reviewed_at),
                  "stale": bool(draft and timeline and draft.timeline_revision != timeline.revision)},
        "submissions": [{"case_id": item.case_id, "institution_name": item.institution_name,
                         "submitted_at": utc(item.submitted_at), "summary": item.summary} for item in submissions],
    }


@router.put("/note")
def update_note(record_id: UUID, data: Note, user: User = Depends(current_user), db: Session = Depends(get_db)):
    record = owned_record(db, record_id, user)
    record.private_note = data.private_note or None
    db.commit()
    return {"private_note": record.private_note}
