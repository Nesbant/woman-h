import type { ReviewItem, SourceRef, TimelineEvent } from '../../types'

export const sourcesOf = (event: TimelineEvent) => event.sources?.length ? event.sources : [event.source]
/** One chip per document, even when several fragments of it are cited. */
export const documentsOf = (event: TimelineEvent) => [...new Map(sourcesOf(event).map(s => [s.source_id, s])).values()]
export const glyphOf = (s: Pick<SourceRef, 'kind' | 'label'>) => s.kind === 'person' ? 'TÚ' : s.kind !== 'file' ? 'TXT' : /\.pdf/i.test(s.label) ? 'PDF' : 'IMG'
export const nameOf = (s: Pick<SourceRef, 'kind' | 'label'>) =>
  s.kind === 'file' ? s.label.replace(/ · tu descripción$/, '') : s.kind === 'person' ? 'Agregado por ti' : 'Relato personal'
export const quoteOf = (event: TimelineEvent, sourceId: string) => sourcesOf(event).filter(s => s.source_id === sourceId).map(s => s.quote).join(' ')
export const isManual = (event: TimelineEvent) => event.mode === 'person'

/** Numbers of the events a resolved "possible relation" links to this one. */
export function relatedNumbers(event: TimelineEvent, items: ReviewItem[], events: TimelineEvent[]) {
  const index = new Map(events.map((e, i) => [e.id, i + 1]))
  return items.filter(i => i.kind === 'possible_relation' && i.status === 'resolved' && i.event_ids?.includes(event.id))
    .flatMap(i => (i.event_ids ?? []).filter(id => id !== event.id)).map(id => index.get(id)).filter((n): n is number => !!n)
}

/** The first file fragment a notice cites, to open it in the drawer. */
export function itemSource(item: ReviewItem, events: TimelineEvent[]) {
  for (const event of events) {
    const hit = sourcesOf(event).find(s => item.source_ids.includes(s.id) && s.kind === 'file')
    if (hit) return { kind: hit.kind, source_id: hit.source_id, label: hit.label, quote: quoteOf(event, hit.source_id) }
  }
  return item.file_id ? { kind: 'file' as const, source_id: item.file_id, label: item.message.split(' ')[0] } : null
}
