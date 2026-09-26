/** API contracts used by the views. Mirrors the FastAPI responses. */
export type Membership = { institution_id: string; name: string; role: 'admin' | 'reviewer' }
export type User = { id: string; name: string; email: string; memberships: Membership[] }

export type SourceRef = { id: string; kind: 'account' | 'record' | 'file'; source_id: string; label: string; quote: string; page: number | null; field?: string | null }
export type DateKind = 'exact' | 'approximate' | 'unknown'
export type EventContent = { title?: string; description: string; date_kind: DateKind; event_date: string | null; approximate_date: string | null; event_time?: string | null }
export type TimelineEvent = EventContent & {
  id: string; status: 'proposed' | 'accepted' | 'discarded'; edited: boolean; reviewed: boolean; mode: string; note?: string
  original: EventContent; source: SourceRef; sources?: SourceRef[]; support_quotes?: string[]
}
export type ReviewItem = {
  id: string; kind: 'date_inconsistency' | 'possible_relation' | 'unlinked_evidence'; message: string; source_ids: string[]
  file_id: string | null; status: 'open' | 'resolved' | 'dismissed'; event_ids?: string[]; action_label?: string | null; resolution_note?: string | null
}
export type TimelineState = { revision: number; mode: string; configured_mode: string; events: TimelineEvent[]; warnings: string[]; review_items: ReviewItem[]; processed_at: string | null }

export type Attachment = { id: string; filename: string; description: string | null; media_type: string; size: number; sha256: string; created_at: string; account_ids: string[] }

export type Submission = { case_id: string; institution_name: string; submitted_at: string; summary: { events: number; files: { filename: string; sha256: string }[] } }
export type Overview = {
  record: { id: string; title: string; private_note: string | null; created_at: string; updated_at: string }
  story: { account_id: string; description: string } | null
  files: number
  timeline: { processed: boolean; revision: number; total: number; pending: number; accepted: number; discarded: number; open_review_items: number }
  draft: { exists: boolean; reviewed: boolean; stale: boolean }
  submissions: Submission[]
}
export type RecordSummary = { id: string; title: string; updated_at: string; created_at: string }

export type FieldValue = { value: string | null; origin: 'profile' | 'person' | 'detected' | null }
export type Fact = EventContent & { event_id: string; title: string; sources: { kind: SourceRef['kind']; source_id: string; label: string }[]; edited: boolean }
export type DraftFields = {
  affected: Record<'name' | 'document' | 'contact' | 'position' | 'area' | 'relationship', FieldValue>
  respondent: Record<'name' | 'position' | 'area' | 'relationship', FieldValue>
  respondent_confirmed: boolean
  respondent_detection: { name: string | null; position: string | null; found_in: string[] } | null
  reporter: { same_as_affected: boolean; name: FieldValue }
  facts: { events: Fact[]; consequences: FieldValue }
  evidence: { file_ids: string[] }
  protection_measures: { selected: string[]; other: string | null }
}
export type Draft = { revision: number; timeline_revision: number; stale: boolean; fields: DraftFields; pending: { key: string; title: string; detail: string }[]; reviewed: boolean }
export type DraftState = { timeline_revision: number; measure_options: { code: string; label: string; help: string }[]; draft: Draft | null }
export type Profile = { name: string; email: string; institution: { id: string; name: string } | null; document: string | null; contact: string | null; position: string | null; area: string | null; relationship: string | null }
export type Receipt = { case_id: string; institution_name: string; submitted_at: string; shared: { events: number; files: number }; files: { filename: string; sha256: string }[] }

export type CaseStatus = 'new' | 'in_review' | 'follow_up' | 'closed'
export type StepStatus = 'pending' | 'in_progress' | 'done'
export type CaseSummary = { case_id: string; submitted_at: string; status: CaseStatus; assignee: { id: string; name: string | null } | null }
export type CaseListing = { counts: { received: number } & Record<CaseStatus, number>; items: CaseSummary[] }
export type Snapshot = {
  summary?: string
  affected: Partial<DraftFields['affected']>; respondent: Partial<DraftFields['respondent']>; respondent_confirmed?: boolean
  reporter: { same_as_affected: boolean; name: FieldValue }
  facts: { events: (EventContent & { title?: string | null; sources: string[] })[]; consequences: FieldValue }
  evidence: { file_id: string; filename: string; sha256: string }[]
  protection_measures: { selected: { code: string; label: string }[]; other: string | null }
}
export type CaseDetail = CaseSummary & {
  snapshot: Snapshot; members: { id: string; name: string }[]
  files: { id: string; filename: string; media_type: string; sha256: string }[]
  procedure: { key: string; label: string; description: string; reference: string | null; status: StepStatus; updated_at: string | null; updated_by: { id: string; name: string | null } | null }[]
}
