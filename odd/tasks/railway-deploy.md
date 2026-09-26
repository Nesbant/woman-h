# Railway deploy (option A: single service)

## Objective
Deploy VERA to Railway as ONE web service (FastAPI serves the API and the built frontend) plus Railway PostgreSQL and a
persistent volume for private storage.

## Problem / why
The frontend calls relative `/api` with `credentials: 'same-origin'` and the session cookie is `SameSite=strict`,
`path=/api`, so the SPA and the API must share one origin. Uploaded files live on local disk (`LocalStorage`), so the
service needs a persistent volume. PostgreSQL is mandatory outside tests (`postgresql+psycopg://`).

## Scope
- Serve `frontend/dist` from FastAPI (static assets + SPA fallback) without shadowing `/api/*`.
- Multi-stage `Dockerfile` (Node build of the frontend, Python 3.12 runtime), `.dockerignore`.
- `railway.json`: Dockerfile builder, `preDeployCommand` = `alembic upgrade head`, healthcheck `/api/health`.
- README deploy section: Railway setup steps and required variables.

Out of scope: S3/R2 storage adapter, CDN, custom domain, CI deploy job, changing the production validator.

## Constraints
- Work only in the worktree `../woman-h-worktrees/railway-deploy` (branch `feat/railway-deploy`); another session
  works in the main checkout.
- No behavior change for local development (Vite proxy keeps working; static serving is opt-in when the dist dir exists).
- `APP_ENV=production` forbids `DEMO_ENABLED=true` (config.py validator) — left unchanged; documented.

## TDD
Mode: off (no project/session TDD configuration found; ordinary functional checks per task).
Runners: `cd backend && ../.venv/bin/python -m pytest -q`; `cd frontend && npm test && npm run build`;
`docker build .` when Docker is available.

## Tasks
- [x] T1 Backend serves the built SPA when `FRONTEND_DIST` (default `<repo>/frontend/dist`) exists; unknown non-`/api`
      GET paths fall back to `index.html`; `/api/*` 404s stay JSON; tests cover asset, fallback and API precedence.
- [x] T2 `Dockerfile` + `.dockerignore`: builds frontend, installs `backend/requirements.lock.txt`, runs uvicorn on
      `$PORT` with `--proxy-headers`; storage root points to the volume mount (`/data`).
- [x] T3 `railway.json` with builder, pre-deploy migrations, healthcheck, restart policy.
- [x] T4 README "Despliegue (Railway)" section: services, volume mount, variables (DATABASE_URL reference template,
      APP_ENV, ALLOWED_ORIGINS, COOKIE_SECURE, STORAGE_ROOT, CHAT_BRAIN/ANTHROPIC_API_KEY), demo caveat.

## Acceptance criteria
- Local dev unchanged; backend and frontend test suites pass.
- Container image serves `/` (SPA) and `/api/health` from the same origin.

## Progress / evidence
- Worktree created from `3511cda`.
- T1: added `frontend_dist: Path` (default `<repo>/frontend/dist`, env `FRONTEND_DIST`) to `backend/app/config.py`,
  resolved like `storage_root`. Added a `@app.get("/{full_path:path}")` catch-all in `backend/app/main.py`,
  registered last so real `/api/*` routes always win; reads `settings().frontend_dist` per request (not baked
  at import time) so it stays identical-to-today when the dir is missing and stays testable; blocks traversal by
  resolving the candidate path and checking `is_relative_to(dist)`. New tests in
  `backend/tests/test_frontend_dist.py` (asset served, SPA fallback, root path, `/api/unknown` stays JSON 404,
  traversal blocked, missing-dist behaves like before).
- T2: `Dockerfile` (repo root) — `node:22` stage (`npm ci && npm run build`), `python:3.12-slim` runtime
  (`pip install -r backend/requirements.lock.txt`, copies `backend/` + built `frontend/dist`), `FRONTEND_DIST=/app/frontend/dist`,
  `STORAGE_ROOT=/data/private-storage`, runs as root (documented reason: Railway volumes mount as root; kept
  simple rather than adding a non-root user + uid workaround). CMD: `sh -c "exec uvicorn app.main:app --host
  0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"` from `/app/backend`. `.dockerignore`
  added.
- T3: `railway.json` (repo root) — `build.builder: DOCKERFILE`, `deploy.preDeployCommand: "cd /app/backend &&
  python -m alembic upgrade head"`, `deploy.healthcheckPath: /api/health`, `deploy.restartPolicyType: ON_FAILURE`.
- T4: README "## Despliegue (Railway)" section added (services to create, volume at `/data`, variables table
  with the `${{Postgres.PGUSER}}`-style `DATABASE_URL` reference, `APP_ENV`, `ALLOWED_ORIGINS`, `COOKIE_SECURE`,
  demo caveat) plus `FRONTEND_DIST` row in the existing variables table. Verified via Railway docs
  (docs.railway.com/guides/variables, /reference/variables, /guides/public-networking) that cross-service
  references use `${{ServiceName.VAR}}` and that `RAILWAY_PUBLIC_DOMAIN` is a real auto-injected variable, but a
  service self-referencing its *own* `RAILWAY_PUBLIC_DOMAIN` inside its own variables is not documented/shown
  anywhere — README tells the user to paste the generated domain directly instead of asserting untested syntax.
- Verification: `cd backend && <scratch-venv>/bin/python -m pytest -q` → 214 passed, 1 skipped (pre-existing
  skip, unrelated). `cd frontend && npm ci && npm test && npm run build` → 21 tests passed, build OK (produces
  `dist/index.html` + `dist/assets/*.{js,css}`, matching the code's assumptions).
  Note: no `.venv` exists under `/home/eledesma/code/woman-h` in this environment (task doc assumed one); ran
  pytest with a throwaway venv built from `backend/requirements.lock.txt` in the scratchpad dir instead
  (read-only w.r.t. the main checkout).
- `docker build -t vera-railway-check .`: first attempt failed — `tsc -b` (part of `npm run build`) type-checks
  `frontend/src/api/chat.contract.test.ts`, which imports `../../../contracts/examples/*.json` (repo root,
  sibling of `frontend/`); the `frontend-build` stage never copied `contracts/`. Fixed by adding
  `COPY contracts/ /app/contracts/` before `WORKDIR /app/frontend` in the `Dockerfile`. Second build: **succeeded**
  (`node:22` frontend build + `python:3.12-slim` runtime, image `vera-railway-check` created).
- Building the frontend in-place (`npm run build`) for the Docker check left a real `frontend/dist` on disk in
  this worktree, which exposed a real hermeticity gap: 4 pre-existing tests in `test_files.py`
  (`test_real_file_persist_preview_download_and_no_public_storage_keys`) started failing because they assert
  `client.get('/' + raw_storage_key).status_code == 404`, and with `frontend/dist` now present the SPA
  catch-all served `index.html` (200) for that unmatched path instead (no private file content is ever
  returned — this is standard SPA-fallback behavior, not a leak — but it broke the test's literal assertion).
  This only manifests when `frontend/dist` happens to exist in the same checkout backend tests run from; real
  CI (`checks.yml`) builds the frontend in a separate job/checkout, so this would not reproduce there, but any
  developer who builds the frontend locally before running backend tests would hit it. Fixed by adding an
  `autouse` fixture `no_frontend_dist` to `backend/tests/conftest.py` that points `settings().frontend_dist` at
  a guaranteed-nonexistent path by default, so backend tests are hermetic regardless of ambient filesystem
  state; `test_frontend_dist.py`'s own `frontend_dist` fixture still overrides it per test. Re-ran the full
  backend suite after this fix: **214 passed, 1 skipped** (same pre-existing skip).

- Native assessment (RDD off): risk `high` (Dockerfile process boundary) → independent verifier ran: PASS-with-notes.
  Traversal probes (encoded `..`, `//abs`, symlink out of dist) all fall back to `index.html`; `/api/*` stays JSON
  404; `railway.json` fields valid against the live schema; pytest 214 passed, 1 skipped with `frontend/dist`
  present. Note: non-GET to unknown paths now returns 405 instead of 404 (catch-all path match); no data exposure.

## Next step
User: commit the branch, create the Railway project (Postgres + volume at `/data`), set variables per README.
Open decision: demo mode is rejected under `APP_ENV=production`.
