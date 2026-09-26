"""The person's own confirmed profile. Prefills section I of drafts; never read by institutions directly."""
from datetime import datetime, timezone
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session
from .db import get_db
from .models import Institution, Profile, User
from .security import current_user

router = APIRouter(prefix="/api/profile", tags=["Perfil"])
FIELDS = ("document", "contact", "position", "area", "relationship")


class ProfileInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    institution_id: UUID | None = None
    document: str | None = Field(default=None, max_length=200)
    contact: str | None = Field(default=None, max_length=200)
    position: str | None = Field(default=None, max_length=200)
    area: str | None = Field(default=None, max_length=200)
    relationship: str | None = Field(default=None, max_length=200)


def profile_view(db, user):
    profile = db.get(Profile, user.id)
    institution = db.get(Institution, profile.institution_id) if profile and profile.institution_id else None
    return {"name": user.name, "email": user.email,
            "institution": {"id": institution.id, "name": institution.name} if institution else None,
            **{key: getattr(profile, key) if profile else None for key in FIELDS}}


@router.get("")
def read_profile(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return profile_view(db, user)


@router.put("")
def update_profile(data: ProfileInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if data.institution_id and db.get(Institution, str(data.institution_id)) is None:
        raise HTTPException(404, "Organización no encontrada")
    profile = db.get(Profile, user.id) or Profile(user_id=user.id)
    for key in FIELDS:
        setattr(profile, key, getattr(data, key) or None)
    profile.institution_id = str(data.institution_id) if data.institution_id else None
    profile.updated_at = datetime.now(timezone.utc)
    db.add(profile)
    db.commit()
    return profile_view(db, user)
