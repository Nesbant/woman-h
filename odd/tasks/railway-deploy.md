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
- [x] T5 (user decision 2026-09-26: production runs without demo mode; chat AND "Entender" both use OpenRouter)
      `OpenRouterTimelineAdapter` (`app/timeline_ai.py`) + `app/timeline_prompt.py`: proposes the private timeline
      through OpenRouter's Chat Completions API (same endpoint/model/fallback/timeout/provider settings as the
      chat brain, `TIMELINE_MODEL` optional override defaulting to `CHAT_MODEL`), strict `response_format`
      json_schema matching exactly what `proposals.verify` consumes. Any failure raises and the existing
      `fallback_chain` (this adapter -> `demo_fixture.json`, demo only -> extractive) takes over unchanged.
- [x] T6 Production seed (`python -m app.seed_production`): idempotent accounts for María (full case), the
      Empresa Andina reviewer (Lucía) and a plain real-use account, all from `SEED_*` env vars, without
      `DEMO_ENABLED`. `SEED_ON_START` (`main.py` lifespan) as the Railway-volume workaround for T7.
- [x] T7 Railway `preDeployCommand`/`SEED_ON_START` decision, README variables + setup steps, `.env.example`.
- [x] T8 Docker check against a disposable `vera_deploycheck` database in `woman-h-db-1`.

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

- 2026-09-26 (new writer, worktree `woman-h-worktrees/openrouter`, branch `feat/conversation-core-esteban`):
  picked up the last backend/deploy pieces per user decisions (Railway with the existing config; production
  without demo mode; chat AND "Entender" both use OpenRouter; María's account + a real-use account + Lucía's
  reviewer account at Empresa Andina). Baseline verified first: SQLite 216 passed/1 skipped,
  PostgreSQL (`vera_test`) 217 passed.

  T5 done: `OpenRouterTimelineAdapter` added directly to `timeline_ai.py` (alongside the other adapters, same
  file the Protocol and every other implementation already lives in) plus a new `app/timeline_prompt.py`
  (`TIMELINE_SYSTEM_PROMPT`, frozen/never interpolated, same prefix-caching rationale as `agent/prompt.py`).
  Reuses `openrouter_base_url`/`openrouter_timeout_seconds`/`openrouter_http_referer`/`openrouter_x_title`/
  `chat_fallback_models`/`provider.require_parameters`+`sort` from the chat brain's settings; new
  `config.py::timeline_model` (optional, defaults to `chat_model` when unset). Strict `response_format` json
  schema (`EVENT_PROPOSAL_SCHEMA`/`REVIEW_ITEM_PROPOSAL_SCHEMA`/`TIMELINE_PROPOSAL_SCHEMA`) built to match
  exactly the fields `proposals.verify_event`/`verify_review_item` read (title/description/date_kind/
  event_date/approximate_date/event_time/source_ids/support_quotes for events; kind/message/source_ids/
  support_quotes/action_label/resolution_note for review items) — derived by re-reading `demo_fixture.json`
  and `proposals.py` line by line, not guessed. `MAX_TIMELINE_EVENTS`/`MAX_TIMELINE_REVIEW_ITEMS` duplicate
  `proposals.MAX_EVENTS`/`MAX_REVIEW_ITEMS` (12/10) rather than importing them: `proposals.py` already imports
  `fallback_chain` from `timeline_ai.py`, so the reverse import would be circular.

  The adapter's `propose()` raises on any failure (missing key, HTTP error via `response.raise_for_status()`,
  a refusal, `length`/`content_filter`, malformed JSON, a schema-shape mismatch) rather than defining its own
  error type: `proposals.propose()`'s existing `except Exception: continue` loop already treats every
  adapter's failure identically, and `fallback_chain()` already appends `FixtureAdapter` (demo-only) then
  `ExtractiveAdapter` after whatever `TIMELINE_AI_FACTORY` names — so `TIMELINE_AI_FACTORY=
  app.timeline_ai:OpenRouterTimelineAdapter` needed no change to either function, only the new adapter class
  itself. Source text reaches the provider through one user message wrapped in an untrusted-data marker
  (`"[Fuentes: DATOS NO CONFIABLES..."`), mirroring `agent/openrouter.py::_current_message`'s approach for the
  chat brain, never inside the frozen system prompt.

  `backend/tests/test_timeline_ai_openrouter.py` (new, `httpx.MockTransport`, no network, same pattern as
  `test_agent_llm.py`): request shape (strict `response_format` json schema, `models` fallback array,
  `provider.require_parameters`, `Authorization: Bearer`, system prompt byte-identical across calls), a
  dedicated model-override test (`TIMELINE_MODEL` beats `CHAT_MODEL` when set), a valid response verified and
  stored end-to-end through `/timeline/analyze`, an invented quote *and* an unsupported claimed exact date
  both dropped by `verify()` in the same test (plus a judgment-language review item dropped separately),
  provider failure (HTTP 503) falling back to `fixture` mode for María's seeded case and to `extractive` mode
  for an unrelated case, a missing key never even attempting the network, and a prompt-injection attempt
  embedded in the person's own evidence text: the (simulated adversarial) fake response is written as if the
  provider had obeyed the injection, and the test asserts the judgment-language event it "proposed" never
  survives `verify()`, while the source text itself still reached the provider byte-for-byte inside the
  untrusted-data envelope (proving the defense is server-side verification, not prompt wording). One dead end
  worth recording: the first version of that last test asserted the *whole* injected sentence appeared as one
  substring in the outgoing request; it actually reached the provider correctly, just split into two separate
  per-sentence JSON array entries by `sources.collect()` (existing, adapter-independent behavior) — fixed the
  assertion, not the code, after confirming with a standalone script that `sources.collect()` really does
  return both fragments.

  `pytest tests/test_timeline_ai_openrouter.py tests/test_timeline.py`: 21 passed. Full suite SQLite: 224
  passed / 1 skipped (baseline 216/1, +8 new). Also normalized a bare `postgresql://` `DATABASE_URL` to
  `postgresql+psycopg://` in `config.py`'s validator (needed for T7's Railway variable, verified separately
  there) — `config.py` previously only accepted the `+psycopg` scheme outside tests, which is not what
  Railway's own Postgres reference variable produces.

  T6 done: `app/seed_production.py` (new) — `python -m app.seed_production`, idempotent, safe on every
  deploy, no refactor to `seed.py` needed beyond straight reuse: its building blocks (`ANDINA`,
  `ensure_profile`, `ensure_record`, `attach_missing_files`, `ensure_conversation`, `seed_history`) were
  already demo-agnostic — only `seed()`/`require_demo()`/`seed_demo_case()` (the top-level entry points) gate
  on `DEMO_ENABLED`, and `seed_production.py` never calls any of those three. New `config.py` fields:
  `seed_maria_email`/`seed_maria_password`, `seed_reviewer_email`/`seed_reviewer_password`,
  `seed_user_email`/`seed_user_password`/`seed_user_name`, `seed_on_start`. Each of the three accounts is
  skipped entirely when its email/password pair is missing; every password is checked against the same
  16-character minimum `seed.py::seed()` already enforces for `DEMO_PASSWORD` (`validated_password`, raises
  `RuntimeError` otherwise — an interrupted deploy that never seeded anything is safer than one that silently
  accepted a weak password). `ensure_account` only ever creates a `User` when no row with that email exists
  yet; it never updates an existing one's password, name or id, so a later change to a `SEED_*` env var is a
  no-op against an account that's already there. María gets a stable `PrivateRecord` id
  (`stable_id("maria-situacion:" + user.id)`, `uuid5` under a `"vera-production:"` namespace kept deliberately
  separate from `seed.py::demo_id`'s `"vera-demo:"` one, so a production id can never collide with a
  fictional demo id) so `ensure_record`/`attach_missing_files`/`ensure_conversation` stay idempotent across
  deploys exactly like they already are for `seed_demo_case()`. The real-use account gets nothing beyond the
  `User` row itself — confirmed by reading `profile.py`/`records.py`: both `Profile` and `PrivateRecord` are
  created lazily by the app on first use (`PUT /api/profile`, `POST /api/records`), so a brand-new sign-up
  never has either one either.

  Everything runs inside one `with SessionLocal() as db: ... db.commit()` block with a single commit at the
  end (matching `seed_demo_case()`'s own transaction shape): if any step raises (e.g. a too-short password)
  before that final `db.commit()`, closing the session without committing rolls back everything staged so
  far, including an earlier step's already-`flush()`-ed rows — a partially-bad `SEED_*` configuration creates
  zero accounts rather than two out of three, so a fixed re-run starts from nothing rather than a stuck
  partial state.

  `backend/tests/test_seed_production.py` (new): all vars missing skips every account; a partial set seeds
  only the configured ones; runs correctly under `demo_enabled=False` (proving no `DEMO_ENABLED` dependency);
  María's full case (one `PrivateRecord`, her three evidence files, four conversation messages, an Andina
  profile) plus Lucía's reviewer `Membership` at that same institution plus the three historical
  `InstitutionalCase` rows (V-001..V-003); all three seeded accounts can actually log in over the real
  `/api/auth/login` endpoint; the real-use account has no `Profile`, no `PrivateRecord` and no `Membership`;
  a second run with different `SEED_*` values changes nothing (same account ids, original password still
  verifies, the new password does not, no duplicate `PrivateRecord`); a too-short password raises and leaves
  every table untouched (the atomicity guarantee above). Plus `main.py`'s `lifespan` wiring: `SEED_ON_START`
  makes `TestClient(app)`'s startup (the same event a real process start fires) run the production seed once.

  `pytest tests/test_seed_production.py`: 9 passed. Full suite SQLite: 233 passed / 1 skipped (baseline
  224/1 after T5, +9, no regressions).

  T7 done: verified against Railway's own docs (`docs.railway.com/guides/pre-deploy-command`, fetched this
  session) that `preDeployCommand` "execute[s] in a separate container from your application. Changes to the
  filesystem are not persisted and volumes are not mounted." — so `railway.json` keeps `preDeployCommand` as
  migrations-only (`alembic upgrade head`, unchanged) and the production seed runs through `SEED_ON_START`
  (T6) instead, in the real container where the volume is attached. README: full Railway variables table
  (`DATABASE_URL` with both the explicit PG*-built form and a note about referencing `${{Postgres.
  DATABASE_URL}}` directly now that `config.py` normalizes a bare `postgresql://`; `APP_ENV`, `ALLOWED_ORIGINS`,
  `COOKIE_SECURE`, `DEMO_ENABLED=false`, `STORAGE_ROOT` note, `CHAT_BRAIN=openrouter`, `OPENROUTER_API_KEY`,
  `CHAT_MODEL`/`CHAT_FALLBACK_MODELS`, `TIMELINE_AI_FACTORY=OpenRouterTimelineAdapter`, `TIMELINE_MODEL`, all
  six `SEED_*` vars, `SEED_ON_START`), a new "Migraciones y semilla" section explaining the
  `preDeployCommand`/`SEED_ON_START` split with the verified quote, and a 4th "Servicios a crear" step
  (variables → Generate Domain → paste into `ALLOWED_ORIGINS` → redeploy). Also fixed a stale
  `CHAT_BRAIN`/`ANTHROPIC_API_KEY` line left over from before the OpenRouter migration (EST-05 revised) that
  the general variables table and Railway section had both kept; `rg -n -i anthropic` now only matches
  historical/explanatory prose in `agent/openrouter.py`, same as `conversational-vera.md` already recorded.
  `.env.example`: `SEED_*` vars + `SEED_ON_START` added (T5's `TIMELINE_MODEL`/`OpenRouterTimelineAdapter`
  option was already added when T5 landed).

  T8 done, and it caught a real bug: `docker build -t vera-deploycheck .` succeeded (no `frontend/dist`
  present on disk this time, so no `COPY contracts/` repeat was needed). Created a disposable
  `vera_deploycheck` database in `woman-h-db-1` (`docker exec woman-h-db-1 createdb -U vera
  vera_deploycheck`). Ran the exact `preDeployCommand` (`cd /app/backend && python -m alembic upgrade head`)
  in a throwaway container with `APP_ENV=production`, `COOKIE_SECURE=true`, `DEMO_ENABLED=false`,
  `ALLOWED_ORIGINS=["https://example.test"]`, `CHAT_BRAIN=openrouter` (no `OPENROUTER_API_KEY`),
  `--network host` (reaches `localhost:5432`) and a tmp-dir volume at `/data` — 18 tables created, exit 0.

  **First run failed** starting the real server with `SEED_ON_START=true` +
  `SEED_MARIA_EMAIL`/`SEED_REVIEWER_EMAIL`/`SEED_USER_EMAIL` set: `IntegrityError:
  ForeignKeyViolation … institutional_cases_assignee_id_fkey`. Root cause: `seed.py::HISTORY`'s three
  historical cases hardcode their assignee as `demo_id("andrea@example.test")`/`demo_id("carlos@example.test")`
  — real `User` rows that only exist after `app.seed.seed()` (the *demo user* seed) has run, which
  `seed_production.py` deliberately never calls. SQLite never caught this because this project does not
  enable `PRAGMA foreign_keys` for it (checked `app/db.py`: no such pragma), so `test_seed_production.py`'s
  SQLite-only tests passed while silently leaving a production-breaking bug — exactly the kind of gap this
  Docker-against-real-PostgreSQL check exists to catch.

  Fix: `seed.py::history_case`/`seed_history` gained an optional `assignee_id` override (default `None` →
  unchanged existing behavior, `demo_id(spec.assignee)`, so demo mode is untouched). `seed_production.py::
  seed_maria` now passes `reviewer.id` (the real `SEED_REVIEWER_*` account) when configured, or falls back to
  the same inactive, non-loginable placeholder `ensure_history_user` already uses for the historical
  submitter — so historical cases never reference a demo-only identity that doesn't exist in production.
  Added `test_marias_history_seeds_without_a_configured_reviewer` (SQLite) covering the no-reviewer fallback,
  plus re-ran `test_seed_production.py`/`test_timeline.py`/`test_timeline_ai_openrouter.py` against real
  PostgreSQL (`vera_test`) to confirm the FK path specifically: 31 passed.

  Re-built the image, recreated `vera_deploycheck`, re-ran migrations, then started the real server
  (`docker run -d`, same production-like env, `TIMELINE_AI_FACTORY=app.timeline_ai:OpenRouterTimelineAdapter`,
  `PORT=8099`) — logs showed "Semilla de producción aplicada" and clean startup. `curl` (run from a throwaway
  `--network host` container, since this session's own shell sits in a separate network namespace that
  cannot reach a `--network host` container's bound port directly — confirmed by first getting a false
  "connection refused" from this shell, then getting `200` for the identical request from inside another
  `--network host` container) against `/api/health` → `{"status":"ok","demo":false}`; `/` → `200` (SPA
  `index.html`). Logged in as `maria-deploycheck@example.test` via `POST /api/auth/login` with `Origin:
  https://example.test` and `X-VERA-Request: 1` (a small Python `http.client` script, since the slim runtime
  image has neither `curl` nor `wget`): `GET /api/records` → exactly 1 record ("Situación #001"); `GET
  /api/records/{id}/files` → exactly 3 files (`captura_01.png`, `correo_01.pdf`, `captura_02.png`). DB spot
  check: only 4 `users` rows total (María, Lucía, the real-use account, the inactive `historial@example.test`
  placeholder — no `ana@example.test`/`andrea@example.test`/etc.), and all three `institutional_cases` rows
  (`V-001`/`V-002`/`V-003`) correctly `assignee_id`-linked to Lucía's real account id.

  Cleanup: stopped/removed `vera-deploycheck-server`, `docker exec woman-h-db-1 dropdb -U vera
  vera_deploycheck` (confirmed gone from `psql -U vera -lqt`), cleared the tmp volume directory (needed an
  `alpine` container to `rm -rf` it as root — the app's own container runs as root per T2's documented
  Railway-volume tradeoff, so files it wrote were root-owned on the host), removed the `vera-deploycheck`
  image (`docker rmi`). Worktree left clean (`git status` clean besides the intended source edits; no stray
  `frontend/dist`).

  Final verification this session: SQLite 234 passed / 1 skipped (baseline 233/1, +1 from the no-reviewer
  fallback test); PostgreSQL (`vera_test`) 235 passed (baseline 234, +1). `frontend/tsc -b`/`vitest` not run —
  no frontend changes this session, and `frontend/node_modules` does not exist in this worktree (only in the
  main checkout), matching the earlier writer's own note in T2/T3's verification. Real-provider smoke against
  OpenRouter (`OpenRouterBrain`/`OpenRouterTimelineAdapter`) is not possible: no `OPENROUTER_API_KEY` in this
  environment.

## Next step
All four tasks (T5–T8) done. User: set the six `SEED_*` variables (and `SEED_ON_START=true`) plus
`CHAT_BRAIN=openrouter`/`TIMELINE_AI_FACTORY=app.timeline_ai:OpenRouterTimelineAdapter`/`OPENROUTER_API_KEY`
on the Railway web service, then redeploy — see README "Despliegue (Railway)" for the full variable list and
setup steps. Open decision (unchanged): demo mode is rejected under `APP_ENV=production`.
