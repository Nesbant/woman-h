# VERA — Railway option A: one web service serves the API and the built SPA from the same origin
# (required by the SameSite=strict, path=/api session cookie). See odd/tasks/railway-deploy.md.

# ---- Stage 1: build the frontend (discarded after copying frontend/dist below) ----
FROM node:22 AS frontend-build
# `frontend/src/api/chat.contract.test.ts` imports fixtures from `../../../contracts/examples/*.json` (repo
# root, sibling of `frontend/`); `tsc -b` (part of `npm run build`) type-checks it, so `contracts/` must exist
# at that same relative location inside the build stage too.
COPY contracts/ /app/contracts/
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: runtime (FastAPI serves /api/* and the built SPA) ----
FROM python:3.12-slim AS runtime
WORKDIR /app

COPY backend/requirements.lock.txt backend/requirements.lock.txt
RUN pip install --no-cache-dir -r backend/requirements.lock.txt

COPY backend/ backend/
COPY --from=frontend-build /app/frontend/dist frontend/dist

# `config.py` resolves the project root as two parents above `backend/app`, so this /app layout keeps that
# default correct; FRONTEND_DIST is set explicitly anyway so the image does not depend on that being kept.
ENV FRONTEND_DIST=/app/frontend/dist
# Railway volumes mount under /data owned by root; running as root here avoids a permission mismatch with a
# non-root user (kept simple on purpose — see odd/tasks/railway-deploy.md for the tradeoff).
ENV STORAGE_ROOT=/data/private-storage

WORKDIR /app/backend
EXPOSE 8000
# Migrations run here, right before the server, instead of relying only on Railway's preDeployCommand
# (it did not run on the first real deploy). `alembic upgrade head` is a no-op when already current.
CMD ["sh", "-c", "python -m alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
