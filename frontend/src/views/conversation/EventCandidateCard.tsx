import { useState } from 'react'
import type { EventInput } from '../../api/timeline'
import type { CaseEvent } from '../../types'
import { dateLabel } from '../../format'
import { EventForm } from '../understand/EventForm'

export type CandidateAction = (event: CaseEvent, status: 'accepted' | 'discarded', content?: Partial<EventInput>) => Promise<boolean>

const ORIGIN_LABEL = {
  user_statement: 'Lo dijiste tú', manual: 'Lo dijiste tú', evidence: 'De una evidencia',
  model_inference: 'VERA lo infiere · confírmalo',
} as const

function statusOf(event: CaseEvent) {
  if (event.origin === 'model_inference' && !event.reviewed) return ['warn', 'Pendiente de confirmar'] as const
  if (event.status === 'confirmed') return ['ok', 'Confirmado'] as const
  if (event.status === 'corrected') return ['ok', 'Corregido'] as const
  if (event.status === 'discarded') return ['muted', 'Descartado'] as const
  return ['warn', 'Pendiente de confirmar'] as const
}

export function EventCandidateCard({ event, recent, busy, blocked, onReview }: {
  event: CaseEvent; recent: boolean; busy: boolean; blocked: boolean; onReview: CandidateAction
}) {
  const [editing, setEditing] = useState(false)
  const [kind, status] = statusOf(event)
  const canReview = event.status === 'candidate' || event.needs_review || event.origin === 'model_inference' && !event.reviewed
  const initial: EventInput = { title: event.title, description: event.description, ...event.date }
  return <li className={`event${recent ? ' recent-event' : ''}`}>
    <article className="event-card" aria-label={event.title}>
      <div className="event-head">
        <div><span className={`event-date${event.date.date_kind !== 'exact' ? ' approx' : ''}`}>
          {dateLabel({ description: event.description, ...event.date, event_time: event.event_time })}</span>
          <h3 className="event-title">{event.title}</h3></div>
        <span className={`chip ${kind}`}>{status}</span>
      </div>
      <div className="chips"><span className="chip neutral">{ORIGIN_LABEL[event.origin]}</span>
        {recent && <span className="chip">Nuevo o actualizado</span>}</div>
      {editing ? <EventForm idPrefix={`conversation-${event.id}`} initial={initial} busy={blocked} submitLabel="Guardar corrección"
        onCancel={() => setEditing(false)} onSubmit={async input => { if (await onReview(event, 'accepted', input)) setEditing(false) }} /> : <>
        <p className="event-desc">{event.description}</p>
        {event.source.quote && <div className="quote"><span>{event.source.label}</span><q>{event.source.quote}</q></div>}
        {canReview && <div className="event-actions">
          <button className="btn btn-ghost btn-md" disabled={blocked} onClick={() => void onReview(event, 'discarded')}>Descartar</button>
          <button className="btn btn-secondary btn-md" disabled={blocked} onClick={() => setEditing(true)}>Corregir</button>
          <button className="btn btn-primary btn-md" disabled={blocked} onClick={() => void onReview(event, 'accepted')}>
            {busy ? 'Guardando…' : 'Confirmar'}</button>
        </div>}
      </>}
    </article>
  </li>
}
