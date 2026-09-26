from uuid import UUID
from typing import Literal
from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from .accounts import AccountInput, add_account, edit_account, owned_account
from .db import get_db
from .models import PrivateRecord, StartEntry, User
from .records import RecordInput, add_record, edit_record, owned_record
from .security import current_user

router = APIRouter(prefix="/api/start", tags=["Inicio privado"])


class StartInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    entry_id: UUID
    text: str = Field(min_length=1, max_length=10000)
    source: Literal["text", "voice"] = "text"
    reviewed: bool = False

    @model_validator(mode="after")
    def require_voice_review(self):
        if self.source == "voice" and not self.reviewed:
            raise ValueError("El texto obtenido por voz requiere revisión explícita")
        return self


@router.post("")
def continue_from_start(data: StartInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    # PostgreSQL serializa solicitudes de la misma persona, incluidas pestañas/reintentos concurrentes.
    db.execute(select(User.id).where(User.id == user.id).with_for_update()).one()
    entry = db.get(StartEntry, (user.id, str(data.entry_id)))
    if entry is None:
        count = db.scalar(select(func.count()).select_from(PrivateRecord).where(PrivateRecord.owner_id == user.id))
        record = add_record(db, user, RecordInput(title=f"Situación #{count + 1:03d}", description=data.text))
        account = add_account(db, UUID(record.id), AccountInput(description=data.text, date_kind="unknown"))
        entry = StartEntry(user_id=user.id, entry_id=str(data.entry_id), record_id=record.id, account_id=account.id)
        db.add(entry)
    else:
        record = owned_record(db, UUID(entry.record_id), user)
        account = owned_account(db, UUID(record.id), UUID(entry.account_id), user)
        if account.description != data.text:
            edit_record(record, RecordInput(title=record.title, description=data.text))
            # Conservar la precisión de fecha y los campos opcionales editados en HU-02.
            values = {name: getattr(account, name) for name in AccountInput.model_fields}
            edit_account(account, AccountInput(**{**values, "description": data.text}))
    db.commit()
    return {"record_id": entry.record_id, "account_id": entry.account_id}
