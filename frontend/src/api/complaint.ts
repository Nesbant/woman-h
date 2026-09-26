import { get, send } from './http'
import type { DraftFields, DraftState, FieldValue, Receipt } from '../types'

const complaint = (recordId: string) => `/records/${recordId}/complaint`
const AFFECTED = ['name', 'document', 'contact', 'position', 'area', 'relationship'] as const
const RESPONDENT = ['name', 'position', 'area', 'relationship'] as const
const value = (field: FieldValue) => ({ value: field.value?.trim() || null })

export const getDraft = (recordId: string) => get<DraftState>(complaint(recordId))
export const generateDraft = (recordId: string, timelineRevision: number) => send<DraftState>('POST', `${complaint(recordId)}/generate`, { revision: timelineRevision })
export const confirmRespondent = (recordId: string, revision: number) => send<DraftState>('POST', `${complaint(recordId)}/confirm-respondent`, { revision })
export const markReviewed = (recordId: string, revision: number) => send<DraftState>('POST', `${complaint(recordId)}/review`, { revision })

/** The draft as the person edited it. Facts are edited in the timeline, never here. */
export function draftBody(fields: DraftFields, revision: number) {
  return {
    revision,
    affected: Object.fromEntries(AFFECTED.map(key => [key, value(fields.affected[key])])),
    respondent: Object.fromEntries(RESPONDENT.map(key => [key, value(fields.respondent[key])])),
    reporter_same_as_affected: fields.reporter.same_as_affected, reporter_name: value(fields.reporter.name),
    facts: [], consequences: value(fields.facts.consequences),
    measures: fields.protection_measures.selected, measures_other: fields.protection_measures.other?.trim() || null,
  }
}
export const saveDraft = (recordId: string, fields: DraftFields, revision: number) => send<DraftState>('PUT', complaint(recordId), draftBody(fields, revision))

/** Draft for this record, created or refreshed when it lags behind the timeline. */
export async function currentDraft(recordId: string) {
  const state = await getDraft(recordId)
  return !state.draft || state.draft.stale ? generateDraft(recordId, state.timeline_revision) : state
}

export type Selection = { draftRevision: number; eventIds: string[]; fileIds: string[]; institutionId: string }
export const submitCase = (recordId: string, s: Selection) => send<Receipt>('POST', `/records/${recordId}/submit`, {
  draft_revision: s.draftRevision, event_ids: s.eventIds, file_ids: s.fileIds, institution_id: s.institutionId })
