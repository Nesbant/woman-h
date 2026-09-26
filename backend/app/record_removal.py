"""Deleting a situation (decision D1): everything private goes; cases already sent stay with the organization.

Institutional cases hold their own frozen snapshot and their own file copies, with no reference back to the
record, so nothing here can reach or alter them.
"""
import logging
from uuid import UUID
from fastapi import APIRouter, Depends, Response
from sqlalchemy import delete, select
from sqlalchemy.orm import Session
from .db import get_db
from .models import (Account, ComplaintDraft, FileAccount, PrivateRecord, RecordFile, RecordSubmission, StartEntry,
                     Timeline, User)
from .records import owned_record
from .security import current_user
from .storage import PrivateStorage, get_storage

router = APIRouter(prefix="/api/records", tags=["Registros privados"])
logger = logging.getLogger(__name__)
# Children first; explicit deletes work the same on PostgreSQL and on SQLite without foreign-key enforcement.
PRIVATE_TABLES = (StartEntry, ComplaintDraft, Timeline, RecordSubmission, Account)


def stored_keys(db, record_id):
    files = db.scalars(select(RecordFile).where(RecordFile.record_id == record_id)).all()
    return [key for file in files for key in (file.original_key, file.preview_key)]


def delete_rows(db, record_id):
    file_ids = select(RecordFile.id).where(RecordFile.record_id == record_id)
    db.execute(delete(FileAccount).where(FileAccount.file_id.in_(file_ids)))
    db.execute(delete(RecordFile).where(RecordFile.record_id == record_id))
    for table in PRIVATE_TABLES:
        db.execute(delete(table).where(table.record_id == record_id))
    db.execute(delete(PrivateRecord).where(PrivateRecord.id == record_id))


def delete_objects(store, keys):
    """After the commit: access is already revoked, so a failed cleanup never republishes anything."""
    for key in keys:
        try:
            store.delete(key)
        except Exception:
            logger.exception("Objeto privado pendiente de limpieza: %s", key)


@router.delete("/{record_id}", status_code=204)
def delete_record(record_id: UUID, user: User = Depends(current_user), db: Session = Depends(get_db),
                  store: PrivateStorage = Depends(get_storage)):
    record = owned_record(db, record_id, user)
    keys = stored_keys(db, record.id)
    delete_rows(db, record.id)
    db.commit()
    delete_objects(store, keys)
    return Response(status_code=204)
