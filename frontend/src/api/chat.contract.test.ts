/** EST-00: proves the frozen JSON examples (`contracts/examples/`) satisfy the TypeScript side of the
 * conversation contract, not just the Pydantic side (`backend/tests/test_conversation_contract.py`).
 *
 * The `as <Type>` casts are the actual proof: `tsc -b` only accepts a cast when the imported JSON's
 * inferred shape and the target type are structurally comparable, so a missing or renamed field, or a
 * value of the wrong kind, fails the build. (JSON string literals widen to `string`, so a plain
 * assignment or `satisfies` would reject every status/kind/role union below for the wrong reason —
 * `as` is the correct tool here, not a shortcut around the check.)
 */
import { expect, test } from 'vitest'
import conversationExample from '../../../contracts/examples/conversation.json'
import chatTurnCandidate from '../../../contracts/examples/chat_turn_candidate.json'
import chatTurnRegister from '../../../contracts/examples/chat_turn_register.json'
import chatTurnShare from '../../../contracts/examples/chat_turn_share.json'
import caseStateExample from '../../../contracts/examples/case_state.json'
import type { CaseState, ChatTurn, ConversationView } from '../types'

const conversation = conversationExample as ConversationView
const turns = [chatTurnCandidate, chatTurnRegister, chatTurnShare].map(turn => turn as ChatTurn)
const caseState = caseStateExample as CaseState

test('conversation.json satisfies ConversationView', () => {
  expect(conversation.case_id).toBeTruthy()
  expect(conversation.messages.length).toBeGreaterThan(0)
  expect(conversation.case_state.case_id).toBe(conversation.case_id)
})

test('every chat_turn_*.json satisfies ChatTurn', () => {
  for (const turn of turns) {
    expect(['ai', 'demo']).toContain(turn.mode)
    expect(turn.user_message.role).toBe('user')
    expect(turn.assistant_message.role).toBe('assistant')
    expect(turn.case_state.case_id).toBeTruthy()
  }
})

test('case_state.json satisfies CaseState', () => {
  const total = caseState.counts.candidate + caseState.counts.confirmed + caseState.counts.corrected + caseState.counts.discarded
  expect(caseState.events.length).toBe(total)
  expect(caseState.evidence.every(item => item.linked_event_ids.length > 0)).toBe(true)
})
