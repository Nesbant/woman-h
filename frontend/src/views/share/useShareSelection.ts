import { useEffect, useMemo, useState } from 'react'
import type { Attachment, Draft } from '../../types'

export type Row = { key: string; name: string; detail: string; kind: 'event' | 'file' }
const docName = (label: string, kind: string) => kind === 'file' ? label.replace(/ · tu descripción$/, '') : kind === 'person' ? 'Agregado por ti' : 'Relato personal'

/** Everything that could be shared, in reading order: events, linked files, then files not linked to any event. */
function rowsOf(draft: Draft, files: Attachment[]): Row[] {
  const facts = draft.fields.facts.events
  const linked = new Set(draft.fields.evidence.file_ids)
  const eventOf = (id: string) => facts.findIndex(f => f.sources.some(s => s.source_id === id)) + 1
  return [
    ...facts.map((fact, i) => ({ key: fact.event_id, kind: 'event' as const, name: `Evento ${i + 1} · ${fact.title}`,
      detail: `Evento · ${[...new Set(fact.sources.map(s => docName(s.label, s.kind)))].join(', ')}` })),
    // Only files that still exist are offered; a deleted one would otherwise be sent invisibly.
    ...files.filter(f => linked.has(f.id)).map(f => ({ key: f.id, kind: 'file' as const, name: f.filename, detail: `Archivo · vinculado al Evento ${eventOf(f.id)}` })),
    ...files.filter(f => !linked.has(f.id)).map(f => ({ key: f.id, kind: 'file' as const, name: f.filename, detail: 'Archivo · sin vincular a eventos' })),
  ]
}

/** What the person marks to share. Defaults: every included event and the files that support them. */
export function useShareSelection(draft: Draft | null | undefined, files: Attachment[] | null) {
  const [selected, setSelected] = useState<Set<string> | null>(null)
  const rows = useMemo(() => draft && files ? rowsOf(draft, files) : [], [draft, files])
  useEffect(() => {
    if (!draft || !files || selected) return
    const linked = new Set(draft.fields.evidence.file_ids)
    setSelected(new Set([...draft.fields.facts.events.map(f => f.event_id), ...files.filter(f => linked.has(f.id)).map(f => f.id)]))
  }, [draft, files, selected])
  const on = (key: string) => !!selected?.has(key)
  const toggle = (key: string) => setSelected(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next })
  const facts = (draft?.fields.facts.events ?? []).filter(f => on(f.event_id))
  return { ready: !!selected, rows, shared: rows.filter(r => on(r.key)), kept: rows.filter(r => !on(r.key)), toggle,
    facts, files: (files ?? []).filter(f => on(f.id)) }
}
