import { useCallback, useEffect, useState } from 'react'
import { api, apiBlob } from '../api'
import type { CaseDetail, CaseListing, CaseStatus, StepStatus } from '../types'
import { dateLabel, fullDate, shortDate, shortSha } from '../format'
import { PageTitle, useFailure, useToast } from '../ui'

export const STATUS_LABELS: Record<CaseStatus, string> = { new: 'Nuevo', in_review: 'En revisión', follow_up: 'Seguimiento', closed: 'Cerrado' }
const STEP_STATES: Record<StepStatus, [string, string]> = { pending: ['Pendiente', '○'], in_progress: ['En curso', '◐'], done: ['Completado', '✓'] }
const NEXT_STEP: Record<StepStatus, StepStatus> = { pending: 'in_progress', in_progress: 'done', done: 'pending' }

export function Institutional({ institutionId, name, userId }: { institutionId: string; name: string; userId: string }) {
  const [listing, setListing] = useState<CaseListing | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<CaseDetail | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { notify } = useToast()
  const fail = useFailure()
  const base = `/institutions/${institutionId}/cases`
  const load = useCallback(() => api<CaseListing>(base).then(value => {
    setListing(value); setSelected(current => current ?? value.items[0]?.case_id ?? null)
  }).catch(e => fail(e, setError)), [base, fail])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!selected) { setDetail(null); return }
    let active = true
    api<CaseDetail>(`${base}/${selected}`).then(value => { if (active) setDetail(value) }).catch(e => { if (active) fail(e, setError) })
    return () => { active = false }
  }, [base, selected, fail])

  async function change(path: string, body: object, message?: string) {
    if (!detail || busy) return
    setBusy(true); setError('')
    try {
      setDetail(await api<CaseDetail>(`${base}/${detail.case_id}${path}`, { method: 'PUT', body: JSON.stringify(body) }))
      if (message) notify(message)
      await load()
    } catch (e) { fail(e, setError) }
    finally { setBusy(false) }
  }
  async function download(file: CaseDetail['files'][number]) {
    try {
      const url = URL.createObjectURL(await apiBlob(`${base}/${detail!.case_id}/files/${file.id}/content`)), link = document.createElement('a')
      link.href = url; link.download = file.filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) { fail(e, setError) }
  }

  const counts = listing?.counts
  const kpis = counts ? [[counts.received, 'Casos recibidos'], [counts.new, 'Nuevos'], [counts.in_review + counts.follow_up, 'En revisión o seguimiento'], [counts.closed, 'Cerrados']] : []
  return <>
    <PageTitle inst eyebrow={`VERA Institutional · ${name}`} title="Casos recibidos"
      lead="Solo casos enviados explícitamente por las personas. Este espacio no puede ver, contar ni inferir registros privados." />
    {error && <p role="alert" className="error">{error}</p>}
    {!listing ? !error && <p role="status" className="loading">Cargando casos…</p> : <>
      <dl className="kpis">{kpis.map(([n, label]) => <div className="card kpi" key={label}><dt>{label}</dt><dd><strong>{n}</strong></dd></div>)}</dl>
      {listing.items.length === 0 ? <div className="card card-pad"><p className="lead">Aún no se recibieron casos.</p></div> : <div className="two-col" style={{ gap: 20 }}>
        <div className="panel case-table" role="table" aria-label="Casos recibidos">
          <div className="case-grid case-table-head" role="row"><span role="columnheader">Caso</span><span role="columnheader">Recibido</span><span role="columnheader">Estado</span><span role="columnheader">Responsable</span></div>
          {listing.items.map(item => <button key={item.case_id} role="row" className="case-row case-grid" aria-current={item.case_id === selected} onClick={() => setSelected(item.case_id)}>
            <strong role="cell">{item.case_id}</strong><span role="cell" className="muted">{shortDate(item.submitted_at)}</span>
            <span role="cell"><span className={`chip st-${item.status}`}>{STATUS_LABELS[item.status]}</span></span>
            <span role="cell" className={item.assignee ? '' : 'unassigned'}>{item.assignee?.name ?? 'Sin asignar'}</span>
          </button>)}
        </div>
        {detail && <CaseView detail={detail} userId={userId} busy={busy} onChange={change} onDownload={download} />}
      </div>}
    </>}
  </>
}

function CaseView({ detail, userId, busy, onChange, onDownload }: { detail: CaseDetail; userId: string; busy: boolean
  onChange: (path: string, body: object, message?: string) => void; onDownload: (file: CaseDetail['files'][number]) => void }) {
  const s = detail.snapshot
  const person = (name?: { value: string | null }, extra: (string | null | undefined)[] = []) =>
    [name?.value, extra.filter(Boolean).join(', ')].filter(Boolean).join(' · ') || 'No informado'
  const parties = [
    ['Persona afectada', person(s.affected.name, [s.affected.position?.value, s.affected.area?.value])],
    // An unconfirmed identity is never shared, so the organization cannot tell it apart from none at all.
    ['Persona mencionada', s.respondent.name?.value ? person(s.respondent.name, [s.respondent.position?.value]) : 'No informada'],
    ['Presenta el reporte', s.reporter.same_as_affected ? (s.affected.name?.value ?? 'La persona afectada') : (s.reporter.name.value ?? 'No informado')],
  ]
  const done = detail.procedure.filter(step => step.status === 'done').length
  const measures = s.protection_measures.selected.map(m => m.label)
  return <article className="card case-detail" aria-label={`Caso ${detail.case_id}`}>
    <div className="case-head">
      <div><span className={`chip st-${detail.status}`}>{STATUS_LABELS[detail.status]}</span><h2>Caso {detail.case_id}</h2>
        <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Recibido {fullDate(detail.submitted_at)} · Snapshot v1 · inmutable</span></div>
      <div><span className="small">Responsable</span>
        {detail.assignee ? <strong style={{ fontSize: 14, fontWeight: 600 }}>{detail.assignee.name}{detail.assignee.id === userId ? ' (tú)' : ''}</strong> : null}
        {detail.assignee?.id !== userId && <button className="btn btn-inst btn-md" disabled={busy} onClick={() => onChange('/assignee', { assignee_id: userId }, 'Responsable actualizado.')}>Asignarme</button>}
      </div>
    </div>
    <div className="status-bar"><span className="small" style={{ fontWeight: 600 }}>Estado</span>
      <div className="status-options" role="group" aria-label="Estado del caso">{(Object.keys(STATUS_LABELS) as CaseStatus[]).map(status =>
        <button key={status} aria-pressed={detail.status === status} disabled={busy} onClick={() => onChange('/status', { status })}>{STATUS_LABELS[status]}</button>)}</div>
    </div>
    <div className="case-body">
      <section className="case-section"><h3>Resumen</h3>
        <p>{s.summary ?? `Caso recibido con ${s.facts.events.length} eventos y ${s.evidence.length} archivos seleccionados por la persona.`}</p>
        <div className="parties boxed">{parties.map(([k, v]) => <div key={k}><span>{k}</span><span>{v}</span></div>)}</div>
      </section>
      <section className="case-section"><h3>Cronología recibida</h3>
        {s.facts.events.map((event, i) => <div className="case-event" key={i}><span>{event.date_kind === 'exact' ? dateLabel(event) : `≈ ${event.approximate_date ?? 'fecha por confirmar'}`}</span>
          <span>{event.title || event.description}</span></div>)}
        {!s.facts.events.length && <span className="hint">La persona no compartió hechos.</span>}
      </section>
      <section className="case-section"><h3>Evidencias recibidas</h3>
        {detail.files.map(file => <div className="case-file" key={file.id}><strong style={{ fontWeight: 600 }}>{file.filename}</strong>
          <span className="mono" title={file.sha256}>sha256 {shortSha(file.sha256)}</span><em>✓ Hash verificado</em>
          <button className="btn btn-link btn-sm" onClick={() => onDownload(file)}>Descargar</button></div>)}
        {!detail.files.length && <span className="hint">La persona no compartió archivos.</span>}
      </section>
      <section className="case-section"><h3>Medidas de protección solicitadas</h3>
        <span>{measures.length ? measures.join(' · ') : 'La persona no seleccionó medidas.'}{s.protection_measures.other ? ` · ${s.protection_measures.other}` : ''}</span></section>
      <section className="case-section">
        <div className="aside-title"><h3>Procedimiento</h3><span className="hint">{done} de {detail.procedure.length} completados</span></div>
        {detail.procedure.map(step => {
          const [label, icon] = STEP_STATES[step.status]
          return <div className="check-row" key={step.key}>
            <span className={`check-icon ${step.status}-state`} style={{ border: 0 }} aria-hidden="true">{icon}</span>
            <div><strong>{step.label}</strong><small>{step.description}</small></div>
            {step.reference && <span className="ref">{step.reference}</span>}
            <button className={`state-btn ${step.status}-state`} disabled={busy} aria-label={`${step.label}: ${label}. Cambiar estado`}
              title={step.updated_by?.name ? `Actualizado por ${step.updated_by.name}` : undefined}
              onClick={() => onChange(`/procedure/${step.key}`, { status: NEXT_STEP[step.status] })}>{label}</button>
          </div>
        })}
        <span className="small">Los plazos son referenciales. VERA no calcula días hábiles ni emite decisiones.</span>
      </section>
    </div>
    <div className="panel-foot" style={{ padding: '12px 22px' }}>Este caso es un snapshot limitado. No existe acceso al espacio privado de la persona.</div>
  </article>
}
