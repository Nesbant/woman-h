# VERA prototype redesign — frontend rebuild + missing backend

Locator: `odd/tasks/vera-prototype-redesign.md` · Engram mirror: `odd/vera-prototype-redesign/tasks`
Source design: `VERA Prototipo.html` (bundled; unpacked for reference outside the repo).
Builds on: `odd/tasks/vera-mvp-circuit.md` (branch `feat/vera-mvp-circuit`, PR #1).

## Objective
Replace the current UI with the prototype design (sidebar shell, stepper, purple private / blue institutional
palette, Inter) across its 6 views — Mi espacio, Registrar, Entender, Preparar reporte, Revisar y compartir
(+ preview modal + Caso enviado), VERA Institutional — backed by real API data, and add the backend the
prototype needs that does not exist yet.

## Gap analysis (prototype vs current backend)
| Prototype needs | Current | Backend work |
|---|---|---|
| Section I prefilled from "Perfil confirmado por ti" (doc, contact, cargo, área, relación) | only name/email | `profiles` table + `GET/PUT /api/profile` |
| Private note, never shared | none | `private_records.private_note` + edit endpoint |
| Events with title, description, time ("16 sep · 22:43") | description only | `title`, `event_time` in AI contract (verified literally) |
| "Usar 16 sep" annotates event; "Relacionar" marks relation | status only | review items carry `event_ids`, optional `action_label`/`resolution_note` |
| Draft usable without explicit timeline confirmation; pending events excluded | confirmation required | draft from accepted events, auto-refresh when timeline changes |
| Mentioned person detected, pending confirmation | suggestions only | respondent prefill + `confirmed` flag |
| Record knows it was sent ("Caso enviado", home progress) | nothing private-side | private `record_submissions` + `GET /api/records/{id}/overview` |
| Checklist Pendiente / En curso / Completado | boolean | tri-state procedure |
| Case detail: summary, parties, events w/ titles | partial | snapshot enrichment |
| "Demo · ver como Persona / Organización" | re-login | demo-only `POST /api/demo/switch` |
| Narrative: María X., Juan X., Empresa Andina S.A.C., Lucía R., V-001..V-003 existing | Ana/Aurora | new demo accounts + org + historical cases (existing test accounts untouched) |

## Decisions (defaults taken; flag if wrong)
- D1 SPEC wins over prototype on identity: detected respondent is prefilled but marked pending; it is NOT
  included in the snapshot until the person confirms it (SPEC §5.II).
- D2 Prototype wins on flow: no mandatory "confirm timeline" step; pending/discarded events are excluded.
- D3 Measures list follows the prototype (4 options incl. "Cambio de línea de reporte" and "Otra").
- D4 Demo switch only when `DEMO_ENABLED`; production rejects it. Institutional still never reads Private.
- D5 Old screens replaced; `VoiceCapture` kept but hidden (SPEC §35). Obsolete e2e specs replaced by one demo e2e.

## Constraints
All SPEC invariants from the MVP feature still hold (sourced AI, no invented data, immutable snapshot,
hash-identical copies, institutional isolation).

## TDD
Mode: off (no project/session TDD config). Runners: `backend/.venv/bin/python -m pytest -q` (SQLite; PostgreSQL via
`TEST_DATABASE_URL`), `npx vitest run src` + `npm run build` in `frontend/`.

## Tasks
- [x] P1 Backend: profiles + private note + record overview + private submissions (migration 0008)
- [x] P2 Backend: timeline contract title/time, review item event links + resolution note; fixture + seed rewritten to prototype narrative (María/Juan/Empresa Andina/Lucía, V-001..V-003)
- [x] P3 Backend: draft without confirmation, auto-refresh, respondent detection + confirmation, prototype measures, pending info
- [x] P4 Backend: tri-state procedure, case summary/parties, demo switch
- [x] P5 Frontend: design tokens + shell (sidebar, header, stepper, context chip, demo switch, toast, drawer)
- [x] P6 Frontend: Mi espacio + Registrar
- [x] P7 Frontend: Entender (timeline, review cards, source drawer, correct/confirm/discard/undo)
- [x] P8 Frontend: Preparar reporte (6 sections, status, por confirmar)
- [x] P9 Frontend: Revisar y compartir + preview modal + Caso enviado
- [x] P10 Frontend: VERA Institutional (KPIs, table, detail, status segmented, assign, checklist)
- [x] P11 Tests (backend + vitest), README demo section, e2e demo run on PostgreSQL with screenshots vs prototype

- [x] Q QA fixes (accepted by user 2026-09-26, Playwright exploratory QA):
  - [x] Q1 New situation: "Entender lo ocurrido" after typing lands on Entender (single POST /start)
  - [x] Q2 Member accounts reach their institutional space while demo mode is on
  - [x] Q3 Upload error clears on cancel / new file
  - [x] Q4 Case table usable at 390px (no clipped column)
  - [x] Q5 "No informada" instead of "No confirmada" when no mentioned person is shared

## Progress / evidence
- P1–P4 backend done: migration 0008 (profiles, private_note, record_submissions), `profile.py`, `overview.py`,
  timeline title/event_time (literal-only) + review item event_ids/action_label/resolution_note, draft without
  timeline confirmation (timeline order kept), respondent detection pending until confirmed (excluded from snapshot),
  prototype measures, tri-state procedure (legacy booleans readable), assign moves new→in_review, `POST /api/demo/switch`.
  Seed: María X./Lucía R./Andrea R./Carlos M., Empresa Andina S.A.C., history V-001..V-003 → new case is V-004.
  pytest SQLite: 127 passed / 1 skipped (new `tests/test_prototype.py`, rewritten draft/timeline tests).
- P5–P10 frontend rebuilt: `App.tsx` (session, login with demo quick access, shell: sidebar, topbar, stepper),
  `views/{Home,Register,Understand,Draft,Share,Institutional}.tsx`, `SourceDrawer.tsx`, `ui.tsx`, `progress.ts`,
  `format.ts`, `router.ts`, `types.ts`, `recordContext.ts`, `style.css` (prototype tokens). Old screens and their tests
  removed; `VoiceCapture` kept hidden with its 2 isolated tests (integration tests removed with the old Home).
- Visual check against prototype screenshots (all views) — near pixel parity. Fixed during check: synthetic PNG glyphs
  (DejaVu/ASCII fallback), evidence order, "Preparar" done state, parties grid.
- P11: vitest 9 passed (3/3 runs), build OK; new `e2e/demo.spec.ts` replaces 6 obsolete specs — 3/3 passes on fresh
  seed (one earlier failure right after a backend hot-reload, not reproduced). pytest PostgreSQL 128 passed,
  SQLite 127 passed / 1 skipped. README demo/accounts updated.
- Committed and pushed as PR #2 (e409c55, fbce723, d3460a8).
- QA round (Playwright, ~40 checks) found 5 UI bugs (Q1–Q5); each reproduced by a failing vitest first, then fixed.
  Verified in browser (qa3: 6/6), vitest 13 passed (3/3 runs), build OK, e2e demo passed on fresh data. Backend untouched.

## Next step
User review of the redesign; then commit/PR on `feat/vera-prototype-redesign` (stacked on PR #1).
