# VERA MVP circuit — Private → AI → Draft → Selection → Submit → Institutional

Locator: `odd/tasks/vera-mvp-circuit.md` · Engram mirror: `odd/vera-mvp-circuit/tasks`

## Objective
Implement the SPEC.md P0 circuit on top of the existing repo (reuse auth, PrivateRecord,
Account, RecordFile + SHA-256, Timeline review/versioning). Single URL demo with synthetic data.

## Problem / why
The repo covers private records, files and an extractive timeline. It lacks structured AI events
with review items, the complaint draft, the explicit share/submit bridge, and institutional case
management. SPEC §39–42 define the minimal new pieces.

## Scope (authorized)
- Backend: extend timeline AI contract, `complaints.py`, `institutional.py`, models
  `ComplaintDraft`, `InstitutionalCase`, `CaseFile`, migration `0007_complaints_cases.py`,
  demo seed + `demo_fixture.json`, boundary tests.
- Frontend: `Complaint.tsx`, `Institutional.tsx`, timeline review items / multi-source.
- README simplification (SPEC §38).

## Constraints
- AI never invents data; every event must cite existing sources (support quotes verified server-side).
- Nothing AI-generated becomes confirmed automatically.
- Institutional never lists/counts/opens Private. No FK InstitutionalCase → PrivateRecord.
- Snapshot is immutable after submit; copied files keep identical SHA-256.
- AI fallback: configured adapter → `demo_fixture.json` → deterministic extractive.
- No chatbot, scoring, sanctions, MTPE integration, zero-access claims.

## TDD
Mode: off (no project/session TDD configuration found; ordinary functional checks per task).
Runners: `backend/.venv/bin/python -m pytest` (in `backend/`), `npx vitest run src` (in `frontend/`).
Baseline: 98 passed / 1 skipped (backend), 22 passed (frontend).

## Tasks
- [x] T1 Timeline AI → structured events (`source_ids`, `support_quotes`, `review_items`), fixture + fallback chain, image descriptions as sources, unlinked-evidence review items
- [x] T2 Models + migration 0007 (ComplaintDraft, InstitutionalCase, CaseFile, timelines.review_items)
- [x] T3 Complaint draft API: generate from confirmed timeline only, edit, mark reviewed; missing fields never invented
- [x] T4 Submit Private → Institutional: ownership, revision, selected events/files only, snapshot, hash-preserving copy, case_id V-NNN
- [x] T5 Institutional API: list/detail/assign/status/procedure checklist/file download, membership-scoped
- [x] T6 Boundary tests (SPEC Issue 7)
- [x] T7 Demo seed (record, relato, captura, correo PDF) + demo_fixture.json
- [x] T8 Frontend Timeline: multi-source events + review items
- [x] T9 Frontend Complaint.tsx: six sections, missing fields, edit, sources; share/keep-private selection; confirm & submit
- [x] T10 Frontend Institutional.tsx: counters, table, detail, assign, status, checklist
- [x] T11 README simplification
- [x] T12 End-to-end demo check
- [x] T13 PR #1 review fixes (accepted by user 2026-09-25):
  - [x] R1 Fixture only in demo mode and only when every quote matches (prevented invented facts on real data)
  - [x] R2 Submit rejects drafts that no longer match the confirmed timeline; Share shows it
  - [x] R3 Share preselects only files that still exist
  - [x] R4 Demo seed repairs a partially created case

## Acceptance criteria
SPEC §54 checklist.

## Progress / evidence
- T1–T7 (backend) done. `pytest`: SQLite 115 passed / 1 skipped; PostgreSQL 17 116 passed.
  New tests: `tests/test_timeline.py` (7), `tests/test_cases.py` (10).
- Pre-existing bug fixed: `app/pdf_text.py` used `with document[n] as page`, unsupported by pinned
  pypdfium2 5.13 → PDF text extraction always failed silently. Now closes pages explicitly.
- Default adapter is now `FixtureAdapter`; chain: configured → fixture → extractive (`timeline_ai.fallback_chain`).
- Image evidence enters the timeline through the person's own file description (no OCR).
- Snapshot never includes record id, relato quotes or unselected file names ("Evidencia no compartida").
- Regulatory deadlines: only the two stated in SPEC (1 and 3 business days) are shown; others left without reference on purpose.
- AuditEvent (P1) not implemented.
- T8–T10 frontend done: `Timeline.tsx` (multi-source, review items, "Preparar reporte"), `Complaint.tsx`
  (Complaint + Share), `Institutional.tsx`; routes `registros/:id/queja|compartir`. Vitest 25 passed (5/5 runs), build OK.
- Honesty fix: event origin label now "Propuesto por VERA" (was "Propuesto por IA" even in fixture mode).
- Flakiness: new test files pushed pre-existing userEvent tests past 5 s under parallel load (original suite alone is stable);
  set `test.testTimeout = 15000` in `vite.config.ts`.
- T11 README rewritten per SPEC §38.
- T12 end-to-end verified on PostgreSQL 17 via HTTP script and Playwright UI run: fixture → 4 sourced events → 3 review
  items → confirmed → draft with honest gaps → V-001 → institution list/detail/assign/checklist; copied hashes match;
  reviewer gets 404 on every private route. Screens reviewed manually.
- Known cosmetic: 🔒🔗📎 render as boxes in headless Chromium on WSL (no emoji font); fine in normal browsers.

- T13 review fixes: each test observed RED on pre-fix code, then GREEN. Commits 3c6ee25, 087cf85, e5f5817, ac2c96f,
  each verified in an isolated worktree. Final: pytest PostgreSQL 120 passed, SQLite 119 passed / 1 skipped; vitest 27 (5/5); build OK.
- GitHub Actions: enabled but no runs trigger on the repo (not even the initial import); not investigated/changed.

## Next step
Human review + commit split (not done: user did not request commits). P1 candidates: AuditEvent, Claude API adapter
for real AI, private-side "sent as V-00N" indicator, supplements (SPEC §26).
