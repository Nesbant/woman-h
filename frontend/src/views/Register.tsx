import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import type { Attachment, Overview } from '../types'
import { navigate, NEW_RECORD, recordPath } from '../router'
import { fileMeta, glyph } from '../format'
import { LockIcon, PageTitle, useFailure, useToast } from '../ui'
import { useRecordContext } from '../recordContext'
import { SourceDrawer } from '../SourceDrawer'
import type { DrawerSource } from '../SourceDrawer'

type Account = { id: string; description: string; date_kind: string; event_date: string | null; approximate_date: string | null; place: string | null; mentioned_people: string | null }
const PICKERS = [
  { label: '+ Captura', accept: 'image/png,image/jpeg,image/webp' },
  { label: '+ Correo / PDF', accept: 'application/pdf,.pdf' },
  { label: '+ Imagen', accept: 'image/*' },
]
const AUTOSAVE_MS = 700

export function Register({ recordId }: { recordId: string }) {
  const isNew = recordId === NEW_RECORD
  const [story, setStory] = useState('')
  const [note, setNote] = useState('')
  const [files, setFiles] = useState<Attachment[]>([])
  const [title, setTitle] = useState('Nueva situación')
  const [loaded, setLoaded] = useState(isNew)
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error, setError] = useState('')
  const [pending, setPending] = useState<File | null>(null)
  const [description, setDescription] = useState('')
  const [uploading, setUploading] = useState(false)
  const [drawer, setDrawer] = useState<DrawerSource | null>(null)
  const account = useRef<Account | null>(null)
  const entry = useRef(crypto.randomUUID())
  const creating = useRef<Promise<string> | null>(null)
  const target = useRef<'registrar' | 'entender'>('registrar')
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const picker = useRef<HTMLInputElement>(null)
  const { refresh } = useRecordContext()
  const { notify } = useToast()
  const fail = useFailure()

  useEffect(() => {
    if (isNew) return
    let active = true
    Promise.all([api<Overview>(`/records/${recordId}/overview`), api<{ items: Attachment[] }>(`/records/${recordId}/files`)]).then(async ([overview, list]) => {
      if (!active) return
      setTitle(overview.record.title); setNote(overview.record.private_note ?? ''); setFiles(list.items)
      if (overview.story) {
        account.current = await api<Account>(`/records/${recordId}/accounts/${overview.story.account_id}`)
        if (active) setStory(account.current.description)
      }
      if (active) setLoaded(true)
    }).catch(e => { if (active) fail(e, setError) })
    const pendingTimers = timers.current
    return () => { active = false; Object.values(pendingTimers).forEach(clearTimeout) }
  }, [recordId, isNew, fail])

  /** Creates the situation once, even if blur and click both ask for it; returns its id. */
  function ensureRecord(text: string) {
    if (!isNew) return Promise.resolve(recordId)
    creating.current ??= api<{ record_id: string }>('/start', { method: 'POST', body: JSON.stringify({ entry_id: entry.current, text }) })
      .then(created => created.record_id)
      .catch(error => { creating.current = null; throw error })
    return creating.current
  }
  async function saveStory(text: string) {
    if (!text.trim()) return
    setSaving('saving')
    try {
      if (isNew) {
        const id = await ensureRecord(text)
        // Read the destination after creating: a click on "Entender" during the save must win over the blur.
        refresh(); navigate(recordPath(id, target.current))
        return
      }
      const current = account.current
      account.current = current
        ? await api<Account>(`/records/${recordId}/accounts/${current.id}`, { method: 'PUT', body: JSON.stringify({
            description: text, date_kind: current.date_kind, event_date: current.event_date, approximate_date: current.approximate_date,
            place: current.place, mentioned_people: current.mentioned_people }) })
        : await api<Account>(`/records/${recordId}/accounts`, { method: 'POST', body: JSON.stringify({ description: text, date_kind: 'unknown' }) })
      setSaving('saved'); refresh()
    } catch (e) { setSaving('idle'); fail(e, setError) }
  }
  async function saveNote(text: string) {
    setSaving('saving')
    try { await api(`/records/${recordId}/note`, { method: 'PUT', body: JSON.stringify({ private_note: text }) }); setSaving('saved') }
    catch (e) { setSaving('idle'); fail(e, setError) }
  }
  function schedule(key: string, run: () => void) {
    clearTimeout(timers.current[key]); timers.current[key] = setTimeout(run, AUTOSAVE_MS)
  }
  async function upload() {
    if (!pending || isNew) return
    setUploading(true); setError('')
    const form = new FormData()
    form.append('file', pending)
    if (description.trim()) form.append('description', description.trim())
    try {
      const saved = await api<Attachment>(`/records/${recordId}/files`, { method: 'POST', body: form })
      setFiles(list => [...list, saved]); setPending(null); setDescription(''); refresh()
      notify('Evidencia guardada en tu espacio privado.')
    } catch (e) { fail(e, setError) }
    finally { setUploading(false) }
  }
  async function understand() {
    Object.values(timers.current).forEach(clearTimeout)
    if (isNew) { target.current = 'entender'; if (story.trim()) await saveStory(story); return }
    if (story.trim() && story !== account.current?.description) await saveStory(story)
    navigate(recordPath(recordId, 'entender'))
  }

  return <>
    <PageTitle eyebrow={`${title} · Paso 1 de 4`} title="Cuéntanos qué pasó o agrega lo que tengas"
      lead="No necesitas ordenar la información. Escribe de forma libre y añade evidencia cuando quieras." />
    {error && <p role="alert" className="error">{error}</p>}
    {!loaded ? !error && <p role="status" className="loading">Cargando tu registro…</p> : <div className="two-col">
      <div className="col-main card xl raised" style={{ padding: 24, gap: 22 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label htmlFor="story" className="overline">Tu relato</label>
          <textarea id="story" className="textarea" rows={6} style={{ minHeight: 150 }} maxLength={10000} value={story}
            placeholder="Puedes empezar por lo que recuerdas, con tus propias palabras…"
            onChange={e => { const text = e.target.value; setStory(text); setSaving('idle'); if (!isNew) schedule('story', () => saveStory(text)) }}
            onBlur={() => { if (isNew && story.trim()) saveStory(story) }} />
          <span className="hint">Las fechas aproximadas son válidas. Puedes corregir el relato mientras siga en tu espacio privado.</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <span className="overline">Evidencias</span><span className="hint">Agrégalas aunque no sepas a qué momento corresponden.</span>
          </div>
          {files.map(file => <div className="file-row" key={file.id}>
            <span className="glyph">{glyph(file.media_type)}</span>
            <div className="file-name"><strong>{file.filename}</strong><span>{fileMeta(file)}</span></div>
            <span className="chip">Privado</span>
            <button className="btn btn-link btn-sm" onClick={() => setDrawer({ kind: 'file', source_id: file.id, label: file.filename })}>Ver</button>
          </div>)}
          {pending ? <div className="upload-form">
            <strong style={{ fontSize: 14 }}>{pending.name}</strong>
            <label className="field"><span>¿Qué muestra? · opcional</span>
              <textarea className="textarea" rows={2} maxLength={2000} value={description} onChange={e => setDescription(e.target.value)}
                placeholder="Por ejemplo: mensaje recibido el 16/09/2026 a las 22:43…" /></label>
            <span className="small">VERA no lee imágenes. Si describes lo que muestra, podrá usar tu descripción como fuente.</span>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => { setPending(null); setDescription(''); setError('') }} disabled={uploading}>Cancelar</button>
              <button className="btn btn-primary btn-sm" onClick={upload} disabled={uploading}>{uploading ? 'Guardando…' : 'Guardar evidencia'}</button>
            </div>
          </div> : <div className="add-grid">
            {PICKERS.map(p => <button key={p.label} className="add-tile" disabled={isNew} title={isNew ? 'Escribe tu relato para poder adjuntar evidencia' : undefined}
              onClick={() => { if (picker.current) { picker.current.accept = p.accept; picker.current.click() } }}>{p.label}</button>)}
            <input ref={picker} type="file" hidden onChange={e => { const file = e.target.files?.[0]; if (file) { setPending(file); setError('') } e.target.value = '' }} />
          </div>}
          {isNew && <span className="small">Escribe tu relato para empezar; luego podrás adjuntar evidencia.</span>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label htmlFor="note" className="overline">Nota privada <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500, color: 'var(--text-3)' }}>· opcional, nunca forma parte del expediente</span></label>
          <textarea id="note" className="textarea" rows={2} style={{ fontSize: 14, lineHeight: '21px', padding: '12px 14px' }} maxLength={5000} value={note} disabled={isNew}
            onChange={e => { const text = e.target.value; setNote(text); schedule('note', () => saveNote(text)) }} />
        </div>
        <div className="form-foot">
          <span className="hint" role="status">{saving === 'saving' ? 'Guardando…' : 'Guardado automáticamente · solo en tu espacio'}</span>
          <button className="btn btn-primary" onClick={understand} disabled={isNew && !story.trim()}>Entender lo ocurrido →</button>
        </div>
      </div>
      <aside className="col-side">
        <div className="callout"><span className="icon"><LockIcon size={16} /></span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><strong>Solo tú puedes ver esto.</strong><span style={{ fontSize: 13, lineHeight: '19px' }}>Añadir evidencia no la envía a tu organización.</span></div></div>
        <div className="card guide" style={{ padding: 18, gap: 14 }}>
          <h3 style={{ fontSize: 16, lineHeight: '22px' }}>No necesitas completar todo</h3>
          <div className="numbered warn"><span>≈</span><div><strong>Fechas aproximadas son válidas</strong><span>VERA puede usar “mediados de septiembre” hasta que confirmes algo más preciso.</span></div></div>
          <div className="numbered"><span>?</span><div><strong>Los vacíos quedan visibles</strong><span>VERA no inventará datos para completar un formulario.</span></div></div>
        </div>
      </aside>
    </div>}
    {drawer && !isNew && <SourceDrawer recordId={recordId} source={drawer} events={[]} onClose={() => setDrawer(null)} />}
  </>
}
