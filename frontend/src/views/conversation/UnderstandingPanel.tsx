import { memo, useId, useState } from 'react'
import type { CaseState } from '../../types'
import { EventCandidateCard } from './EventCandidateCard'
import type { CandidateAction } from './EventCandidateCard'

type ExtendedCounts = CaseState['counts'] & { facts?: number; evidence?: number; approximate_dates?: number }

function UnderstandingPanelImpl({ state, changedIds, busyId, error, notice, onReview, onRetry, onOpenTimeline }: {
  state: CaseState | null; changedIds: string[]; busyId: string | null; error: string; notice: string
  onReview: CandidateAction; onRetry: () => void; onOpenTimeline: () => void
}) {
  const contentId = useId()
  const [expanded, setExpanded] = useState(() => !window.matchMedia?.('(max-width: 640px)').matches)
  const counts = state?.counts as ExtendedCounts | undefined
  const facts = counts?.facts ?? (counts ? counts.candidate + counts.confirmed + counts.corrected + counts.discarded : 0)
  const evidence = counts?.evidence ?? state?.evidence.length ?? 0
  const approximate = counts?.approximate_dates ?? state?.events.filter(event => event.date.date_kind === 'approximate').length ?? 0
  const recent = new Set(changedIds)
  return <aside className="card understanding-panel" aria-label="Lo que voy entendiendo">
    <div className="understanding-head"><h2>Lo que voy entendiendo</h2>
      <button type="button" className="btn btn-secondary btn-sm understanding-toggle" aria-expanded={expanded}
        aria-controls={contentId} onClick={() => setExpanded(value => !value)}>
        {expanded ? 'Ocultar panel' : 'Mostrar panel'}</button></div>
    <div id={contentId} className="understanding-content" hidden={!expanded}>
      <button className="btn btn-link btn-sm" onClick={onOpenTimeline} disabled={!state}>Ver lo registrado</button>
    <div className="understanding-counts" aria-label="Resumen del caso">
      <div><strong>{facts}</strong><span>Hechos</span></div>
      <div><strong>{evidence}</strong><span>Evidencias</span></div>
      <div><strong>{approximate}</strong><span>Fechas aproximadas</span></div>
    </div>
    {error && <div className="error" role="alert">{error} <button className="btn btn-secondary btn-sm" onClick={onRetry}>Reintentar actualización</button></div>}
    {notice && <p role="status" className="hint">{notice}</p>}
    {!state?.events.length && <p className="hint">Todavía no hay hechos para revisar. Puedes seguir conversando.</p>}
    {!!state?.events.length && <ol className="timeline understanding-events" style={{ listStyle: 'none', margin: 0 }}>
      {state.events.map(event => <EventCandidateCard key={event.id} event={event} recent={recent.has(event.id)}
        busy={busyId === event.id} blocked={!!busyId} onReview={onReview} />)}
    </ol>}
    </div>
  </aside>
}

export const UnderstandingPanel = memo(UnderstandingPanelImpl)
