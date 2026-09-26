"""Private complaint draft HTTP API (SPEC §17). Section rules live in draft_fields."""
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID, uuid4
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from .db import get_db
from .draft_fields import AFFECTED, MEASURES, RESPONDENT, apply_edit, build_fields, pending, source_map
from .models import Account, ComplaintDraft, PrivateRecord, Profile, Timeline, User
from .records import owned_record
from .security import current_user

router = APIRouter(prefix="/api/records/{record_id}", tags=["Borrador y envío"])
STALE = "El borrador cambió en otra ventana. Recarga antes de continuar"


class FieldValue(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    value: str | None = Field(default=None, max_length=2000)


class FactEdit(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    event_id: str = Field(max_length=36)
    description: str = Field(min_length=1, max_length=2000)


class DraftEdit(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    revision: int = Field(ge=1)
    affected: dict[Literal[AFFECTED], FieldValue]
    respondent: dict[Literal[RESPONDENT], FieldValue]
    reporter_same_as_affected: bool
    reporter_name: FieldValue
    facts: list[FactEdit] = Field(max_length=50)
    consequences: FieldValue
    measures: list[Literal[tuple(MEASURES)]] = Field(max_length=len(MEASURES))
    measures_other: str | None = Field(default=None, max_length=1000)


class Revision(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: int = Field(ge=0)


def utc(value):
    return value.replace(tzinfo=value.tzinfo or timezone.utc).astimezone(timezone.utc).isoformat() if value else None


def events_of(timeline):
    return timeline.events if timeline else []


def revision_of(timeline):
    return timeline.revision if timeline else 0


def has_place(db, record_id):
    return db.scalar(select(Account.place).where(Account.record_id == str(record_id), Account.place.is_not(None))) is not None


def mentioned_people(db, record_id):
    return db.scalar(select(Account.mentioned_people).where(
        Account.record_id == str(record_id), Account.mentioned_people.is_not(None)).order_by(Account.created_at))


def draft_state(db, record_id, draft, timeline):
    base = {"timeline_revision": revision_of(timeline),
            "measure_options": [{"code": code, "label": label, "help": help} for code, (label, help) in MEASURES.items()]}
    if draft is None:
        return {**base, "draft": None}
    waiting = sum(event['status'] == 'proposed' for event in events_of(timeline))
    return {**base, "draft": {
        "revision": draft.revision, "timeline_revision": draft.timeline_revision,
        "stale": draft.timeline_revision != revision_of(timeline),
        "fields": draft.fields_json, "source_map": draft.source_map,
        "pending": pending(draft.fields_json, has_place(db, record_id), waiting),
        "reviewed": draft.reviewed_at is not None, "reviewed_at": utc(draft.reviewed_at), "updated_at": utc(draft.updated_at)}}


def find_draft(db, record_id):
    return db.scalar(select(ComplaintDraft).where(ComplaintDraft.record_id == str(record_id)))


def locked(db, record_id, user):
    """Owner check and row lock; returns the draft (or None)."""
    owned_record(db, record_id, user)
    db.execute(select(PrivateRecord).where(PrivateRecord.id == str(record_id)).with_for_update()).scalar_one()
    return find_draft(db, record_id)


def locked_draft(db, record_id, user, revision):
    draft = locked(db, record_id, user)
    if draft is None or draft.revision != revision:
        raise HTTPException(409, STALE)
    return draft


def touch(draft):
    """Any change needs a new review before sending."""
    draft.revision += 1
    draft.reviewed_at = None
    draft.updated_at = datetime.now(timezone.utc)


def respond(db, record_id, draft):
    return draft_state(db, record_id, draft, db.get(Timeline, str(record_id)))


@router.get("/complaint")
def read_draft(record_id: UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    owned_record(db, record_id, user)
    return respond(db, record_id, find_draft(db, record_id))


@router.post("/complaint/generate")
def generate(record_id: UUID, data: Revision, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Create or refresh the draft from the events accepted so far. Pending and discarded events are left out."""
    draft = locked(db, record_id, user)
    timeline = db.get(Timeline, str(record_id))
    if revision_of(timeline) != data.revision:
        raise HTTPException(409, "La cronología cambió en otra ventana. Recarga antes de continuar")
    fields = build_fields(user, db.get(Profile, user.id), events_of(timeline), mentioned_people(db, record_id),
                          draft.fields_json if draft else None)
    if draft is None:
        draft = ComplaintDraft(id=str(uuid4()), record_id=str(record_id), revision=0, created_at=datetime.now(timezone.utc))
        db.add(draft)
    draft.fields_json, draft.source_map, draft.timeline_revision = fields, source_map(fields), data.revision
    touch(draft)
    db.commit()
    return draft_state(db, record_id, draft, timeline)


@router.put("/complaint")
def edit(record_id: UUID, data: DraftEdit, user: User = Depends(current_user), db: Session = Depends(get_db)):
    draft = locked_draft(db, record_id, user, data.revision)
    fields = apply_edit(draft.fields_json, data)
    if fields is None:
        raise HTTPException(422, "Solo puedes editar hechos que revisaste")
    draft.fields_json = fields
    touch(draft)
    db.commit()
    return respond(db, record_id, draft)


@router.post("/complaint/confirm-respondent")
def confirm_respondent(record_id: UUID, data: Revision, user: User = Depends(current_user), db: Session = Depends(get_db)):
    draft = locked_draft(db, record_id, user, data.revision)
    if not draft.fields_json['respondent']['name']['value']:
        raise HTTPException(422, "No hay una identidad para confirmar")
    draft.fields_json = {**draft.fields_json, "respondent_confirmed": True}
    touch(draft)
    db.commit()
    return respond(db, record_id, draft)


@router.post("/complaint/review")
def mark_reviewed(record_id: UUID, data: Revision, user: User = Depends(current_user), db: Session = Depends(get_db)):
    draft = locked_draft(db, record_id, user, data.revision)
    draft.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    return respond(db, record_id, draft)
