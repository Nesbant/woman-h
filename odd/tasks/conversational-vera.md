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
- [ ] EST-01 (#7) Persistence: `conversation_messages`, `conversation_states`, migration 0009, real start/get, PRIVATE_TABLES
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

## Next step
EST-01 on `feat/conversation-core-esteban` (stacked on the contract branch until PR merges).
