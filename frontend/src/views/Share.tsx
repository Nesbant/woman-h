import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import type { Attachment, DraftState, Overview, Profile, Receipt } from '../types'
import { navigate, recordPath } from '../router'
import { dateLabel, fullDate, plural, shortSha } from '../format'
import { LockIcon, PageTitle, useFailure, useToast } from '../ui'
import { useRecordContext } from '../recordContext'
import { useDraft } from './Draft'

type Organization = { id: string; name: string }
type Row = { key: string; name: string; detail: string; kind: 'event' | 'file' }
const FIXED_PRIVATE = [
  { name: 'Relato personal completo', why: 'Los hechos derivados van en el borrador; el texto original no.' },
  { name: 'Nota privada', why: 'Nunca forma parte del expediente.' },
]

export function Share({ recordId }: { recordId: string }) {
  const { state, setState, error, setError } = useDraft(recordId)
  const [files, setFiles] = useState<Attachment[] | null>(null)
  const [org, setOrg] = useState<Organization | null>(null)
  const [selected, setSelected] = useState<Set<string> | null>(null)
  const [preview, setPreview] = useState(false)
  const [ack, setAck] = useState(false)
  const [sending, setSending] = useState(false)
  const { overview, refresh } = useRecordContext()
  const { notify } = useToast()
  const fail = useFailure()
  useEffect(() => {
    let active = true
    Promise.all([api<{ items: Attachment[] }>(`/records/${recordId}/files`), api<Profile>('/profile'), api<Organization[]>('/organizations')]).then(([list, profile, orgs]) => {
      if (!active) return
      setFiles(list.items); setOrg(profile.institution ?? orgs[0] ?? null)
    }).catch(e => { if (active) fail(e, setError) })
    return () => { active = false }
  }, [recordId, fail, setError])

  const draft = state?.draft
  const facts = useMemo(() => draft?.fields.facts.events ?? [], [draft])
  const rows = useMemo<Row[]>(() => {
    if (!draft || !files) return []
    const linked = new Set(draft.fields.evidence.file_ids)
    const eventOf = (id: string) => facts.findIndex(f => f.sources.some(s => s.source_id === id)) + 1
    return [
      ...facts.map((fact, i) => ({ key: fact.event_id, kind: 'event' as const, name: `Evento ${i + 1} · ${fact.title}`,
        detail: `Evento · ${[...new Set(fact.sources.map(s => s.kind === 'file' ? s.label.replace(/ · tu descripción$/, '') : 'Relato personal'))].join(', ')}` })),
      // Only files that still exist can be offered; a deleted one would be sent invisibly.
      ...files.filter(f => linked.has(f.id)).map(f => ({ key: f.id, kind: 'file' as const, name: f.filename, detail: `Archivo · vinculado al Evento ${eventOf(f.id)}` })),
      ...files.filter(f => !linked.has(f.id)).map(f => ({ key: f.id, kind: 'file' as const, name: f.filename, detail: 'Archivo · sin vincular a eventos' })),
    ]
  }, [draft, files, facts])
  useEffect(() => {
    if (!draft || !files || selected) return
    const linked = new Set(draft.fields.evidence.file_ids)
    setSelected(new Set([...facts.map(f => f.event_id), ...files.filter(f => linked.has(f.id)).map(f => f.id)]))
  }, [draft, files, facts, selected])

  const on = (key: string) => !!selected?.has(key)
  const toggle = (key: string) => setSelected(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next })
  const shared = rows.filter(r => on(r.key)), kept = rows.filter(r => !on(r.key))
  const sharedFacts = facts.filter(f => on(f.event_id))
  const sharedFiles = (files ?? []).filter(f => on(f.id))
  const sent = overview?.submissions[0]

  async function openPreview() {
    if (!draft) return
    setAck(false)
    try {
      if (!draft.reviewed) setState(await api<DraftState>(`/records/${recordId}/complaint/review`, { method: 'POST', body: JSON.stringify({ revision: draft.revision }) }))
      setPreview(true)
    } catch (e) { fail(e, setError) }
  }
  async function submit() {
    if (!ack) { notify('Marca la casilla para confirmar que revisaste la vista previa.'); return }
    if (!draft || !org) return
    setSending(true)
    try {
      const receipt = await api<Receipt>(`/records/${recordId}/submit`, { method: 'POST', body: JSON.stringify({
        draft_revision: draft.revision, event_ids: sharedFacts.map(f => f.event_id), file_ids: sharedFiles.map(f => f.id), institution_id: org.id }) })
      notify(`Caso ${receipt.case_id} creado · snapshot institucional v1`)
      refresh(); navigate(recordPath(recordId, 'enviado'))
    } catch (e) { setPreview(false); fail(e, setError) }
    finally { setSending(false) }
  }

  const f = draft?.fields
  const parties = f ? [
    { k: 'Persona afectada', v: [f.affected.name.value, [f.affected.position.value, f.affected.area.value].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || 'Pendiente de confirmar' },
    { k: 'Persona mencionada', v: !f.respondent.name.value ? 'No informada' : f.respondent_confirmed ? [f.respondent.name.value, f.respondent.position.value].filter(Boolean).join(' · ') : null },
    { k: 'Presenta el reporte', v: (f.reporter.same_as_affected ? f.affected.name.value : f.reporter.name.value) || 'Pendiente de confirmar' },
  ] : []
  const measures = f ? f.protection_measures.selected.map(code => state!.measure_options.find(o => o.code === code)?.label ?? code) : []
  const hidden = ['relato personal completo', 'nota privada', ...kept.map(r => r.name)]

  return <>
    <PageTitle eyebrow="Autorización explícita · Paso 4 de 4" title="Decide exactamente qué compartir"
      lead="Tener información en VERA no significa haberla reportado. Solo lo que selecciones pasará a tu organización." />
    {sent && <div className="callout ok"><span><strong>Ya enviaste el caso {sent.case_id} (snapshot v1).</strong> Si envías otra vez, se creará un caso nuevo con lo que selecciones; el snapshot enviado no cambia.</span></div>}
    {error && <p role="alert" className="error">{error}</p>}
    {!draft || !files || !selected ? !error && <p role="status" className="loading">Preparando la selección…</p> : <div className="two-col">
      <div className="col-main">
        <section className="panel" aria-labelledby="shared-title">
          <div className="panel-head split"><h3 id="shared-title">Se compartirá</h3><span className="chip ok">{plural(shared.length + 1, 'elemento', 'elementos')}</span></div>
          <div className="share-row fixed">
            <input type="checkbox" className="check" checked disabled aria-label="Borrador estructurado, siempre incluido" style={{ accentColor: 'var(--ok)' }} />
            <div><strong>Borrador estructurado · secciones I–VI</strong><small>Necesario para crear el caso · incluye solo eventos seleccionados</small></div>
            <em>Visible para la organización</em>
          </div>
          {shared.map(row => <label className="share-row" key={row.key}>
            <input type="checkbox" className="check" checked onChange={() => toggle(row.key)} />
            <div><strong>{row.name}</strong><small>{row.detail}</small></div><em>Visible para la organización</em></label>)}
          {!shared.length && <p className="hint" style={{ padding: '14px 20px' }}>No hay eventos ni archivos seleccionados. El caso solo incluiría el borrador.</p>}
        </section>
        <section className="panel" aria-labelledby="private-title">
          <div className="panel-head split"><h3 id="private-title">Seguirá privado</h3><span className="chip"><LockIcon size={12} width={1.8} />Solo tú</span></div>
          {kept.map(row => <label className="share-row private" key={row.key}>
            <input type="checkbox" className="check" checked={false} onChange={() => toggle(row.key)} />
            <div><strong>{row.name}</strong><small>{row.detail}</small></div><em>Privado</em></label>)}
          {FIXED_PRIVATE.map(item => <div className="share-row private fixed" key={item.name}>
            <span style={{ width: 18, flex: 'none', color: 'var(--brand-deep)', display: 'grid', placeItems: 'center' }}><LockIcon size={14} width={1.7} /></span>
            <div><strong>{item.name}</strong><small>{item.why}</small></div><em>Siempre privado</em></div>)}
        </section>
      </div>
      <aside className="col-side sticky" style={{ gap: 12 }}>
        <div className="org-card">
          <div className="org-card-head"><span>Lo que verá {org ? 'la organización' : 'la organización'}</span><span>Un snapshot independiente de tu espacio privado.</span></div>
          <div className="org-card-body">
            <div><span>Borrador estructurado</span><strong>Sí</strong></div>
            <div><span>Eventos</span><strong>{sharedFacts.length}</strong></div>
            <div><span>Archivos</span><strong>{sharedFiles.length}</strong></div>
            <div><span>Contenido privado</span><strong style={{ color: 'var(--brand-deep)' }}>No visible</strong></div>
          </div>
        </div>
        <button className="btn btn-primary btn-lg" onClick={openPreview} disabled={!org}>Revisar lo que verá la organización</button>
        <span className="caption">{org ? `Destino: ${org.name}. ` : 'No hay una organización configurada. '}Aún no se envía nada. Verás una vista previa exacta antes de confirmar.</span>
      </aside>
    </div>}

    {preview && f && org && <div className="modal-wrap" role="dialog" aria-modal="true" aria-labelledby="preview-title">
      <div className="modal">
        <div className="modal-head">
          <div><span className="eyebrow inst" style={{ fontSize: 11 }}>Vista previa exacta · VERA Institutional</span><strong id="preview-title">Así recibirá el caso tu organización</strong></div>
          <button className="close" aria-label="Cerrar" onClick={() => setPreview(false)}>✕</button>
        </div>
        <div className="modal-body">
          <div className="modal-section parties">{parties.map(p => <div key={p.k}><span>{p.k}</span>
            <span className={p.v ? '' : 'pending'}>{p.v ?? 'Sin confirmar · no se compartirá'}</span></div>)}</div>
          <div className="modal-section"><span className="overline">IV · Hechos ({sharedFacts.length})</span>
            {sharedFacts.map(fact => <div key={fact.event_id} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span className="small">{dateLabel(fact)}</span><strong style={{ fontSize: 14, fontWeight: 600 }}>{fact.title}</strong>
              <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{fact.description}</span></div>)}
            {!sharedFacts.length && <span className="hint">Ningún hecho seleccionado.</span>}</div>
          <div className="modal-section"><span className="overline">V · Evidencias ({sharedFiles.length})</span>
            {sharedFiles.map(file => <div key={file.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', fontSize: 14 }}>
              <strong style={{ fontWeight: 600 }}>{file.filename}</strong><span className="mono">sha256 {shortSha(file.sha256)}</span></div>)}
            {!sharedFiles.length && <span className="hint">Ningún archivo seleccionado.</span>}</div>
          <div className="modal-section"><span className="overline">VI · Medidas de protección</span>
            <span style={{ fontSize: 14, color: 'var(--text-2)' }}>{measures.length ? measures.join(' · ') : 'Sin seleccionar'}{f.protection_measures.other ? ` · ${f.protection_measures.other}` : ''}</span></div>
          <div className="modal-section"><span className="overline" style={{ color: 'var(--brand-deep)' }}>No verá</span>
            <span style={{ fontSize: 14, color: 'var(--text-2)' }}>{hidden.join(' · ')}</span></div>
        </div>
        <div className="modal-foot">
          <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer' }}>
            <input type="checkbox" className="check" style={{ width: 20, height: 20 }} checked={ack} onChange={() => setAck(v => !v)} />
            <span style={{ fontSize: 14, lineHeight: '21px' }}>Entiendo que, al confirmar, {org.name} recibirá únicamente los elementos mostrados y se creará un caso institucional.</span>
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => setPreview(false)}>Volver y editar</button>
            <button className="btn btn-primary" aria-disabled={!ack} disabled={sending} style={ack ? undefined : { background: '#B8A9C6', borderColor: '#B8A9C6', cursor: 'not-allowed' }}
              onClick={submit}>{sending ? 'Enviando…' : 'Confirmar y enviar'}</button>
          </div>
        </div>
      </div>
    </div>}
  </>
}

export function Sent({ recordId, demo, onDemo }: { recordId: string; demo: boolean; onDemo: (as: 'person' | 'organization') => void }) {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [error, setError] = useState('')
  const fail = useFailure()
  useEffect(() => { api<Overview>(`/records/${recordId}/overview`).then(setOverview).catch(e => fail(e, setError)) }, [recordId, fail])
  const sent = overview?.submissions[0]
  if (error) return <p role="alert" className="error">{error}</p>
  if (!overview) return <p role="status" className="loading">Cargando…</p>
  if (!sent) return <div className="callout"><span>Esta situación todavía no se ha enviado.</span>
    <button className="btn btn-primary btn-sm" onClick={() => navigate(recordPath(recordId, 'compartir'))}>Revisar y compartir</button></div>
  return <article className="card xl raised sent">
    <div className="sent-top"><span className="ok-mark" aria-hidden="true">✓</span><h1>Enviaste el caso {sent.case_id}</h1>
      <p className="lead">{sent.institution_name} recibió un snapshot con únicamente lo que seleccionaste.</p></div>
    <div className="sent-grid">
      <div><span>Caso</span><strong>{sent.case_id}</strong></div>
      <div><span>Enviado</span><strong>{fullDate(sent.submitted_at).replace(/^hoy, /, '')}</strong></div>
      <div><span>Snapshot</span><strong>v1 · congelado</strong></div>
      <div><span>Contenido</span><strong>{plural(sent.summary.events, 'evento', 'eventos')} · {plural(sent.summary.files.length, 'archivo', 'archivos')}</strong></div>
    </div>
    <div className="integrity"><span className="overline" style={{ letterSpacing: '.05em' }}>Integridad de archivos</span>
      {sent.summary.files.map(file => <div key={file.filename + file.sha256}><strong style={{ fontWeight: 600 }}>{file.filename}</strong>
        <span className="mono">original = copia · {shortSha(file.sha256)}</span><em>✓ Coincide</em></div>)}
      {!sent.summary.files.length && <span className="hint">No compartiste archivos.</span>}
    </div>
    <div className="callout" style={{ margin: '0 28px 20px', fontSize: 13, lineHeight: '19px' }}><span><strong>Tu espacio privado sigue siendo tuyo.</strong> Puedes seguir editándolo; esos cambios no modifican el snapshot enviado.</span></div>
    <div style={{ padding: '16px 28px 24px', display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end' }}>
      <button className="btn btn-secondary" onClick={() => navigate('')}>Volver a mi espacio</button>
      {demo && <button className="btn btn-inst" onClick={() => onDemo('organization')}>Ver como la organización (demo) →</button>}
    </div>
  </article>
}
