import { useState } from 'react'
import type { EventInput } from '../../api/timeline'
import type { TimelineEvent } from '../../types'
import { dateLabel } from '../../format'
import { ConfirmDialog } from '../../components/Overlays'
import type { DrawerSource } from '../../components/SourceDrawer'
import { EventForm } from './EventForm'
import { documentsOf, glyphOf, isManual, nameOf, quoteOf } from './sources'

type Actions = {
  busy: boolean
  onReview: (status: TimelineEvent['status'], content?: Partial<EventInput>, message?: string) => Promise<boolean>
  onDelete: () => Promise<boolean>
  onSource: (source: DrawerSource) => void
}

function chip(event: TimelineEvent): [string, string, string] {
  if (event.status === 'discarded') return ['muted', '–', 'Descartado']
  if (event.status === 'accepted') return ['ok', '✓', isManual(event) ? 'Agregado por ti' : event.edited ? 'Corregido por ti' : 'Confirmado']
  return ['warn', '○', 'Pendiente de revisión']
}

const toInput = (event: TimelineEvent): EventInput => ({ title: event.title ?? '', description: event.description, date_kind: event.date_kind,
  event_date: event.event_date, approximate_date: event.approximate_date })

function Sources({ event, related, onSource }: { event: TimelineEvent; related: number[]; onSource: Actions['onSource'] }) {
  return <div className="chips">
    {documentsOf(event).map(source => <button key={source.source_id} className="source-chip"
      onClick={() => onSource({ kind: source.kind, source_id: source.source_id, label: source.label, quote: quoteOf(event, source.source_id) })}>
      <span className="g">{glyphOf(source)}</span>{nameOf(source)} ↗</button>)}
    {!isManual(event) && <span className="chip">{event.edited ? 'Corregido por ti' : 'Sugerido por VERA'}</span>}
    {related.length > 0 && <span className="chip neutral">↔ Relacionado con Evento {related.join(', ')}</span>}
  </div>
}

function PendingActions({ busy, onReview, onEdit }: Pick<Actions, 'busy' | 'onReview'> & { onEdit: () => void }) {
  return <div className="event-actions">
    <button className="btn btn-ghost btn-md" disabled={busy} onClick={() => onReview('discarded')}>Descartar</button>
    <button className="btn btn-secondary btn-md" disabled={busy} onClick={onEdit}>Corregir</button>
    <button className="btn btn-primary btn-md" disabled={busy} onClick={() => onReview('accepted', {}, 'Evento confirmado. Tú mantienes el control.')}>Confirmar</button>
  </div>
}

function ReviewedActions({ event, busy, onReview, onEdit, onDelete }: Pick<Actions, 'busy' | 'onReview'> & { event: TimelineEvent; onEdit: () => void; onDelete: () => void }) {
  return <div className="event-actions split">
    <span className="hint">{event.status === 'discarded' ? 'No se incluirá en el borrador.' : 'Se incluirá en el borrador.'}</span>
    <div className="menu-actions">
      {event.status === 'accepted' && <button className="btn btn-link btn-sm" disabled={busy} onClick={onEdit}>Editar</button>}
      {isManual(event) ? <button className="btn btn-link btn-sm danger" disabled={busy} onClick={onDelete}>Eliminar</button>
        : <button className="btn btn-link btn-sm" disabled={busy} onClick={() => onReview('proposed')}>Deshacer</button>}
    </div>
  </div>
}

export function EventCard({ event, related, busy, onReview, onDelete, onSource }: Actions & { event: TimelineEvent; related: number[] }) {
  const [mode, setMode] = useState<'view' | 'edit' | 'delete'>('view')
  const [kind, icon, label] = chip(event)
  const state = event.status === 'discarded' ? 'ignored' : event.status === 'accepted' ? 'reviewed' : 'pending'
  const quote = isManual(event) ? null : event.support_quotes?.length ? event.support_quotes.join(' … ') : event.source.quote
  const title = event.title ?? event.description
  return <li className={`event ${state}`}>
    <span className="event-dot" aria-hidden="true" />
    <article className="event-card" aria-label={title}>
      <div className="event-head">
        <div><span className={`event-date${event.date_kind !== 'exact' ? ' approx' : ''}`}>{dateLabel(event)}</span><h2 className="event-title">{title}</h2></div>
        <span className={`chip ${kind}`}>{icon} {label}</span>
      </div>
      {mode === 'edit' ? <EventForm idPrefix={`edit-${event.id}`} initial={toInput(event)} busy={busy} submitLabel="Guardar corrección" onCancel={() => setMode('view')}
        onSubmit={async input => { if (await onReview('accepted', input, 'Corrección guardada.')) setMode('view') }} /> : <>
        <p className="event-desc">{event.description}</p>
        {quote && <div className="quote"><span>Fragmento de la fuente</span><q>{quote}</q></div>}
        {event.note && <span className="event-note">{event.note}</span>}
        <Sources event={event} related={related} onSource={onSource} />
        {event.status === 'proposed' ? <PendingActions busy={busy} onReview={onReview} onEdit={() => setMode('edit')} />
          : <ReviewedActions event={event} busy={busy} onReview={onReview} onEdit={() => setMode('edit')} onDelete={() => setMode('delete')} />}
      </>}
    </article>
    {mode === 'delete' && <ConfirmDialog title={`Eliminar “${title}”`} confirmLabel="Eliminar hecho" danger busy={busy}
      onCancel={() => setMode('view')} onConfirm={async () => { if (await onDelete()) setMode('view') }}>
      <p>Este hecho lo agregaste tú; se quita de tu cronología y del borrador. Lo que ya enviaste no cambia.</p>
    </ConfirmDialog>}
  </li>
}
