# CRUD completeness + software quality (SRP, cohesion, low coupling)

Locator: `odd/tasks/crud-and-quality.md` · Engram mirror: `odd/crud-and-quality/tasks` · Branch: `feat/crud-and-quality` (from `main` after PR #3)

## Objective
1. Close the CRUD gaps found in the audit, keeping what the SPEC requires to stay immutable.
2. Restructure code so each function does one thing, no mega components, high cohesion, low coupling —
   without changing behavior (existing tests are the safety net).

## Audit summary (2026-09-26)
- Frontend issues no `DELETE` at all. Missing flows: delete/rename situation, edit/delete evidence (description
  is the image's AI source), add/edit events (date/title), edit profile.
- Must stay immutable: institutional snapshot (SPEC §26). Out of scope: organization member management (SPEC §22).
- Hotspots: `Draft` 176 lines, `Understand` 169, `Share` 159, `Register` 158, `Shell` 86; views build API URLs
  directly. Backend `submit` 80 lines, `analyze` 52, `collect` 53; `complaints.py` mixes draft + submission,
  `timeline.py` mixes source reading + AI verification + HTTP.

## Decisions
- D1 (user, 2026-09-26): deleting a situation removes everything private (relato, files and stored bytes, note,
  timeline, draft, private receipts). Cases already sent stay intact in the organization; the UI warns first,
  naming the cases the organization keeps.
- D2 Manual events are authored by the person: source "Agregado por ti", accepted on creation, deletable.
  AI proposals are never deleted, only discarded (keeps the review trail).
- D3 Relato stays single per situation (prototype); it is edited, and deleted together with the situation.

## Constraints
Same URLs and response shapes for existing endpoints. SPEC invariants unchanged. Institutional never reads Private.

## TDD
Mode: off (no configuration). New behavior gets tests; refactors run the full suites before/after.
Runners: `backend/.venv/bin/python -m pytest -q`, `npx vitest run src`, `npm run build`, `npx playwright test`.
Baseline: pytest SQLite 127 passed / 1 skipped, PostgreSQL 128; vitest 13; e2e 1.

## Tasks
- [x] R1 Backend structure: `sources.py` + `proposals.py` out of `timeline.py`; `drafts.py` + `submission.py` out of `complaints.py`; `auth.py` out of `main.py`; small single-purpose functions
- [x] C1 Backend CRUD: DELETE situation (D1), manual events create/delete (D2), event title/date edit, tests
- [x] R2 Frontend data layer `api/*` per resource; views stop building URLs
- [x] R3 Frontend shell split (Login, Sidebar, Topbar, Stepper, routes)
- [x] R4 Register/Understand/Draft/Share/Institutional split into container hook + presentational components
- [x] C2 Frontend CRUD: rename/delete situation (warning), edit/delete evidence, add/edit/delete events, profile screen
- [x] V1 Tests (vitest + pytest), e2e extended, metrics re-measured, README

## Progress / evidence
- R1: `timeline.py` → `sources.py` (reading) + `proposals.py` (verification) + HTTP; `complaints.py` → `draft_fields.py`
  (pure section rules) + `drafts.py` (HTTP) + `submission.py` (bridge, `submit` now 6 named steps); `auth.py` out of
  `main.py`; `inspect_file` → pdf/image/clean-png helpers; seed → idempotent steps + `HistoricalCase` NamedTuple.
  Same URLs/responses; pytest 127 passed / 1 skipped after the split.
- C1: `record_removal.py` DELETE /api/records/{id} (D1); timeline POST /events + DELETE /events/{id} (manual only,
  D2); manual events edit refreshes their person source; snapshot labels them "Declaración de la persona".
  New `tests/test_crud.py` (5).
- R2–R4: `api/*` per resource (0 URLs built in views), `hooks/` (useResource, useAction, useFailure), `components/`
  (icons, PageTitle, Toast, Overlays with ConfirmDialog, SourceDrawer), `shell/` (useSession, Login, Sidebar, Topbar,
  Stepper, ViewRouter, useShellData), `views/<feature>/` container hook + presentational components.
- C2: Home rename/delete (D1 warning lists kept cases), evidence describe/delete, EventForm for add/edit (title, date
  precision, description), manual event delete, Profile view `#/perfil` (avatar + sidebar link).
- V1: vitest 18 passed (3/3 runs), build OK; e2e `demo.spec.ts` + new `crud.spec.ts` 2/2 passed 3 times on fresh data;
  pytest PostgreSQL 133 passed, SQLite 132 passed / 1 skipped. Metrics: backend max function 27 lines (was 80);
  frontend 161 functions, only hook containers 40–47 lines (was Draft 176, Understand 169, Share 159, Register 158).
  Out of scope: `VoiceCapture` (hidden, untouched, 120 lines). Not committed (user did not ask).

## Next step
User review; commit/PR on request.
