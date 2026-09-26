import { get, send } from './http'
import type { CaseState, ChatTurn, ConversationView } from '../types'

const conversation = (recordId: string) => `/records/${recordId}/conversation`

/** Creates the private situation the conversation lives in; returns its id (`case_id` = `record_id`). */
export const startConversation = () => send<{ case_id: string }>('POST', '/conversations')
export const getConversation = (recordId: string) => get<ConversationView>(conversation(recordId))
export const sendMessage = (recordId: string, text: string, clientMessageId: string, attachmentIds: string[] = []) =>
  send<ChatTurn>('POST', `${conversation(recordId)}/messages`,
    { text, client_message_id: clientMessageId, attachment_ids: attachmentIds })
export const getCaseState = (recordId: string) => get<CaseState>(`${conversation(recordId)}/state`)
