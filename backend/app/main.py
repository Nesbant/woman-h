from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session as DBSession
from .config import settings
from .db import get_db
from .records import router as records_router
from .accounts import router as accounts_router
from .files import router as files_router
from .start import router as start_router
from .timeline import router as timeline_router
from .auth import router as auth_router
from .drafts import router as drafts_router
from .submission import organizations as organizations_router, router as submission_router
from .institutional import router as institutional_router
from .overview import router as overview_router
from .profile import router as profile_router

config = settings()
app = FastAPI(title="VERA · API", docs_url="/api/docs" if config.app_env != "production" else None, redoc_url=None)
app.include_router(auth_router)
app.include_router(records_router)
app.include_router(accounts_router)
app.include_router(files_router)
app.include_router(start_router)
app.include_router(timeline_router)
app.include_router(drafts_router)
app.include_router(submission_router)
app.include_router(organizations_router)
app.include_router(institutional_router)
app.include_router(overview_router)
app.include_router(profile_router)
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


@app.get("/api/health")
def health(db: DBSession = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ok", "demo": config.demo_enabled}
