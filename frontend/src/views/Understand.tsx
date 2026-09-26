import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import type { ReviewItem, SourceRef, TimelineEvent, TimelineState } from '../types'
import { navigate, recordPath } from '../router'
import { dateLabel, plural } from '../format'
import { PageTitle, useFailure, useToast } from '../ui'
import { useRecordContext } from '../recordContext'
import { SourceDrawer } from '../SourceDrawer'
import type { DrawerSource } from '../SourceDrawer'

const sourcesOf = (event: TimelineEvent) => event.sources?.length ? event.sources : [event.source]
const docGlyph = (s: { kind: SourceRef['kind']; label: string }) => s.kind !== 'file' ? 'TXT' : /\.pdf/i.test(s.label) ? 'PDF' : 'IMG'
const docName = (s: { kind: SourceRef['kind']; label: string }) => s.kind === 'file' ? s.label.replace(/ · tu descripción$/, '') : 'Relato personal'
/** One chip per document, even when several fragments of it are cited. */
const documents = (event: TimelineEvent) => [...new Map(sourcesOf(event).map(s => [s.source_id, s])).values()]
const content = (event: TimelineEvent) => ({ title: event.title, description: event.description, date_kind: event.date_kind, event_date: event.event_date, approximate_date: event.approximate_date })

const REVIEW_TITLES = { date_inconsistency: 'Fecha inconsistente', possible_relation: 'Posible relación', unlinked_evidence: 'Evidencia no vinculada' }
const REVIEW_ICONS = { date_inconsistency: '!', possible_relation: '↔', unlinked_evidence: '+' }

export function Understand({ recordId }: { recordId: string }) {
  const [data, setData] = useState<TimelineState | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [drawer, setDrawer] = useState<DrawerSource | null>(null)
  const started = useRef(false)
  const { overview, refresh } = useRecordContext()
  const { notify } = useToast()
  const fail = useFailure()

  const analyze = useCallback(async (revision: number) => {
    setAnalyzing(true); setError('')
    try { setData(await api<TimelineState>(`/records/${recordId}/timeline/analyze`, { method: 'POST', body: JSON.stringify({ revision }) })); refresh() }
    catch (e) { fail(e, setError) }
    finally { setAnalyzing(false) }
  }, [recordId, refresh, fail])
  useEffect(() => {
    let active = true
    api<TimelineState>(`/records/${recordId}/timeline`).then(state => {
      if (!active) return
      setData(state)
      // First visit: VERA proposes the timeline right away, as in the prototype.
      if (!state.processed_at && !started.current) { started.current = true; analyze(state.revision) }
    }).catch(e => { if (active) fail(e, setError) })
    return () => { active = false }
  }, [recordId, analyze, fail])

  async function mutate(path: string, body: object, message?: string) {
    if (!data || busy) return
    setBusy(true); setError('')
    try {
      setData(await api<TimelineState>(`/records/${recordId}/timeline${path}`, { method: 'PUT', body: JSON.stringify({ revision: data.revision, ...body }) }))
      if (message) notify(message)
      refresh()
    } catch (e) { fail(e, setError) }
    finally { setBusy(false) }
  }
  const review = (event: TimelineEvent, status: TimelineEvent['status'], changes: Partial<TimelineEvent> = {}, message?: string) =>
    mutate(`/events/${event.id}`, { ...content(event), ...changes, status }, message)
  const settle = (item: ReviewItem, status: ReviewItem['status'], message?: string) => mutate(`/review-items/${item.id}`, { status }, message)

  const events = data?.events ?? []
  const reviewed = events.filter(e => e.status !== 'proposed').length
  const pending = events.length - reviewed
  const items = data?.review_items ?? []
  const open = items.filter(i => i.status === 'open').length
  const index = new Map(events.map((e, i) => [e.id, i + 1]))
  const relatedTo = (event: TimelineEvent) => items.filter(i => i.kind === 'possible_relation' && i.status === 'resolved' && i.event_ids?.includes(event.id))
    .flatMap(i => (i.event_ids ?? []).filter(id => id !== event.id)).map(id => index.get(id)).filter(Boolean)
  const openSource = (source: SourceRef | { kind: SourceRef['kind']; source_id: string; label: string }, event?: TimelineEvent) =>
    setDrawer({ kind: source.kind, source_id: source.source_id, label: source.label,
      quote: event ? sourcesOf(event).filter(s => s.source_id === source.source_id).map(s => s.quote).join(' ') : undefined })
  function itemSource(item: ReviewItem) {
    for (const event of events) {
      const hit = sourcesOf(event).find(s => item.source_ids.includes(s.id) && s.kind === 'file')
      if (hit) return () => openSource(hit, event)
    }
    if (item.file_id) return () => setDrawer({ kind: 'file', source_id: item.file_id!, label: item.message.split(' ')[0] })
    return null
  }
  function closedText(item: ReviewItem) {
    if (item.status === 'dismissed') return 'Ignorado · puedes retomarlo luego.'
    if (item.kind === 'date_inconsistency') return `✓ ${item.resolution_note ?? 'Revisaste la fecha.'}`
    if (item.kind === 'possible_relation') return '✓ Relacionaste estos eventos.'
    return `✓ ${item.message.split(' ')[0]} queda en tu espacio, sin vincular.`
  }
  const sourcesCount = overview ? overview.files + (overview.story ? 1 : 0) : null

  return <>
    <PageTitle eyebrow="IA explicable · Paso 2 de 4" title="Revisa cómo VERA organizó la información"
      lead="VERA propone eventos a partir de tus fuentes. Nada se considera confirmado hasta que tú lo revises.">
      <div className="progress-meter">
        <div className="stat-row"><span>Eventos revisados</span><strong>{reviewed} de {events.length}</strong></div>
        <div className="meter" role="progressbar" aria-label="Eventos revisados" aria-valuenow={reviewed} aria-valuemin={0} aria-valuemax={events.length}>
          <div style={{ width: events.length ? `${Math.round(reviewed / events.length * 100)}%` : '0%' }} /></div>
      </div>
    </PageTitle>
    {error && <p role="alert" className="error">{error}</p>}
    {(analyzing || !data) && !error ? <div className="card xl analyzing" role="status">
      <div className="brand-mark">V</div>
      <strong style={{ fontSize: 18, fontWeight: 650 }}>{analyzing ? 'VERA está organizando tus fuentes' : 'Cargando tu cronología…'}</strong>
      <span className="hint" style={{ fontSize: 14, maxWidth: 420 }}>{sourcesCount !== null ? `Leyendo ${plural(sourcesCount, 'fuente', 'fuentes')} de tu espacio privado.` : 'Leyendo tus fuentes.'} Cada evento conservará su fuente.</span>
    </div> : data && <div className="two-col">
      <div className="col-main">
        {events.length === 0 ? <div className="card card-pad"><p className="lead">VERA no encontró eventos en tus fuentes. Puedes completar tu relato o agregar evidencia y volver a procesar.</p></div> :
        <ol className="timeline" style={{ listStyle: 'none', margin: 0 }}>{events.map(event => {
          const state = event.status === 'discarded' ? 'ignored' : event.status === 'accepted' ? 'reviewed' : 'pending'
          const chip = event.status === 'discarded' ? ['muted', '–', 'Descartado'] : event.status === 'accepted'
            ? ['ok', '✓', event.edited ? 'Corregido por ti' : 'Confirmado'] : ['warn', '○', 'Pendiente de revisión']
          const isEditing = editing === event.id
          const quote = event.support_quotes?.length ? event.support_quotes.join(' … ') : event.source.quote
          const related = relatedTo(event)
          return <li className={`event ${state}`} key={event.id}>
            <span className="event-dot" aria-hidden="true" />
            <article className="event-card" aria-label={event.title ?? event.description}>
              <div className="event-head">
                <div><span className={`event-date${event.date_kind !== 'exact' ? ' approx' : ''}`}>{dateLabel(event)}</span>
                  <h2 className="event-title">{event.title ?? event.description}</h2></div>
                <span className={`chip ${chip[0]}`}>{chip[1]} {chip[2]}</span>
              </div>
              {isEditing ? <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label htmlFor={`edit-${event.id}`} style={{ fontSize: 12, fontWeight: 650, color: 'var(--text-2)' }}>Corrige la descripción con tus palabras</label>
                <textarea id={`edit-${event.id}`} className="edit-area" rows={3} maxLength={2000} value={editText} onChange={e => setEditText(e.target.value)} />
              </div> : <p className="event-desc">{event.description}</p>}
              <div className="quote"><span>Fragmento de la fuente</span><q>{quote}</q></div>
              {event.note && <span className="event-note">{event.note}</span>}
              <div className="chips">
                {documents(event).map(source => <button key={source.source_id} className="source-chip" onClick={() => openSource(source, event)}>
                  <span className="g">{docGlyph(source)}</span>{docName(source)} ↗</button>)}
                <span className="chip">{event.edited ? 'Corregido por ti' : 'Sugerido por VERA'}</span>
                {related.length > 0 && <span className="chip neutral">↔ Relacionado con Evento {related.join(', ')}</span>}
              </div>
              {isEditing ? <div className="event-actions">
                <button className="btn btn-ghost btn-md" onClick={() => setEditing(null)}>Cancelar</button>
                <button className="btn btn-primary btn-md" disabled={busy || !editText.trim()}
                  onClick={async () => { await review(event, 'accepted', { description: editText.trim() }, 'Corrección guardada.'); setEditing(null) }}>Guardar corrección</button>
              </div> : event.status === 'proposed' ? <div className="event-actions">
                <button className="btn btn-ghost btn-md" disabled={busy} onClick={() => review(event, 'discarded')}>Descartar</button>
                <button className="btn btn-secondary btn-md" disabled={busy} onClick={() => { setEditing(event.id); setEditText(event.description) }}>Corregir</button>
                <button className="btn btn-primary btn-md" disabled={busy} onClick={() => review(event, 'accepted', {}, 'Evento confirmado. Tú mantienes el control.')}>Confirmar</button>
              </div> : <div className="event-actions split">
                <span className="hint">{event.status === 'discarded' ? 'No se incluirá en el borrador.' : 'Se incluirá en el borrador.'}</span>
                <button className="btn btn-link btn-sm" disabled={busy} onClick={() => review(event, 'proposed')}>Deshacer</button>
              </div>}
            </article>
          </li>
        })}</ol>}
        <div className="footer-bar">
          <span>{pending ? `${plural(pending, 'evento pendiente no se incluirá', 'eventos pendientes no se incluirán')} en el borrador hasta que lo revises. Puedes continuar igualmente.`
            : 'Todos los eventos están revisados. El borrador usará solo los confirmados o corregidos.'}</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-ghost" disabled={busy || analyzing} onClick={() => analyze(data.revision)} title="Conserva lo que ya revisaste">Volver a procesar</button>
            <button className="btn btn-primary" onClick={() => navigate(recordPath(recordId, 'preparar'))}>Preparar reporte →</button>
          </div>
        </div>
      </div>
      <aside className="col-side sticky" aria-label="Revisión de contexto" style={{ gap: 12 }}>
        <div className="aside-title"><h3>Revisión de contexto</h3><span className="hint">{open} por revisar</span></div>
        {items.map(item => {
          const source = itemSource(item)
          return <div className="card review-card" key={item.id}>
            <div className="review-head"><span className={`review-icon ${item.kind}`} aria-hidden="true">{REVIEW_ICONS[item.kind]}</span>
              <div><strong>{REVIEW_TITLES[item.kind]}</strong><span>Sugerido por VERA</span></div></div>
            <p>{item.message}</p>
            {item.status === 'open' ? <div className="review-actions">
              {item.kind !== 'possible_relation' && source && <button className="btn btn-secondary btn-sm" onClick={source}>Ver fuente</button>}
              {item.kind === 'unlinked_evidence'
                ? <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => settle(item, 'resolved')}>Mantener sin vincular</button>
                : <button className="btn btn-primary btn-sm" disabled={busy}
                    onClick={() => settle(item, 'resolved', item.kind === 'possible_relation' ? 'Relación guardada para tu revisión.' : undefined)}>
                    {item.action_label ?? (item.kind === 'possible_relation' ? 'Relacionar' : 'Marcar como revisado')}</button>}
              {item.kind !== 'unlinked_evidence' && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => settle(item, 'dismissed')}>Ignorar</button>}
            </div> : <div className="review-actions" style={{ justifyContent: 'space-between' }}>
              <span className={`resolved${item.status === 'dismissed' ? ' ignored' : ''}`}>{closedText(item)}</span>
              <button className="btn btn-link btn-sm" disabled={busy} onClick={() => settle(item, 'open')}>Retomar</button>
            </div>}
          </div>
        })}
        {items.length === 0 && <p className="hint">No hay avisos por revisar.</p>}
        <div className="not-do"><strong>Lo que VERA no hace</strong>
          <span>No asigna puntajes, no evalúa credibilidad, no determina culpabilidad ni recomienda sanciones. Solo ordena y relaciona tus fuentes.</span></div>
      </aside>
    </div>}
    {drawer && <SourceDrawer recordId={recordId} source={drawer} events={events} onClose={() => setDrawer(null)} />}
  </>
}
