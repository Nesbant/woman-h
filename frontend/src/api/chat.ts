import { get, send } from './http'
import type { CaseState, ChatTurn, ConversationView } from '../types'

const conversation = (recordId: string) => `/records/${recordId}/conversation`
const mock = import.meta.env.VITE_CHAT_MOCK === '1'

/** Creates the private situation the conversation lives in; returns its id (`case_id` = `record_id`). */
export const startConversation = () => mock ? import('./mockChat').then(m => m.startMockConversation())
  : send<{ case_id: string }>('POST', '/conversations')
export const getConversation = (recordId: string) => mock ? import('./mockChat').then(m => m.getMockConversation(recordId))
  : get<ConversationView>(conversation(recordId))
export const sendMessage = (recordId: string, text: string, clientMessageId: string, attachmentIds: string[] = []) =>
  mock ? import('./mockChat').then(m => m.sendMockMessage(recordId, text, clientMessageId, attachmentIds))
    : send<ChatTurn>('POST', `${conversation(recordId)}/messages`,
      { text, client_message_id: clientMessageId, attachment_ids: attachmentIds })
export const getCaseState = (recordId: string) => mock ? import('./mockChat').then(m => m.getMockCaseState(recordId))
  : get<CaseState>(`${conversation(recordId)}/state`)
