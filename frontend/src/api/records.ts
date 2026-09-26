import { get, send } from './http'
import type { Overview, RecordSummary } from '../types'

export type Account = { id: string; description: string; date_kind: string; event_date: string | null; approximate_date: string | null; place: string | null; mentioned_people: string | null }
type RecordOutput = RecordSummary & { description: string }

const record = (id: string) => `/records/${id}`

export const listRecords = () => get<RecordSummary[]>('/records')
export const getOverview = (id: string) => get<Overview>(`${record(id)}/overview`)
export const getRecord = (id: string) => get<RecordOutput>(record(id))
export const deleteRecord = (id: string) => send<void>('DELETE', record(id))
export const saveNote = (id: string, note: string) => send<{ private_note: string | null }>('PUT', `${record(id)}/note`, { private_note: note })
/** Creates a situation from its first words; idempotent per entry id. */
export const startRecord = (entryId: string, text: string) => send<{ record_id: string; account_id: string }>('POST', '/start', { entry_id: entryId, text })

export async function renameRecord(id: string, title: string) {
  const current = await getRecord(id)
  return send<RecordOutput>('PUT', record(id), { title, description: current.description })
}

export const getAccount = (recordId: string, accountId: string) => get<Account>(`${record(recordId)}/accounts/${accountId}`)
export const createAccount = (recordId: string, description: string) => send<Account>('POST', `${record(recordId)}/accounts`, { description, date_kind: 'unknown' })
export function updateAccount(recordId: string, account: Account, description: string) {
  const { id, date_kind, event_date, approximate_date, place, mentioned_people } = account
  return send<Account>('PUT', `${record(recordId)}/accounts/${id}`, { description, date_kind, event_date, approximate_date, place, mentioned_people })
}
