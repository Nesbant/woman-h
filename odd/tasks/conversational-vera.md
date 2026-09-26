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
- [x] EST-02 (#8) Typed event ⇄ timeline dict, origin, `message` source, `merge_proposals` keeps conversation events
- [x] EST-03 (#9) Validated tool executor (6 tools, strict schemas) + `state.build_case_state`
- [x] EST-04 (#10) Turn orchestrator + ScriptedBrain, real messages/state endpoints, idempotency, 409
- [x] EST-05 (#11) Claude brain (anthropic SDK, strict tools, caching, structured output, fallback to scripted)
- [x] EST-06 (#12) `prepare_share_preview` never submits
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

- EST-02 done: `app/agent/events.py` (new) converts internal timeline dicts <-> `CaseEvent`, defaults `origin`
  from the legacy `mode` (`person` -> `manual`, anything else -> `model_inference`, the conservative default),
  and adds the `message` source kind with quote verification against the saved message text
  (`message_source`/`new_message_event`). `timeline.merge_proposals` MUST FIX applied: conversation/person
  candidates (`mode in {"person", "message"}`) now survive reprocessing even before review.
  `submission.shared_label` adds "Relato de la persona (conversación)" for `kind='message'`; `draft_fields.
  document_refs` needed no change (already generic over source kind). `ModelInferenceNotReviewed` guard added
  in `events.py` so a `model_inference` event can never be exposed as accepted without having been reviewed.
  `pytest tests/test_conversation.py tests/test_events_model.py tests/test_timeline.py tests/test_cases.py
  tests/test_conversation_contract.py`: 56 passed. Full suite SQLite: 164 passed / 1 skipped. Full suite
  PostgreSQL (`vera_test`): 165 passed / 0 skipped. `alembic check` clean on both (no migration changes in
  EST-02). No contract (`agent/contracts.py`) changes. Existing timeline/draft/submission tests pass unchanged.

- EST-03 done: `agent/tools.py` (new) — six tools (`create_or_update_candidate_event`, `confirm_event`,
  `discard_event`, `attach_evidence`, `get_case_summary`, `prepare_share_preview`) as validated functions over
  the DB, `strict`-compatible JSON schemas (every property required, `additionalProperties: false`, optionality
  via nullable type unions). Validation reuses `proposals.clean_text/exact_date/checked_time` and
  `events.quote_in_message`/`message_source`; every `user_quote` must be a literal substring of the message
  actually saved (`_require_quote`), file ownership is checked against `record_id`, and revision bumps are
  server-side only (`_touch`, mirroring `timeline.bump`). Errors never raise past `execute`: always a
  `ToolResult(is_error=True, ...)` with a message meant for the brain. `agent/state.py::build_case_state` (new)
  is now the single place that derives `CaseState` from `Timeline.events` + `RecordFile` + `ConversationState`;
  `conversation.py`'s `GET .../conversation` and `GET .../conversation/state` and the `get_case_summary` tool all
  call it — EST-00's frozen examples are gone. `prepare_share_preview` is the EST-03 placeholder: only the
  `open_share_preview` action from confirmed/corrected events and their linked files, no draft refresh and no
  `InstitutionalCase` anywhere in the module (EST-06 completes the real draft refresh).
  `pytest tests/test_agent_tools.py`: 22 passed — covers all 4 acceptance criteria (invented quote rejected,
  `confirm_event` without a real user phrase rejected, a `file_id` from another case rejected, no tool ever
  creates an `InstitutionalCase`) plus date/time verification, update-vs-create, review-state gating and
  `get_case_summary`/`build_case_state` parity.

- EST-04 done: `agent/turn.py` (new) — the turn orchestrator: per-case `threading.Lock` (non-blocking, 409 on a
  second concurrent request for the same case) plus a best-effort PostgreSQL `pg_try_advisory_xact_lock` for a
  real multi-process deployment (a no-op on SQLite, which is single-process here) → idempotency by
  `client_message_id` (a repeated id returns the exact same persisted turn, `suggested_actions` excepted since
  it is never persisted) → save the user message → context (`build_case_state` + last 20 messages) → the
  chosen `AgentBrain`'s manual tool loop (at most 4 rounds, `agent/tools.py`'s validated executor) → save the
  reply and touched event ids → `ChatTurnResponse`, committed once per turn. `agent/brain.py` (new): the
  `AgentBrain` protocol (`next_step(RoundContext) -> BrainStep`, per-round not per-turn) and `get_brain()`,
  factory by `settings().chat_brain` (`config.py`, new `chat_brain: Literal["scripted", "claude"] = "scripted"`
  setting) — EST-05 adds `"claude"` without touching this shape. `agent/scripted.py` + `agent/demo_script.json`
  (new): the deterministic fallback brain, `mode="demo"`. Recognizes the epic's five confirm phrases and four
  discard phrases (casefolded, whitespace-squashed substring match), extracts one candidate per narrating
  message with `sources.literal_date` (never resolving a relative date), and asks a clarifying question instead
  of guessing when a confirm/discard phrase matches zero or 2+ open candidates. `conversation.py`'s
  `POST .../messages` now calls `run_turn` for real (the stub echo is gone). Message length (max 4000, via the
  existing `ChatTurnRequest` contract) and the one-turn-at-a-time lock both answer before any brain runs.
  `pytest tests/test_conversation_turn.py`: 8 passed — covers all 4 acceptance criteria (narrating creates a
  `message`-sourced candidate; "guárdalo" confirms it and it shows up in both the timeline and the generated
  draft; an ambiguous "guárdalo" with two open candidates asks instead of guessing; the same
  `client_message_id` twice returns the same turn) plus the 409 lock, the length limit, evidence attachment and
  the share-preview action.

  What I changed from the previous (uncommitted) writer's partial work: reviewed every file critically; found
  it already correct and complete against both issues' acceptance criteria (all 30 EST-03/04 tests were already
  passing before I touched anything). Only change made: a stale comment in `test_conversation_contract.py`
  still said `case_state` "stays EST-00's frozen example until EST-03" even though EST-03 already replaced it —
  fixed the comment, no behavior change. No contract (`agent/contracts.py`) changes; response shapes are
  unchanged from EST-00's frozen contract.

  Full suite SQLite: 195 passed / 1 skipped (baseline was 164 passed / 1 skipped; +31 from EST-03/EST-04's new
  tests, no regressions). Full suite PostgreSQL (`vera_test`): not run this session — the `woman-h-db-1`
  container is unreachable from this environment (no `docker` binary, and port 5432 refuses connections), so
  this verification step is honestly reported as not executed rather than assumed passing. Manual curl smoke
  against uvicorn (SQLite temp DB, `CHAT_BRAIN=scripted`, seeded `maria@example.test`): started a conversation,
  narrated a fact (created a `candidate` event sourced from the message), said "Guárdalo, quiero dejar
  constancia de eso." (event became `confirmed` in `case_state`), and verified the same event shows
  `status=accepted, reviewed=true` on the plain `GET .../timeline` endpoint. Server stopped afterward.

- EST-06 done: `agent/tools.py::prepare_share_preview` now reuses the real draft pipeline instead of
  EST-03's placeholder. Extracted `drafts.refresh_draft(db, record_id, user, timeline, draft)` out of the
  `POST .../complaint/generate` handler (same `build_fields`/`source_map`/`touch` it always ran, now shared,
  no behavior change to the HTTP endpoint) and call it from the tool with the case owner looked up from
  `PrivateRecord.owner_id` (`ToolContext` carries no `user` — `turn.py` never needed one before this). The
  tool never commits (same rule as every other tool): it only mutates the `ComplaintDraft` row through the
  turn's own session, exactly like it already mutated `Timeline.events`. Default selection = every accepted
  fact plus the files its sources link, straight out of the refreshed `draft.fields_json` — the same rule
  the teammate's `useShareSelection` frontend hook defaults to (`facts.map(event_id)` + `evidence.file_ids`).
  This is also why relato (`Account.description`) and the private note (`PrivateRecord.private_note`) are
  excluded: neither one is ever a draft field to begin with, only `Timeline` events and their sources are.
  `pytest tests/test_agent_share.py` (new): 4 passed — 0 `InstitutionalCase` after the tool, the private
  draft is actually refreshed and matches what `complaint/generate` would return, relato/note never appear
  in the refreshed draft's JSON, an unlinked file is excluded, and a still-`candidate` event stays out of the
  preview. `pytest tests/test_agent_share.py tests/test_conversation_turn.py tests/test_agent_tools.py`: 34
  passed (no regressions in the existing placeholder-era assertions, since the default selection rule did
  not change, only how it is computed). Full suite SQLite: 199 passed / 1 skipped (baseline 195/1; +4, no
  regressions). Full suite PostgreSQL: not run this session (Docker Desktop / `woman-h-db-1` still
  unreachable) — recorded as pending, same as EST-04. No `agent/contracts.py` changes.

- EST-05 done: `agent/llm.py::ClaudeBrain` (new) — one Anthropic API call per round (`next_step` stays the
  brain-agnostic per-round contract EST-04 froze), fully stateless across calls: it rebuilds the whole
  conversation from `RoundContext` every time, reconstructing this turn's own already-run tool calls as
  synthetic `tool_use`/`tool_result` exchanges (`round-{i}` placeholder ids — no real id is available or
  needed across separate calls). `agent/prompt.py` (new): the frozen `SYSTEM_PROMPT` (principles, tool-use
  rules, registration/discard phrases, evidence-is-untrusted-text), never interpolated with anything —
  `cache_control: {"type": "ephemeral"}` on its one block caches it together with every tool definition
  (`tools` render before `system` on the wire, so one breakpoint covers both), since neither ever changes
  between requests, turns or cases; the derived `CaseState` and this turn's `attachment_ids` go in the
  turn's own message instead (`agent/llm.py::_current_message`), exactly as the epic specifies, precisely so
  `system`/`tools` can stay byte-identical and cacheable. Final replies use `output_config.format` (a
  `reply_text` + `suggested_actions` JSON schema mirroring `contracts.SuggestedAction`) alongside the six
  `strict` tools — `stop_reason` is checked before anything else (`refusal`/`max_tokens`/`tool_use` handled
  explicitly; anything else must carry a text block or it is treated as an error too), and every reply
  (`reply_text` and every suggested action's `label`) is checked against `proposals.FORBIDDEN` (SPEC §15)
  before it can reach the person.

  **Model choice**: the issue's `claude-opus-5` is not a real model id (the environment's actually-valid
  current ids are `claude-opus-5-5` and `claude-sonnet-5`, per the loaded `claude-api` skill). Chose
  `claude-sonnet-5` as `CHAT_MODEL`'s default: this is a chat/tool-calling workload (short replies, at most a
  couple of small tool calls a turn), which the skill's own cost guidance says rarely benefits from an
  Opus-tier model, and a single model per deployment keeps the whole prompt-caching story simple (a
  multi-model cascade would forfeit cache reuse across models, and caches are model-scoped anyway).
  `CHAT_EFFORT` defaults to `"low"` for the same reason (`output_config.effort`, no thinking budget config
  needed — Sonnet 5 runs adaptive thinking by default either way).

  **Fallback** (`agent/llm.py::BrainError` + `agent/turn.py::_claude_or_fallback`, new): any typed
  `anthropic.APIError` (network, 4xx, 5xx — all typed SDK errors share this one Python base class), a
  missing `ANTHROPIC_API_KEY`, `stop_reason in {"refusal", "max_tokens"}`, unparseable/schema-invalid
  structured output, or a judgment-language reply, all raise `BrainError`. `turn.py` catches it once for the
  whole turn (not per round): rolls back everything that attempt staged in this same still-uncommitted
  transaction (any tool-call mutations from earlier rounds of the *same* failed attempt included — the
  existing one-commit-per-turn design from EST-04 makes this a clean, atomic redo, not a partial one) and
  reruns the turn from scratch with a fresh `ScriptedBrain`, so the person always gets `mode: "demo"` and the
  endpoint never answers with a 5xx or a half-written turn. Noted as a known, untested limitation:
  `db.rollback()` also ends the PostgreSQL transaction holding `_advisory_lock`'s advisory lock, so a
  multi-process race during the fallback path itself is not fully closed (the in-process `threading.Lock`
  still serializes this one case for the whole request regardless).

  `anthropic==1.8.0` installed into `backend/.venv` and added to `requirements.txt`; its 6 new transitive
  dependencies (`docstring_parser`, `httpcore2`, `httpx2`, `jiter`, `sniffio`, `truststore` — `anthropic` 1.x
  is built on `httpx2`, a separate package from the existing `httpx`) added to `requirements.lock.txt` in
  the file's existing alphabetical order; `pip freeze` and the lock file verified byte-identical after every
  edit. `config.py`: `anthropic_api_key: str | None`, `chat_model: str = "claude-sonnet-5"`,
  `chat_effort: Literal[...] = "low"` (existing `chat_brain` already had the `"claude"` branch wired in
  `agent/brain.py::get_brain()`, completed here). `.env.example`: all three documented, plus a note that
  `CHAT_BRAIN=claude` sends every chat message to Anthropic.

  `pytest tests/test_agent_llm.py` (new, a **fake** Anthropic client — no network, no real key): 4 passed —
  the happy path reaches `mode: "ai"` through the full EST-04 flow (narrate → candidate → "guárdalo" →
  confirmed) across 2 turns / 4 API calls, asserting `system` (with its `cache_control` breakpoint) and
  `tools` are byte-identical across all 4 — the exact condition needed for `cache_read_input_tokens > 0` from
  the second call on in the real API, which this sandboxed test cannot itself produce (no key, no network);
  a missing key and a raised `anthropic.APIConnectionError` each fall back to `mode: "demo"` with HTTP 200;
  a fake reply containing judgment language (`"...no es creíble... probabilidad de sanción"`) never reaches
  the person — the turn reruns with `ScriptedBrain` instead. `pytest tests/test_agent_share.py
  tests/test_agent_llm.py tests/test_conversation_turn.py tests/test_agent_tools.py`: 38 passed. Full suite
  SQLite: 203 passed / 1 skipped (baseline 199/1; +4, no regressions). Full suite PostgreSQL: not run this
  session (Docker Desktop / `woman-h-db-1` still unreachable) — recorded as pending, same as EST-04/EST-06.
  No `agent/contracts.py` changes; no new migration (no model changes).

  **Manual curl smoke** (no `ANTHROPIC_API_KEY` in the environment, so a real-provider smoke is not
  possible): uvicorn on a free local port, a fresh SQLite temp DB (`alembic upgrade head` + `seed()`),
  `CHAT_BRAIN=claude` and an empty `ANTHROPIC_API_KEY` — logged in as the seeded `maria@example.test`,
  started a conversation, sent one message: `HTTP_STATUS=200`, response body `"mode":"demo"`, a `candidate`
  event was created by `ScriptedBrain` exactly as EST-04 already does — proving the fallback with no 5xx.
  Server stopped afterward; temp DB directory removed.

## Next step
EST-07 (#13): seed conversation data, safety tests covering both brains, README/SPEC updates.
