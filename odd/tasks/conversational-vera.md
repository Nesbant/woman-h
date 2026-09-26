# VERA conversacional — backend (EST-00 … EST-08)

Locator: `odd/tasks/conversational-vera.md` · Engram mirror: `odd/conversational-vera/tasks` (pending: Engram not available in this session)
Epic: https://github.com/Nesbant/woman-h/issues/5 · Issues #6–#14 (owner Esteban). Teammate (ssalex88) owns CMP-01…CMP-08 (#15–#22).

## Objective
Make the conversation VERA's main interface while keeping structured documentation, timeline, evidence,
traceability, Private vs Institutional and the final share flow. This document covers the backend/contract side.

## Decisions
- D1 (user, 2026-09-26): the conversation is saved in Private from the first message. It is deleted with the
  situation, and saving the conversation does not register facts (only confirmed events do).
- D2 Branching: EST-00 on `feat/conversation-contract` → PR to `iteration/conversational-vera` (needs teammate
  approval). EST-01…EST-07 continue on `feat/conversation-core-esteban`, stacked on the contract branch until that
  PR merges, then updated with `git merge origin/iteration/conversational-vera`.
- D3 EST-08 depends on CMP-07 (teammate) and runs last, on `fix/conversation-integration`.

## Constraints
Epic principles are non-negotiable: VERA never judges, never recommends sanctions, never pushes to report, never
shares automatically; `MODEL_INFERENCE` never confirms itself; no tool submits. Existing endpoints keep URLs and
shapes. Ownership table in the epic: do not touch teammate files (views/conversation, router, shell, style.css…).

## TDD
Mode: off (no project/session config). New behavior gets tests.
Runners: `backend/.venv/bin/python -m pytest -q` (SQLite; PG via `TEST_DATABASE_URL`), `npx tsc -b`, `npx vitest run src`.

## Tasks
- [x] EST-00 (#6) Contract: Pydantic models, 5 JSON examples, 4 stub endpoints behind session, `api/chat.ts`, types, contract test
- [x] EST-01 (#7) Persistence: `conversation_messages`, `conversation_states`, migration 0009, real start/get, PRIVATE_TABLES
- [ ] EST-02 (#8) Typed event ⇄ timeline dict, origin, `message` source, `merge_proposals` keeps conversation events
- [ ] EST-03 (#9) Validated tool executor (6 tools, strict schemas) + `state.build_case_state`
- [ ] EST-04 (#10) Turn orchestrator + ScriptedBrain, real messages/state endpoints, idempotency, 409
- [ ] EST-05 (#11) Claude brain (anthropic SDK, strict tools, caching, structured output, fallback to scripted)
- [ ] EST-06 (#12) `prepare_share_preview` never submits
- [ ] EST-07 (#13) Seed conversation, safety tests (both brains), README/SPEC
- [ ] EST-08 (#14) Integration + DoD — blocked on CMP-07

## Progress
- 2026-09-26: document created; decision D1 recorded. Baseline pytest SQLite: 132 passed / 1 skipped.
  `anthropic` SDK not installed yet (latest 1.8.0); no `ANTHROPIC_API_KEY` in env → EST-05 real smoke pending.

- EST-00 done: contract (`agent/contracts.py`), 5 examples, stub router (POST /api/conversations already creates a real
  PrivateRecord), `api/chat.ts`, `resolveJsonModule`. pytest 141 passed / 1 skipped; tsc ok; vitest 21 passed.

- EST-01 done: `conversation_messages`/`conversation_states` tables + migration 0009; `POST /api/conversations` now
  also creates an empty `Timeline`; `GET .../conversation` returns real, capped-at-50 message history from the DB
  (`case_state` stays EST-00's frozen example — real derivation is `agent/state.py::build_case_state`, explicitly
  EST-03/EST-04 — documented in `conversation.py`). Both new tables added to `PRIVATE_TABLES` and conftest cleanup.
  `pytest tests/test_conversation.py tests/test_conversation_contract.py`: 14 passed. Full suite SQLite: 146 passed /
  1 skipped. Full suite PostgreSQL (`vera_test`, a disposable DB created for this): 147 passed / 0 skipped. `alembic
  check` clean on both SQLite and PostgreSQL. One frozen-example assertion in `test_conversation_contract.py` updated
  (`view.messages` is now `[]` for a freshly started conversation instead of the fixture's non-empty history).

## Next step
EST-02 on `feat/conversation-core-esteban` (stacked on the contract branch until PR merges).
