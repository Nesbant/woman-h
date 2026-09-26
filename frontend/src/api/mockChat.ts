import conversationExample from '../../../contracts/examples/conversation.json'
import candidateExample from '../../../contracts/examples/chat_turn_candidate.json'
import registerExample from '../../../contracts/examples/chat_turn_register.json'
import shareExample from '../../../contracts/examples/chat_turn_share.json'
import type { CaseState, ChatTurn, ConversationView } from '../types'
import { send } from './http'

const example = conversationExample as ConversationView
const turns = [candidateExample, registerExample, shareExample] as ChatTurn[]
const conversations = new Map<string, ConversationView>()
const requests = new Map<string, ChatTurn>()
const pause = () => new Promise(resolve => setTimeout(resolve, 250))
const forCase = (state: CaseState, caseId: string): CaseState => ({ ...state, case_id: caseId })
const storageKey = (recordId: string) => `vera-chat-mock:${recordId}`

function save(view: ConversationView) {
  conversations.set(view.case_id, view)
  try { sessionStorage.setItem(storageKey(view.case_id), JSON.stringify(view)) } catch { /* mock remains in memory */ }
}

function stored(recordId: string): ConversationView | null {
  try {
    const value = sessionStorage.getItem(storageKey(recordId))
    return value ? JSON.parse(value) as ConversationView : null
  } catch { return null }
}

export async function startMockConversation() {
  // The situation must exist on the server so the existing files endpoint can own attachments.
  const { case_id: caseId } = await send<{ case_id: string }>('POST', '/conversations')
  save({ case_id: caseId, messages: [], case_state: forCase(example.case_state, caseId) })
  return { case_id: caseId }
}

export async function getMockConversation(recordId: string): Promise<ConversationView> {
  await pause()
  if (!conversations.has(recordId)) save(stored(recordId) ?? {
    case_id: recordId, messages: [], case_state: forCase(example.case_state, recordId),
  })
  const view = conversations.get(recordId)!
  return { ...view, messages: [...view.messages] }
}

export async function sendMockMessage(recordId: string, text: string, clientMessageId: string, attachmentIds: string[] = []): Promise<ChatTurn> {
  const key = `${recordId}:${clientMessageId}`
  if (requests.has(key)) return requests.get(key)!
  await pause()
  if (requests.has(key)) return requests.get(key)!
  const view = await getMockConversation(recordId)
  const seeded = view.messages[0]?.id === example.messages[0]?.id ? example.messages.filter(message => message.role === 'user').length : 0
  const fixture = turns[Math.max(0, view.messages.filter(message => message.role === 'user').length - seeded) % turns.length]
  const now = new Date().toISOString()
  const turn: ChatTurn = {
    ...fixture,
    user_message: { ...fixture.user_message, id: crypto.randomUUID(), text, created_at: now, client_message_id: clientMessageId, attachment_ids: attachmentIds },
    assistant_message: { ...fixture.assistant_message, id: crypto.randomUUID(), created_at: now },
    case_state: forCase(fixture.case_state, recordId),
  }
  requests.set(key, turn)
  save({ case_id: recordId, messages: [...view.messages, turn.user_message, turn.assistant_message], case_state: turn.case_state })
  return turn
}

export async function getMockCaseState(recordId: string): Promise<CaseState> {
  return (await getMockConversation(recordId)).case_state
}
