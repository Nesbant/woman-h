import { useState } from 'react'
import type { TimelineState } from '../../types'
import { navigate, recordPath } from '../../router'
import { plural } from '../../format'
import { ErrorAlert, PageTitle } from '../../components/PageTitle'
import { SourceDrawer } from '../../components/SourceDrawer'
import type { DrawerSource } from '../../components/SourceDrawer'
import { useRecordContext } from '../../recordContext'
import { EventCard } from './EventCard'
import { EventForm } from './EventForm'
import { ReviewCard } from './ReviewCard'
import { itemSource, relatedNumbers } from './sources'
import { useTimeline } from './useTimeline'

function Progress({ reviewed, total }: { reviewed: number; total: number }) {
  return <div className="progress-meter">
    <div className="stat-row"><span>Eventos revisados</span><strong>{reviewed} de {total}</strong></div>
    <div className="meter" role="progressbar" aria-label="Eventos revisados" aria-valuenow={reviewed} aria-valuemin={0} aria-valuemax={total}>
      <div style={{ width: total ? `${Math.round(reviewed / total * 100)}%` : '0%' }} /></div>
  </div>
}

function Analyzing({ analyzing, sources }: { analyzing: boolean; sources: number | null }) {
  return <div className="card xl analyzing" role="status">
    <div className="brand-mark">V</div>
    <strong style={{ fontSize: 18, fontWeight: 650 }}>{analyzing ? 'VERA está organizando tus fuentes' : 'Cargando tu cronología…'}</strong>
    <span className="hint" style={{ fontSize: 14, maxWidth: 420 }}>{sources !== null ? `Leyendo ${plural(sources, 'fuente', 'fuentes')} de tu espacio privado.` : 'Leyendo tus fuentes.'} Cada evento conservará su fuente.</span>
  </div>
}

function AddEvent({ busy, onAdd }: { busy: boolean; onAdd: (input: Parameters<ReturnType<typeof useTimeline>['add']>[0]) => Promise<boolean> }) {
  const [open, setOpen] = useState(false)
  if (!open) return <button className="add-new" onClick={() => setOpen(true)}><span className="plus" aria-hidden="true">+</span>
    <span><strong>Agregar un hecho que VERA no detectó</strong><span>Queda marcado como agregado por ti y entra al borrador.</span></span></button>
  return <div className="card card-pad"><h3 style={{ fontSize: 16, fontWeight: 650, marginBottom: 10 }}>Nuevo hecho</h3>
    <EventForm idPrefix="new-event" busy={busy} submitLabel="Agregar hecho" onCancel={() => setOpen(false)} onSubmit={async input => { if (await onAdd(input)) setOpen(false) }} /></div>
}

function Footer({ pending, busy, onReanalyze, onNext }: { pending: number; busy: boolean; onReanalyze: () => void; onNext: () => void }) {
  return <div className="footer-bar">
    <span>{pending ? `${plural(pending, 'evento pendiente no se incluirá', 'eventos pendientes no se incluirán')} en el borrador hasta que lo revises. Puedes continuar igualmente.`
      : 'Todos los eventos están revisados. El borrador usará solo los confirmados, corregidos o agregados por ti.'}</span>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button className="btn btn-ghost" disabled={busy} onClick={onReanalyze} title="Conserva lo que ya revisaste">Volver a procesar</button>
      <button className="btn btn-primary" onClick={onNext}>Preparar reporte →</button>
    </div>
  </div>
}

function ContextAside({ data, busy, settle, openSource }: { data: TimelineState; busy: boolean
  settle: ReturnType<typeof useTimeline>['settle']; openSource: (source: DrawerSource) => void }) {
  const items = data.review_items
  return <aside className="col-side sticky" aria-label="Revisión de contexto" style={{ gap: 12 }}>
    <div className="aside-title"><h3>Revisión de contexto</h3><span className="hint">{items.filter(i => i.status === 'open').length} por revisar</span></div>
    {items.map(item => {
      const source = itemSource(item, data.events)
      return <ReviewCard key={item.id} item={item} busy={busy} onSource={source ? () => openSource(source) : null} onSettle={(status, message) => settle(item, status, message)} />
    })}
    {items.length === 0 && <p className="hint">No hay avisos por revisar.</p>}
    <div className="not-do"><strong>Lo que VERA no hace</strong>
      <span>No asigna puntajes, no evalúa credibilidad, no determina culpabilidad ni recomienda sanciones. Solo ordena y relaciona tus fuentes.</span></div>
  </aside>
}

export function Understand({ recordId }: { recordId: string }) {
  const t = useTimeline(recordId)
  const [drawer, setDrawer] = useState<DrawerSource | null>(null)
  const { overview } = useRecordContext()
  const events = t.data?.events ?? []
  const reviewed = events.filter(e => e.status !== 'proposed').length
  const sources = overview ? overview.files + (overview.story ? 1 : 0) : null
  return <>
    <PageTitle eyebrow="IA explicable · Paso 2 de 4" title="Revisa cómo VERA organizó la información"
      lead="VERA propone eventos a partir de tus fuentes. Nada se considera confirmado hasta que tú lo revises.">
      <Progress reviewed={reviewed} total={events.length} />
    </PageTitle>
    <ErrorAlert message={t.error} />
    {(t.analyzing || !t.data) && !t.error ? <Analyzing analyzing={t.analyzing} sources={sources} /> : t.data && <div className="two-col">
      <div className="col-main">
        {events.length === 0 && <div className="card card-pad"><p className="lead">VERA no encontró eventos en tus fuentes. Puedes agregar hechos tú misma, completar tu relato o sumar evidencia y volver a procesar.</p></div>}
        {events.length > 0 && <ol className="timeline" style={{ listStyle: 'none', margin: 0 }}>{events.map(event =>
          <EventCard key={event.id} event={event} busy={t.busy} related={relatedNumbers(event, t.data!.review_items, events)}
            onReview={(status, content, message) => t.review(event, status, content, message)} onDelete={() => t.remove(event)} onSource={setDrawer} />)}</ol>}
        <AddEvent busy={t.busy} onAdd={t.add} />
        <Footer pending={events.length - reviewed} busy={t.busy || t.analyzing} onReanalyze={() => t.reanalyze()} onNext={() => navigate(recordPath(recordId, 'preparar'))} />
      </div>
      <ContextAside data={t.data} busy={t.busy} settle={t.settle} openSource={setDrawer} />
    </div>}
    {drawer && <SourceDrawer recordId={recordId} source={drawer} events={events} onClose={() => setDrawer(null)} />}
  </>
}
