import { useMemo, useState } from 'react'
import type { Attachment, Draft } from '../../types'
import type { SuggestedAction } from '../../types'

export type SharePreselection = Pick<SuggestedAction, 'event_ids' | 'file_ids'>
const keyFor = (recordId: string) => `vera-share-preview:${recordId}`

/** One-time handoff to the existing Share route. Only IDs travel; no data is sent. */
export function stageSharePreselection(recordId: string, action: SharePreselection): boolean {
  try {
    const ids = (value: unknown) => Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []
    sessionStorage.setItem(keyFor(recordId), JSON.stringify({ event_ids: ids(action.event_ids), file_ids: ids(action.file_ids) }))
    return true
  } catch { return false }
}

export function readSharePreselection(recordId: string): SharePreselection | null {
  try {
    const raw = sessionStorage.getItem(keyFor(recordId))
    if (!raw) return null
    let value: unknown
    try { value = JSON.parse(raw) } catch { return { event_ids: [], file_ids: [] } }
    if (!value || typeof value !== 'object') return { event_ids: [], file_ids: [] }
    const source = value as Record<string, unknown>
    const ids = (items: unknown) => Array.isArray(items) ? items.filter((id): id is string => typeof id === 'string') : []
    return { event_ids: ids(source.event_ids), file_ids: ids(source.file_ids) }
  } catch { return null }
}

export function clearSharePreselection(recordId: string) {
  try { sessionStorage.removeItem(keyFor(recordId)) } catch { /* storage unavailable */ }
}

export type Row = { key: string; name: string; detail: string; kind: 'event' | 'file' }
const eventKey = (id: string) => `event:${id}`
const fileKey = (id: string) => `file:${id}`
const docName = (label: string, kind: string) => kind === 'file' ? label.replace(/ · tu descripción$/, '') : kind === 'person' ? 'Agregado por ti' : 'Relato personal'

/** Everything that could be shared, in reading order: events, linked files, then files not linked to any event. */
function rowsOf(draft: Draft, files: Attachment[]): Row[] {
  const facts = draft.fields.facts.events
  const linked = new Set(draft.fields.evidence.file_ids)
  const eventOf = (id: string) => facts.findIndex(f => f.sources.some(s => s.source_id === id)) + 1
  return [
    ...facts.map((fact, i) => ({ key: eventKey(fact.event_id), kind: 'event' as const, name: `Evento ${i + 1} · ${fact.title}`,
      detail: `Evento · ${[...new Set(fact.sources.map(s => docName(s.label, s.kind)))].join(', ')}` })),
    // Only files that still exist are offered; a deleted one would otherwise be sent invisibly.
    ...files.filter(f => linked.has(f.id)).map(f => ({ key: fileKey(f.id), kind: 'file' as const, name: f.filename, detail: `Archivo · vinculado al Evento ${eventOf(f.id)}` })),
    ...files.filter(f => !linked.has(f.id)).map(f => ({ key: fileKey(f.id), kind: 'file' as const, name: f.filename, detail: 'Archivo · sin vincular a eventos' })),
  ]
}

/** What the person marks to share. Defaults: every included event and the files that support them. */
export function useShareSelection(draft: Draft | null | undefined, files: Attachment[] | null, initial: SharePreselection | null = null) {
  const [changed, setChanged] = useState<Set<string> | null>(null)
  const rows = useMemo(() => draft && files ? rowsOf(draft, files) : [], [draft, files])
  const selected = useMemo(() => {
    if (!draft || !files) return null
    const available = new Set(rows.map(row => row.key))
    if (changed) return new Set([...changed].filter(id => available.has(id)))
    if (initial) return new Set([...initial.event_ids.map(eventKey), ...initial.file_ids.map(fileKey)].filter(key => available.has(key)))
    const linked = new Set(draft.fields.evidence.file_ids)
    return new Set([...draft.fields.facts.events.map(f => eventKey(f.event_id)), ...files.filter(f => linked.has(f.id)).map(f => fileKey(f.id))])
  }, [draft, files, rows, changed, initial])
  const on = (key: string) => !!selected?.has(key)
  const toggle = (key: string) => {
    if (!rows.some(row => row.key === key)) return
    setChanged(current => { const next = new Set(current ?? selected ?? []); if (next.has(key)) next.delete(key); else next.add(key); return next })
  }
  const facts = (draft?.fields.facts.events ?? []).filter(f => on(eventKey(f.event_id)))
  return { ready: !!selected, rows, shared: rows.filter(r => on(r.key)), kept: rows.filter(r => !on(r.key)), toggle,
    facts, files: (files ?? []).filter(f => on(fileKey(f.id))) }
}
