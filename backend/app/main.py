import secrets
import time
from uuid import UUID
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import delete, select, text
from sqlalchemy.orm import Session as DBSession
from .config import settings
from .db import get_db
from .models import Institution, Membership, Session, User
from .security import COOKIE, DUMMY_HASH, current_user, passwords, require_membership, require_owner, token_hash
from .records import router as records_router
from .accounts import router as accounts_router
from .files import router as files_router
from .start import router as start_router
from .timeline import router as timeline_router
from .complaints import organizations as organizations_router, router as complaints_router
from .institutional import router as institutional_router

config = settings()
app = FastAPI(title="VERA · API", docs_url="/api/docs" if config.app_env != "production" else None, redoc_url=None)
app.include_router(records_router)
app.include_router(accounts_router)
app.include_router(files_router)
app.include_router(start_router)
app.include_router(timeline_router)
app.include_router(complaints_router)
app.include_router(organizations_router)
app.include_router(institutional_router)
app.add_middleware(CORSMiddleware, allow_origins=config.allowed_origins,
                   allow_credentials=True, allow_methods=["GET", "POST", "PUT", "DELETE"],
                   allow_headers=["Content-Type", "X-VERA-Request"])


@app.middleware("http")
async def protect_requests(request: Request, call_next):
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        if (request.headers.get("origin") not in config.allowed_origins
                or request.headers.get("x-vera-request") != "1"):
            return JSONResponse({"detail": "Origen de solicitud no permitido"}, status_code=403)
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    return JSONResponse({"detail": "Revisa los datos de la solicitud"}, status_code=422)


class Login(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=256)


def profile(user, db):
    memberships = db.execute(select(Membership, Institution).join(Institution).where(Membership.user_id == user.id)).all()
    return {"id": user.id, "name": user.name, "email": user.email,
            "memberships": [{"institution_id": m.institution_id, "name": i.name, "role": m.role}
                            for m, i in memberships if m.user_id == user.id]}


@app.get("/api/health")
def health(db: DBSession = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ok", "demo": config.demo_enabled}


@app.post("/api/auth/login")
def login(data: Login, response: Response, request: Request, db: DBSession = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == data.email.strip().lower()))
    valid = passwords.verify(data.password, user.password_hash if user else DUMMY_HASH)
    if not valid or user is None or not user.active:
        raise HTTPException(401, "Correo o contraseña incorrectos")
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


@app.post("/api/auth/logout", status_code=204)
def logout(request: Request, response: Response, db: DBSession = Depends(get_db)):
    token = request.cookies.get(COOKIE)
    if token:
        db.execute(delete(Session).where(Session.token_hash == token_hash(token)))
        db.commit()
    response.delete_cookie(COOKIE, path="/api", secure=config.cookie_secure, httponly=True, samesite="strict")


@app.get("/api/auth/me")
def me(user: User = Depends(current_user), db: DBSession = Depends(get_db)):
    return profile(user, db)


@app.get("/api/private/{owner_id}/context")
def private_context(owner_id: UUID, user: User = Depends(current_user)):
    require_owner(user.id, str(owner_id))
    return {"owner_id": user.id, "name": user.name, "space": "private"}


@app.get("/api/institutions/{institution_id}/context")
def institutional_context(institution_id: UUID, user: User = Depends(current_user), db: DBSession = Depends(get_db)):
    membership = require_membership(db, user.id, str(institution_id))
    institution = db.get(Institution, str(institution_id))
    return {"institution_id": institution.id, "name": institution.name, "role": membership.role,
            "permissions": ["institution:enter"], "case_access": False}
