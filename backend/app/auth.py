"""Sessions, identity and space context. Opaque server-side sessions instead of JWT, so logout revokes at once."""
import secrets
import time
from typing import Literal
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import delete, select
from sqlalchemy.orm import Session as DBSession
from .config import settings
from .db import get_db
from .models import Institution, Membership, Session, User
from .security import COOKIE, DUMMY_HASH, current_user, passwords, require_membership, require_owner, token_hash

router = APIRouter(prefix="/api", tags=["Sesión"])
config = settings()


class Login(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=256)


def profile(user, db):
    memberships = db.execute(select(Membership, Institution).join(Institution).where(Membership.user_id == user.id)).all()
    return {"id": user.id, "name": user.name, "email": user.email,
            "memberships": [{"institution_id": m.institution_id, "name": i.name, "role": m.role}
                            for m, i in memberships if m.user_id == user.id]}


@router.post("/auth/login")
def login(data: Login, response: Response, request: Request, db: DBSession = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == data.email.strip().lower()))
    valid = passwords.verify(data.password, user.password_hash if user else DUMMY_HASH)
    if not valid or user is None or not user.active:
        raise HTTPException(401, "Correo o contraseña incorrectos")
    return start_session(user, response, request, db)


def start_session(user, response, request, db):
    """Opaque random token in an HttpOnly cookie; only its SHA-256 is stored, so sessions can be revoked."""
    old_token = request.cookies.get(COOKIE)
    if old_token:
        db.execute(delete(Session).where(Session.token_hash == token_hash(old_token)))
    db.execute(delete(Session).where(Session.expires_at <= int(time.time())))
    token = secrets.token_urlsafe(32)
    ttl = config.session_hours * 3600
    db.add(Session(token_hash=token_hash(token), user_id=user.id, expires_at=int(time.time()) + ttl))
    db.commit()
    response.set_cookie(COOKIE, token, httponly=True, secure=config.cookie_secure,
                        samesite="strict", max_age=ttl, path="/api")
    return profile(user, db)


DEMO_PERSONAS = {"person": "maria@example.test", "organization": "lucia@example.test"}


class DemoSwitch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    view_as: Literal["person", "organization"]


@router.post("/demo/switch")
def demo_switch(data: DemoSwitch, response: Response, request: Request, db: DBSession = Depends(get_db)):
    """Demo-only 'ver como': signs in as the synthetic person or reviewer. Disabled outside demo mode."""
    if not config.demo_enabled or config.app_env == "production":
        raise HTTPException(404, "No encontrado")
    user = db.scalar(select(User).where(User.email == DEMO_PERSONAS[data.view_as]))
    if user is None or not user.active:
        raise HTTPException(404, "Ejecuta la carga ficticia para usar la demostración")
    return start_session(user, response, request, db)


@router.post("/auth/logout", status_code=204)
def logout(request: Request, response: Response, db: DBSession = Depends(get_db)):
    token = request.cookies.get(COOKIE)
    if token:
        db.execute(delete(Session).where(Session.token_hash == token_hash(token)))
        db.commit()
    response.delete_cookie(COOKIE, path="/api", secure=config.cookie_secure, httponly=True, samesite="strict")


@router.get("/auth/me")
def me(user: User = Depends(current_user), db: DBSession = Depends(get_db)):
    return profile(user, db)


@router.get("/private/{owner_id}/context")
def private_context(owner_id: UUID, user: User = Depends(current_user)):
    require_owner(user.id, str(owner_id))
    return {"owner_id": user.id, "name": user.name, "space": "private"}


@router.get("/institutions/{institution_id}/context")
def institutional_context(institution_id: UUID, user: User = Depends(current_user), db: DBSession = Depends(get_db)):
    membership = require_membership(db, user.id, str(institution_id))
    institution = db.get(Institution, str(institution_id))
    return {"institution_id": institution.id, "name": institution.name, "role": membership.role,
            "permissions": ["institution:enter"], "case_access": False}
