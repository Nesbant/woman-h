import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { api, ApiError } from './api'
import { Records } from './Records'
import type { PrivateRecord } from './Records'
import { VoiceCapture } from './VoiceCapture'
import { AttachmentStep } from './AttachmentStep'
import { Timeline } from './Timeline'
import { Complaint, Share } from './Complaint'

const draftKey = (userId: string) => `vera:start:${userId}`
type Draft = { entry_id: string; text: string; voice?: boolean }
export function clearStartDraft(userId: string) {
  try { sessionStorage.removeItem(draftKey(userId)) } catch { /* No almacenamiento disponible. */ }
}
export function navigate(route: string) { window.location.hash = `/${route}` }
export function useRoute() {
  const read = () => window.location.hash.replace(/^#\/?/, '') || 'inicio'
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const update = () => { setRoute(read()); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])
  return route
}

function useDraft(userId: string) {
  const [draft, setDraft] = useState<Draft>(() => {
    try {
      const value = JSON.parse(sessionStorage.getItem(draftKey(userId)) || 'null')
      if (value && typeof value.text === 'string' && value.text.length <= 10000 &&
        typeof value.entry_id === 'string' && /^[0-9a-f-]{36}$/i.test(value.entry_id)) return {entry_id:value.entry_id, text:value.text, voice:value.voice === true}
    } catch { /* Se informa si el próximo guardado falla. */ }
    return {entry_id: crypto.randomUUID(), text: ''}
  })
  const [storageError, setStorageError] = useState(false)
  const latest = useRef(draft)
  function change(text: string, voice = false) {
    const next = {...latest.current, text, voice: latest.current.voice === true || voice}
    latest.current = next
    setDraft(next)
    try { sessionStorage.setItem(draftKey(userId), JSON.stringify(next)); setStorageError(false) }
    catch { setStorageError(true) }
  }
  function complete(submitted: Draft) {
    if (latest.current.entry_id !== submitted.entry_id || latest.current.text !== submitted.text) return
    clearStartDraft(userId)
    const empty = {entry_id: crypto.randomUUID(), text: ''}
    latest.current = empty
    setDraft(empty)
    setStorageError(false)
  }
  return {draft, change, complete, storageError}
}

function Home({ draft, change, complete, storageError, onExpired }: ReturnType<typeof useDraft> & { onExpired: () => void }) {
  const [records, setRecords] = useState<PrivateRecord[] | null>(null)
  const [listError, setListError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'text' | 'voice'>('text')
  const [voiceBusy, setVoiceBusy] = useState(false)
  const [reviewed, setReviewed] = useState(false)
  const active = useRef(true)
  const saving = useRef(false)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  useEffect(() => {
    let current = true
    setRecords(null); setListError('')
    api<PrivateRecord[]>('/records').then(data => {
      if (current) setRecords([...data].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 3))
    }).catch(e => {
      if (!current) return
      if (e instanceof ApiError && e.status === 401) onExpired()
      else setListError(e.message)
    })
    return () => { current = false }
  }, [attempt, onExpired])
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (saving.current || voiceBusy) return
    if (draft.voice && !reviewed) { setError('Revisa y confirma el texto obtenido antes de continuar.'); return }
    if (!draft.text.trim()) { setError('Escribe lo que quieras contar antes de continuar.'); return }
    saving.current = true; setBusy(true); setError('')
    try {
      const body = {entry_id:draft.entry_id, text:draft.text, ...(draft.voice ? {source:'voice', reviewed} : {})}
      const result = await api<{record_id: string; account_id: string}>('/start', {method: 'POST', body: JSON.stringify(body)})
      if (active.current) { complete(draft); navigate(`registros/${result.record_id}/archivos`) }
    } catch (e) {
      if (!active.current) return
      if (e instanceof ApiError && e.status === 401) onExpired()
      else setError('No pudimos guardar tu registro. Tu texto sigue aquí; puedes volver a intentar.')
    } finally { saving.current = false; if (active.current) setBusy(false) }
  }
  return <div className="home-page">
    <section className="home-intro"><p className="eyebrow">TU ESPACIO, A TU RITMO</p>
      <h1>¿Quieres contar<br className="desktop-break" /> qué ocurrió?</h1>
      <p>No necesitas tener todo claro. Puedes empezar por lo que recuerdas.</p>
    </section>
    <form className="story-composer" onSubmit={submit}>
      <div className="composer-modes" role="group" aria-label="Cómo quieres contar lo ocurrido">
        <button type="button" disabled={busy} aria-pressed={mode === 'text'} onClick={() => {setMode('text'); setVoiceBusy(false)}}>Escribir</button>
        <button type="button" disabled={busy} aria-pressed={mode === 'voice'} onClick={() => setMode('voice')}>Contarlo por voz</button>
      </div>
      {mode === 'voice' && !busy && <VoiceCapture text={draft.text} onText={text => {change(text, true); setReviewed(false)}} onBusy={setVoiceBusy}
        onWrite={() => {setMode('text'); setVoiceBusy(false)}} />}
      <label htmlFor="start-text">Te leemos</label>
      <textarea id="start-text" maxLength={10000} rows={5} disabled={busy || voiceBusy} value={draft.text}
        onChange={e => {change(e.target.value); setReviewed(false)}} placeholder="Puedes empezar aquí, con tus propias palabras…" aria-describedby="start-privacy draft-status" />
      {draft.voice && <div className="voice-review"><p>{reviewed ? 'Texto revisado. Continúa cuando quieras guardarlo.' : 'Texto obtenido por voz · Pendiente de tu revisión. Puedes corregirlo arriba.'}</p>
        <label className="check-label"><input type="checkbox" checked={reviewed} disabled={voiceBusy || busy} onChange={e => setReviewed(e.target.checked)} />He revisado y corregido el texto.</label></div>}
      <div className="composer-bottom"><p id="start-privacy"><span className="privacy-mark" aria-hidden="true">◈</span> Esto permanece privado. No se envía a ninguna institución.</p>
        <button disabled={busy || voiceBusy || (!!draft.voice && !reviewed)} type="submit">{busy ? 'Guardando…' : 'Continuar'} <span aria-hidden="true">→</span></button></div>
      <div className="draft-line"><p id="draft-status" role={storageError ? 'alert' : undefined} className={storageError ? 'error' : ''}>
        {storageError ? 'No se pudo guardar el borrador en esta pestaña. Pulsa Continuar antes de salir.' : draft.text ? 'Borrador conservado en esta pestaña. Se elimina al cerrar sesión.' : 'Puedes añadir fechas, un título o archivos después.'}</p>
        <span>{draft.text.length.toLocaleString('es-PE')} / 10 000</span></div>
      {busy && <p role="status">Guardando tu registro privado…</p>}
      {error && <p role="alert" className="error">{error}</p>}
    </form>
    <section className="home-recent" aria-labelledby="recent-heading"><div className="record-heading"><h2 id="recent-heading">Tus registros recientes</h2>
      <a className="text-link" href="#/registros">Ver todos <span aria-hidden="true">↗</span></a></div>
      <p className="section-hint">Vuelve cuando quieras. Puedes seguir a tu ritmo.</p>
      {listError ? <div className="home-empty"><p role="alert" className="error">No pudimos cargar tus registros. Tu texto no se ha perdido.</p><button className="secondary" onClick={() => setAttempt(v => v + 1)}>Reintentar registros</button></div> :
        records === null ? <div className="home-empty" role="status"><span className="loading-dot" aria-hidden="true" /> Cargando tus registros…</div> :
          records.length === 0 ? <div className="home-empty"><span className="empty-symbol" aria-hidden="true">✎</span><div><h3>Este espacio empieza contigo</h3><p>Cuando continúes, tu primer registro aparecerá aquí.</p></div></div> :
            <ul className="recent-grid">{records.map(record => <li key={record.id}><a href={`#/registros/${record.id}`} className="recent-card">
              <span className="badge">Privado · Borrador</span><h3>{record.title}</h3><p className="recent-excerpt">{record.description}</p>
              <div className="recent-footer"><time dateTime={record.updated_at}>{new Date(record.updated_at).toLocaleDateString('es-PE', {day:'numeric',month:'short'})}</time><span>Retomar <span aria-hidden="true">→</span></span></div>
            </a></li>)}</ul>}
    </section>
  </div>
}

export function PrivateWorkspace({ userId, route, onExpired }: {userId: string; route: string; onExpired: () => void}) {
  const draft = useDraft(userId)
  const timeline = /^registros\/([^/]+)\/cronologia$/.exec(route)
  if (timeline) return <Timeline key={timeline[1]} recordId={timeline[1]} onExpired={onExpired} />
  const complaint = /^registros\/([^/]+)\/(queja|compartir)$/.exec(route)
  if (complaint) return complaint[2] === 'queja' ? <Complaint key={complaint[1]} recordId={complaint[1]} onExpired={onExpired} />
    : <Share key={complaint[1]} recordId={complaint[1]} onExpired={onExpired} />
  const step = /^registros\/([^/]+)\/(archivos|relato)$/.exec(route)
  if (step) return <AttachmentStep key={step[1]} recordId={step[1]} relato={step[2] === 'relato'} onExpired={onExpired} />
  if (route === 'registros' || route.startsWith('registros/')) {
    const view = route === 'registros' ? 'list' : route.slice('registros/'.length)
    return <Records view={view} onView={value => navigate(value === 'list' ? 'registros' : `registros/${value}`)} onExpired={onExpired} />
  }
  return <Home {...draft} onExpired={onExpired} />
}
