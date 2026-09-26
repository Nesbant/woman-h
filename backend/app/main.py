from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session as DBSession
from starlette.concurrency import run_in_threadpool
from .config import settings
from .db import get_db
from .records import router as records_router
from .accounts import router as accounts_router
from .conversation import router as conversation_router
from .files import router as files_router
from .start import router as start_router
from .timeline import router as timeline_router
from .auth import router as auth_router
from .drafts import router as drafts_router
from .submission import organizations as organizations_router, router as submission_router
from .institutional import router as institutional_router
from .overview import router as overview_router
from .profile import router as profile_router
from .record_removal import router as record_removal_router

config = settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Railway's preDeployCommand runs in a separate, ephemeral container with no volume mounted (confirmed
    # against Railway's own docs, docs.railway.com/guides/pre-deploy-command) — so the production seed, which
    # writes evidence files to the persistent volume (`STORAGE_ROOT`), cannot run there; SEED_ON_START runs it
    # here instead, once per process start, in the real container with the volume attached. Off by default;
    # `python -m app.seed_production` (or a one-off Railway run) is the alternative if this stays disabled.
    if config.seed_on_start:
        from .seed_production import run as run_seed_production
        await run_in_threadpool(run_seed_production)
    yield


app = FastAPI(title="VERA · API", docs_url="/api/docs" if config.app_env != "production" else None,
             redoc_url=None, lifespan=lifespan)
app.include_router(auth_router)
app.include_router(records_router)
app.include_router(accounts_router)
app.include_router(conversation_router)
app.include_router(files_router)
app.include_router(start_router)
app.include_router(timeline_router)
app.include_router(drafts_router)
app.include_router(submission_router)
app.include_router(organizations_router)
app.include_router(institutional_router)
app.include_router(overview_router)
app.include_router(profile_router)
app.include_router(record_removal_router)
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
    return {"status": "ok", "demo": config.demo_enabled or config.showcase_enabled}


# Railway option A: FastAPI also serves the built SPA (`frontend/dist`) so the API and the frontend share one
# origin (required by the `SameSite=strict`/`path=/api` session cookie). Registered unconditionally (not only
# when the dist dir exists at import time) and re-checked per request, so it stays testable and behaves exactly
# like today's default 404 when there is no build to serve. Declared last so every real `/api/*` route above
# still wins the match.
@app.get("/{full_path:path}")
def spa(full_path: str):
    if full_path == "api" or full_path.startswith("api/"):
        raise HTTPException(404, "Not Found")
    dist = settings().frontend_dist
    if not dist.is_dir():
        raise HTTPException(404, "Not Found")
    dist = dist.resolve()
    if full_path:
        candidate = (dist / full_path).resolve()
        if candidate.is_relative_to(dist) and candidate.is_file():
            return FileResponse(candidate)
    index = dist / "index.html"
    if not index.is_file():
        raise HTTPException(404, "Not Found")
    return FileResponse(index)
