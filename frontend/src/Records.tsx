import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { api, ApiError } from './api'
import { Accounts } from './Accounts'
import { Files } from './Files'

export type PrivateRecord = { id: string; title: string; description: string; status: 'private_draft'; created_at: string; updated_at: string }
type Props = { onExpired: () => void }

function useRecordData<T>(path: string, onExpired: () => void) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    setData(null); setError('')
    api<T>(path).then(value => { if (active) setData(value) }).catch(e => {
      if (!active) return
      if (e instanceof ApiError && e.status === 401) onExpired()
      else setError(e.message)
    })
    return () => { active = false }
  }, [path, attempt, onExpired])
  return { data, error, retry: () => setAttempt(value => value + 1) }
}

function Failure({ message, retry }: { message: string; retry: () => void }) {
  return <div><p className="error" role="alert">{message}</p><button className="secondary" onClick={retry}>Reintentar</button></div>
}

function RecordForm({ record, onSaved, onCancel, onExpired }: Props & {
  record?: PrivateRecord; onSaved: (record: PrivateRecord) => void; onCancel: () => void
}) {
  const [title, setTitle] = useState(record?.title ?? '')
  const [description, setDescription] = useState(record?.description ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    if (!title.trim() || !description.trim()) { setError('Completa el título y la descripción.'); return }
    setBusy(true); setError('')
    try {
      const saved = await api<PrivateRecord>(record ? `/records/${record.id}` : '/records', {
        method: record ? 'PUT' : 'POST', body: JSON.stringify({ title, description })
      })
      onSaved(saved)
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onExpired()
      else setError((e as Error).message)
    } finally { setBusy(false) }
  }
  return <section className="card space"><h2>{record ? 'Editar registro' : 'Nuevo registro privado'}</h2>
    <p>Se guarda como borrador privado. Crear o editar este registro no envía información a ninguna institución.</p>
    <form onSubmit={save}>
      <fieldset disabled={busy}>
        <label htmlFor="record-title">Título</label>
        <input id="record-title" required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} />
        <label htmlFor="record-description">Descripción inicial</label>
        <textarea id="record-description" required maxLength={10000} rows={7} value={description} onChange={e => setDescription(e.target.value)} aria-describedby="description-hint" />
        <p id="description-hint" className="small">Hasta 10 000 caracteres. Durante el desarrollo, utiliza solo información ficticia.</p>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="actions"><button type="submit">{busy ? 'Guardando…' : record ? 'Guardar cambios' : 'Crear registro'}</button>
          <button type="button" className="secondary" onClick={onCancel}>Cancelar</button></div>
      </fieldset>
    </form>
  </section>
}

function RecordList({ onExpired, onOpen, onNew }: Props & { onOpen: (id: string) => void; onNew: () => void }) {
  const { data, error, retry } = useRecordData<PrivateRecord[]>('/records', onExpired)
  return <section aria-labelledby="records-heading"><div className="record-heading"><h2 id="records-heading">Mis registros</h2><button onClick={onNew}>Nuevo registro</button></div>
    {error ? <Failure message={error} retry={retry} /> : data === null ? <p role="status">Cargando tus registros…</p> : data.length === 0 ?
      <div className="notice"><h3>Aún no tienes registros</h3><p>Crea un registro para reunir información sobre una situación. Solo tú podrás consultarlo.</p></div> :
      <ul className="record-list">{data.map(record => <li className="card" key={record.id}>
        <span className="badge">Borrador privado</span><h3><button className="record-link" onClick={() => onOpen(record.id)}>{record.title}</button></h3>
        <p>Creado el {new Date(record.created_at).toLocaleString('es-PE')}</p>
      </li>)}</ul>}
  </section>
}

function RecordDetail({ id, onExpired, onBack }: Props & { id: string; onBack: () => void }) {
  const { data, error, retry } = useRecordData<PrivateRecord>(`/records/${id}`, onExpired)
  const [editing, setEditing] = useState(false)
  const [saved, setSaved] = useState(false)
  if (editing && data) return <RecordForm record={data} onExpired={onExpired} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); setSaved(true); retry() }} />
  return <section><button className="secondary" onClick={onBack}>Volver a mis registros</button>
    {error ? <Failure message={error} retry={retry} /> : data === null ? <p role="status">Cargando registro…</p> :
      <article className="card space record-detail"><span className="badge">Borrador privado</span><h2>{data.title}</h2>
        {saved && <p role="status">Cambios guardados.</p>}
        <p className="small">Creado el {new Date(data.created_at).toLocaleString('es-PE')}</p>
        <h3>Descripción inicial</h3><p className="record-description">{data.description}</p>
        <p className="notice">Este registro es privado. No se ha generado ningún reporte institucional.</p>
        <button onClick={() => { setSaved(false); setEditing(true) }}>Editar registro</button>
        <p><a href={`#/registros/${id}/cronologia`}>Entender lo ocurrido · cronología privada</a></p>
        <p><a href={`#/registros/${id}/queja`}>Preparar reporte</a></p>
      </article>}
    {data && !error && <Accounts key={`accounts-${id}`} recordId={id} onExpired={onExpired} />}
    {data && !error && <Files key={`files-${id}`} recordId={id} onExpired={onExpired} />}
  </section>
}

export function Records({ onExpired, view: controlledView, onView }: Props & {view?: string; onView?: (view: string) => void}) {
  const [localView, setLocalView] = useState('list')
  const view = controlledView ?? localView
  const setView = onView ?? setLocalView
  return <div className="records">
    {view === 'list' ? <RecordList onExpired={onExpired} onOpen={setView} onNew={() => setView('new')} /> :
      view === 'new' ? <RecordForm onExpired={onExpired} onCancel={() => setView('list')} onSaved={record => setView(record.id)} /> :
      <RecordDetail key={view} id={view} onExpired={onExpired} onBack={() => setView('list')} />}
  </div>
}
