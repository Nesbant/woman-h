import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import type { Attachment, DraftFields, DraftState, FieldValue } from '../types'
import { navigate, recordPath } from '../router'
import { dateLabel, glyph, plural, shortSha } from '../format'
import { LockIcon, PageTitle, useFailure, useToast } from '../ui'
import { useRecordContext } from '../recordContext'
import { SourceDrawer } from '../SourceDrawer'
import type { DrawerSource } from '../SourceDrawer'

type AffectedKey = keyof DraftFields['affected']
type RespondentKey = keyof DraftFields['respondent']
const AFFECTED: [AffectedKey, string][] = [['name', 'Nombres'], ['document', 'Documento de identidad'], ['contact', 'Contacto'], ['position', 'Cargo'], ['area', 'Área'], ['relationship', 'Relación con la organización']]
const RESPONDENT: [RespondentKey, string][] = [['name', 'Nombre'], ['position', 'Cargo'], ['area', 'Área'], ['relationship', 'Relación con la persona afectada']]
const MISSING = 'Pendiente de confirmar'
const SAVE_MS = 600

/** Loads the draft and keeps it in sync with the reviewed timeline (created or refreshed when needed). */
export function useDraft(recordId: string) {
  const [state, setState] = useState<DraftState | null>(null)
  const [error, setError] = useState('')
  const fail = useFailure()
  useEffect(() => {
    let active = true
    api<DraftState>(`/records/${recordId}/complaint`).then(async current => {
      const next = !current.draft || current.draft.stale
        ? await api<DraftState>(`/records/${recordId}/complaint/generate`, { method: 'POST', body: JSON.stringify({ revision: current.timeline_revision }) })
        : current
      if (active) setState(next)
    }).catch(e => { if (active) fail(e, setError) })
    return () => { active = false }
  }, [recordId, fail])
  return { state, setState, error, setError }
}

export function draftBody(fields: DraftFields, revision: number) {
  const value = (field: FieldValue) => ({ value: field.value?.trim() || null })
  return {
    revision,
    affected: Object.fromEntries(AFFECTED.map(([key]) => [key, value(fields.affected[key])])),
    respondent: Object.fromEntries(RESPONDENT.map(([key]) => [key, value(fields.respondent[key])])),
    reporter_same_as_affected: fields.reporter.same_as_affected, reporter_name: value(fields.reporter.name),
    facts: [], consequences: value(fields.facts.consequences),
    measures: fields.protection_measures.selected, measures_other: fields.protection_measures.other?.trim() || null,
  }
}

export function Draft({ recordId }: { recordId: string }) {
  const { state, setState, error, setError } = useDraft(recordId)
  const [form, setForm] = useState<DraftFields | null>(null)
  const [files, setFiles] = useState<Attachment[]>([])
  const [saving, setSaving] = useState(false)
  const [drawer, setDrawer] = useState<DrawerSource | null>(null)
  const latest = useRef<DraftFields | null>(null)
  const revision = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const chain = useRef<Promise<void>>(Promise.resolve())
  const { overview, refresh } = useRecordContext()
  const { notify } = useToast()
  const fail = useFailure()

  useEffect(() => { api<{ items: Attachment[] }>(`/records/${recordId}/files`).then(v => setFiles(v.items)).catch(() => {}) }, [recordId])
  useEffect(() => {
    if (state?.draft && !latest.current) { latest.current = state.draft.fields; setForm(state.draft.fields) }
    if (state?.draft) revision.current = state.draft.revision
  }, [state])
  useEffect(() => () => clearTimeout(timer.current), [])

  /** Saves are serialized so each one uses the revision returned by the previous. */
  const flush = useCallback(() => {
    clearTimeout(timer.current)
    chain.current = chain.current.then(async () => {
      if (!latest.current) return
      setSaving(true)
      try {
        const next = await api<DraftState>(`/records/${recordId}/complaint`, { method: 'PUT', body: JSON.stringify(draftBody(latest.current, revision.current)) })
        revision.current = next.draft!.revision
        setState(next)
      } catch (e) { fail(e, setError) }
      finally { setSaving(false) }
    })
    return chain.current
  }, [recordId, setState, fail, setError])
  function change(update: (fields: DraftFields) => DraftFields) {
    if (!latest.current) return
    latest.current = update(latest.current); setForm(latest.current)
    clearTimeout(timer.current); timer.current = setTimeout(flush, SAVE_MS)
  }
  async function confirmPerson() {
    await flush()
    try {
      const next = await api<DraftState>(`/records/${recordId}/complaint/confirm-respondent`, { method: 'POST', body: JSON.stringify({ revision: revision.current }) })
      revision.current = next.draft!.revision; setState(next)
      latest.current = { ...latest.current!, respondent_confirmed: true }; setForm(latest.current)
      notify('Identidad confirmada por ti.'); refresh()
    } catch (e) { fail(e, setError) }
  }
  async function goShare() { await flush(); refresh(); navigate(recordPath(recordId, 'compartir')) }

  const draft = state?.draft
  const set = (current: FieldValue, value: string): FieldValue => ({ value, origin: 'person' })
  const facts = form?.facts.events ?? []
  const byId = new Map(files.map(f => [f.id, f]))
  // In the order of the events they support, as the organization will read them.
  const firstUse = (id: string) => facts.findIndex(f => f.sources.some(s => s.source_id === id))
  const evidence = [...(form?.evidence.file_ids ?? [])].sort((a, b) => firstUse(a) - firstUse(b)).map(id => ({ id, file: byId.get(id),
    supports: facts.map((f, i) => f.sources.some(s => s.source_id === id) ? `Evento ${i + 1}` : null).filter(Boolean).join(', ') }))
  const excluded = overview ? overview.timeline.total - overview.timeline.accepted : 0
  const gaps = (draft?.pending ?? []).filter(p => p.key === 'place' || p.key.startsWith('date.'))
  const detection = form?.respondent_detection
  const personPending = !!form?.respondent.name.value && !form.respondent_confirmed

  return <>
    <PageTitle eyebrow="Borrador estructurado · Paso 3 de 4" title="Preparar reporte" lead="Basado únicamente en información que revisaste. Todos los campos se pueden editar.">
      <button className="btn btn-primary" onClick={goShare} disabled={!draft}>Revisar y compartir →</button>
    </PageTitle>
    <div className="callout"><span className="icon"><LockIcon size={16} /></span>
      <span><strong>Este borrador sigue siendo privado.</strong> Prepararlo no crea un caso. Tu organización solo recibirá información después de tu confirmación explícita.</span></div>
    {error && <p role="alert" className="error">{error}</p>}
    {!form || !draft || !state ? !error && <p role="status" className="loading">Preparando tu borrador…</p> : <div className="two-col">
      <div className="col-main">
        <section className="panel" aria-labelledby="s1">
          <div className="panel-head"><span className="roman">I</span><h3 id="s1">Datos de la persona afectada</h3></div>
          <div className="panel-body field-grid">{AFFECTED.map(([key, label]) => <Field key={key} id={`affected-${key}`} label={label} field={form.affected[key]}
            onChange={v => change(f => ({ ...f, affected: { ...f.affected, [key]: set(f.affected[key], v) } }))} />)}</div>
          <div className="panel-foot">Fuente · Perfil confirmado por ti</div>
        </section>

        <section className="panel" aria-labelledby="s2">
          <div className="panel-head"><span className="roman">II</span><h3 id="s2">Persona contra quien se formula la queja</h3>
            {form.respondent.name.value && <span className={`chip ${personPending ? 'warn' : 'ok'}`}>{personPending ? 'Pendiente de confirmar' : '✓ Confirmado por ti'}</span>}</div>
          {personPending && <div className="person-banner">
            <span>VERA detectó este nombre en {detection?.found_in.join(' y en ') ?? 'tus fuentes'}. Confirma que la identidad es correcta antes de usarla. Si no la confirmas, no se compartirá.</span>
            <button className="btn btn-warn btn-sm" onClick={confirmPerson}>Confirmar identidad</button>
          </div>}
          <div className="panel-body field-grid">{RESPONDENT.map(([key, label]) => <Field key={key} id={`respondent-${key}`} label={label} field={form.respondent[key]}
            onChange={v => change(f => ({ ...f, respondent: { ...f.respondent, [key]: set(f.respondent[key], v) } }))} />)}</div>
          <div className="panel-foot">Fuente · {detection ? detection.found_in.map(s => s === 'tu relato' ? 'Relato personal' : s).join(' · ') : 'Ingresado por ti'}</div>
        </section>

        <section className="panel" aria-labelledby="s3">
          <div className="panel-head"><span className="roman">III</span><h3 id="s3">Persona que formula la queja</h3></div>
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label className="measure" style={{ padding: '10px 12px' }}><input type="checkbox" className="check" checked={form.reporter.same_as_affected}
              onChange={e => { const same = e.target.checked; change(f => ({ ...f, reporter: { ...f.reporter, same_as_affected: same } })) }} />
              <span><strong>Soy la persona afectada</strong><small>Si otra persona presenta el reporte, indícalo abajo.</small></span></label>
            {form.reporter.same_as_affected ? <Field id="reporter" label="Presenta el reporte" field={form.affected.name} readOnly onChange={() => {}} />
              : <Field id="reporter" label="Presenta el reporte" field={form.reporter.name} onChange={v => change(f => ({ ...f, reporter: { ...f.reporter, name: set(f.reporter.name, v) } }))} />}
          </div>
          <div className="panel-foot">{form.reporter.same_as_affected ? 'Coincide con la persona afectada' : 'Ingresado por ti'}</div>
        </section>

        <section className="panel" aria-labelledby="s4">
          <div className="panel-head"><span className="roman">IV</span><h3 id="s4">Detalle de los hechos</h3>
            <button className="btn btn-link btn-sm" onClick={() => navigate(recordPath(recordId, 'entender'))}>Volver a eventos</button></div>
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {facts.map((fact, i) => <div className="fact" key={fact.event_id}>
              <span>Evento {i + 1}</span>
              <div><span className={`date${fact.date_kind !== 'exact' ? ' approx' : ''}`}>{dateLabel(fact)}</span><strong>{fact.title}</strong><p>{fact.description}</p>
                {[...new Map(fact.sources.map(s => [s.source_id, s])).values()].map(s => <button key={s.source_id} className="src-link"
                  onClick={() => setDrawer({ kind: s.kind, source_id: s.source_id, label: s.label })}>← {s.kind === 'file' ? s.label.replace(/ · tu descripción$/, '') : 'Relato personal'}</button>)}</div>
            </div>)}
            {!facts.length && <span className="empty">Aún no hay eventos confirmados. Revisa la cronología para incluirlos.</span>}
            {gaps.length > 0 && <div className="gaps">{gaps.map(gap => <div key={gap.key}><span><strong>{gap.title}</strong> · {gap.detail}</span>
              <em>{gap.key === 'place' ? 'Pendiente de confirmar' : 'Aproximada'}</em></div>)}</div>}
            {excluded > 0 && <span className="hint">{plural(excluded, 'evento no se incluye', 'eventos no se incluyen')} (pendiente o descartado).</span>}
            <Field id="consequences" label="Consecuencias que quieras describir · opcional" field={form.facts.consequences}
              onChange={v => change(f => ({ ...f, facts: { ...f.facts, consequences: set(f.facts.consequences, v) } }))} />
          </div>
          <div className="panel-foot">Fuente · Eventos confirmados en Entender</div>
        </section>

        <section className="panel" aria-labelledby="s5">
          <div className="panel-head"><span className="roman">V</span><h3 id="s5">Medios probatorios</h3></div>
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {evidence.map(({ id, file, supports }) => <div className="evidence-row" key={id}>
              <span className="glyph sm">{file ? glyph(file.media_type) : 'DOC'}</span>
              <div className="file-name"><strong>{file?.filename ?? 'Archivo eliminado'}</strong><span>Respalda {supports}</span></div>
              {file && <span className="mono" title={file.sha256}>sha256 {shortSha(file.sha256)}</span>}
            </div>)}
            {!evidence.length && <span className="hint">Ninguna evidencia vinculada a eventos confirmados.</span>}
          </div>
          <div className="panel-foot">Fuente · Evidencias vinculadas a eventos confirmados</div>
        </section>

        <section className="panel" aria-labelledby="s6">
          <div className="panel-head"><span className="roman">VI</span><h3 id="s6">Medidas de protección que deseas solicitar</h3><span className="small">Opcional</span></div>
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {state.measure_options.map(option => {
              const on = form.protection_measures.selected.includes(option.code)
              return <label key={option.code} className={`measure${on ? ' on' : ''}`}>
                <input type="checkbox" className="check" checked={on} onChange={() => change(f => ({ ...f, protection_measures: { ...f.protection_measures,
                  selected: on ? f.protection_measures.selected.filter(c => c !== option.code) : [...f.protection_measures.selected, option.code] } }))} />
                <span><strong>{option.label}</strong><small>{option.help}</small></span></label>
            })}
            {form.protection_measures.selected.includes('other') && <label className="field"><span>Describe la medida con tus palabras</span>
              <input className="input" maxLength={1000} value={form.protection_measures.other ?? ''}
                onChange={e => { const v = e.target.value; change(f => ({ ...f, protection_measures: { ...f.protection_measures, other: v } })) }} /></label>}
            <span className="hint">VERA explica cada opción en lenguaje sencillo, pero no decide qué medida corresponde.</span>
          </div>
        </section>
      </div>

      <aside className="col-side sticky">
        <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 style={{ fontSize: 16, fontWeight: 650 }}>Estado del borrador</h3>
          <div className="stat-row"><span>Secciones</span><strong>6 de 6</strong></div>
          <div className="stat-row"><span>Eventos incluidos</span><strong>{facts.length}</strong></div>
          <div className="stat-row"><span>Evidencias</span><strong>{evidence.length}</strong></div>
          <div className="stat-row"><span>Medidas solicitadas</span><strong>{form.protection_measures.selected.length}</strong></div>
          <span className="save-state" role="status">{saving ? 'Guardando…' : 'Guardado automáticamente · privado'}</span>
        </div>
        <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h3 style={{ fontSize: 16, fontWeight: 650 }}>Por confirmar</h3>
          {draft.pending.map(item => <div className="pending-item" key={item.key}><span aria-hidden="true" /><div><strong>{item.title}</strong><small>{item.detail}</small></div></div>)}
          {!draft.pending.length && <span className="hint">Nada pendiente.</span>}
          <span className="small">Puedes continuar aunque estos datos no estén disponibles.</span>
        </div>
      </aside>
    </div>}
    {drawer && <SourceDrawer recordId={recordId} source={drawer} events={[]} onClose={() => setDrawer(null)} />}
  </>
}

function Field({ id, label, field, onChange, readOnly }: { id: string; label: string; field: FieldValue; onChange: (value: string) => void; readOnly?: boolean }) {
  const empty = !field.value
  return <label className="field" htmlFor={id}>
    <span>{label}{field.origin === 'detected' && <em style={{ fontStyle: 'normal', color: 'var(--warn)' }}>Detectado por VERA</em>}</span>
    <input id={id} className={`input${empty ? ' missing' : ''}`} maxLength={2000} value={field.value ?? ''} placeholder={MISSING} readOnly={readOnly}
      onChange={e => onChange(e.target.value)} />
  </label>
}
