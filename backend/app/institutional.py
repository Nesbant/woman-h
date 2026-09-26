"""VERA Institutional: only escalated snapshots. Nothing here reads private tables (SPEC §11, §42)."""
from datetime import datetime, timezone
from typing import Literal
from urllib.parse import quote
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.orm import Session
from .db import get_db
from .files import private_bytes
from .models import CASE_STATUSES, InstitutionalCase, Membership, User
from .procedure import STEPS, procedure_view
from .security import current_user, require_membership
from .storage import PrivateStorage, get_storage

router = APIRouter(prefix="/api/institutions/{institution_id}/cases", tags=["Institutional"])
STEP_KEYS = tuple(key for key, _, _ in STEPS)


class Assignee(BaseModel):
    model_config = ConfigDict(extra="forbid")
    assignee_id: UUID | None


class Status(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal[CASE_STATUSES]


class Step(BaseModel):
    model_config = ConfigDict(extra="forbid")
    done: bool


def utc(value):
    return value.replace(tzinfo=value.tzinfo or timezone.utc).astimezone(timezone.utc).isoformat() if value else None


def names(db, ids):
    ids = {value for value in ids if value}
    return {user.id: user.name for user in db.scalars(select(User).where(User.id.in_(ids)))} if ids else {}


def summary(case, people):
    return {"case_id": case.case_id, "submitted_at": utc(case.submitted_at), "status": case.status,
            "assignee": {"id": case.assignee_id, "name": people.get(case.assignee_id)} if case.assignee_id else None}


def member_case(db, institution_id, case_id, user, lock=False):
    require_membership(db, user.id, str(institution_id))
    query = select(InstitutionalCase).where(InstitutionalCase.institution_id == str(institution_id),
                                            InstitutionalCase.case_id == case_id)
    case = db.scalar(query.with_for_update() if lock else query)
    if case is None:
        raise HTTPException(404, "Caso no encontrado")
    return case


def detail(db, case):
    members = db.execute(select(User.id, User.name).join(Membership, Membership.user_id == User.id)
                         .where(Membership.institution_id == case.institution_id).order_by(User.name)).all()
    people = names(db, [case.assignee_id, *(step.get("done_by") for step in case.procedure_json.values())])
    procedure = [{**step, "done_by": {"id": step["done_by"], "name": people.get(step["done_by"])} if step["done_by"] else None}
                 for step in procedure_view(case.procedure_json)]
    return {**summary(case, people), "snapshot": case.snapshot_json, "procedure": procedure,
            "files": [{"id": item.id, "filename": item.filename, "media_type": item.media_type, "sha256": item.sha256}
                      for item in case.files],
            "members": [{"id": member_id, "name": name} for member_id, name in members]}


@router.get("")
def list_cases(institution_id: UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_membership(db, user.id, str(institution_id))
    cases = db.scalars(select(InstitutionalCase).where(InstitutionalCase.institution_id == str(institution_id))
                       .order_by(InstitutionalCase.submitted_at.desc(), InstitutionalCase.case_id.desc())).all()
    people = names(db, [case.assignee_id for case in cases])
    counts = {status: sum(case.status == status for case in cases) for status in CASE_STATUSES}
    return {"counts": {"received": len(cases), **counts}, "items": [summary(case, people) for case in cases]}


@router.get("/{case_id}")
def get_case(institution_id: UUID, case_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return detail(db, member_case(db, institution_id, case_id, user))


@router.put("/{case_id}/assignee")
def assign(institution_id: UUID, case_id: str, data: Assignee, user: User = Depends(current_user), db: Session = Depends(get_db)):
    case = member_case(db, institution_id, case_id, user, lock=True)
    if data.assignee_id is not None and db.get(Membership, (str(data.assignee_id), case.institution_id)) is None:
        raise HTTPException(422, "La persona responsable debe pertenecer a la organización")
    case.assignee_id = str(data.assignee_id) if data.assignee_id else None
    db.commit()
    return detail(db, case)


@router.put("/{case_id}/status")
def change_status(institution_id: UUID, case_id: str, data: Status, user: User = Depends(current_user), db: Session = Depends(get_db)):
    case = member_case(db, institution_id, case_id, user, lock=True)
    case.status = data.status
    db.commit()
    return detail(db, case)


@router.put("/{case_id}/procedure/{step}")
def mark_step(institution_id: UUID, case_id: str, step: Literal[STEP_KEYS], data: Step,
              user: User = Depends(current_user), db: Session = Depends(get_db)):
    case = member_case(db, institution_id, case_id, user, lock=True)
    # Procedure is mutable institutional tracking; the received snapshot is never touched.
    case.procedure_json = {**case.procedure_json, step: {
        "done": data.done, "done_at": datetime.now(timezone.utc).isoformat() if data.done else None,
        "done_by": user.id if data.done else None}}
    db.commit()
    return detail(db, case)


@router.get("/{case_id}/files/{file_id}/content")
def download(institution_id: UUID, case_id: str, file_id: UUID, user: User = Depends(current_user),
             db: Session = Depends(get_db), store: PrivateStorage = Depends(get_storage)):
    case = member_case(db, institution_id, case_id, user)
    item = next((value for value in case.files if value.id == str(file_id)), None)
    if item is None:
        raise HTTPException(404, "Archivo no encontrado")
    return Response(private_bytes(store, item.storage_key), media_type=item.media_type,
                    headers={"Content-Disposition": "attachment; filename*=UTF-8''" + quote(item.filename, safe=""),
                             "Content-Security-Policy": "default-src 'none'; sandbox", "Cross-Origin-Resource-Policy": "same-origin"})
