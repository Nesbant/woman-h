import { useEffect, useState } from 'react'
import { filePreview, getFile } from '../api/files'
import { getAccount, getOverview } from '../api/records'
import type { Attachment, SourceRef, TimelineEvent } from '../types'
import { fileMeta, shortSha } from '../format'
import { useFailure } from '../hooks/useFailure'
import { ErrorAlert } from './PageTitle'
import { Drawer } from './Overlays'

export type DrawerSource = { kind: SourceRef['kind']; source_id: string; label: string; quote?: string }
type Content = { file: Attachment | null; text: string | null; image: string | null }
const EMPTY: Content = { file: null, text: null, image: null }

async function loadFile(recordId: string, fileId: string, set: (c: Content) => void, active: () => boolean) {
  const file = await getFile(recordId, fileId)
  if (!active()) return null
  set({ file, text: file.description, image: null })
  const url = URL.createObjectURL(await filePreview(recordId, file.id))
  if (active()) set({ file, text: file.description, image: url })
  return url
}

async function loadText(recordId: string, source: DrawerSource) {
  if (source.kind === 'account') return (await getAccount(recordId, source.source_id)).description
  if (source.kind === 'person') return source.quote ?? null
  return (await getOverview(recordId)).story?.description ?? null
}

/** Loads what a source shows: the file with its preview and description, or the text of a relato. */
function useSourceContent(recordId: string, source: DrawerSource) {
  const [content, setContent] = useState<Content>(EMPTY)
  const [error, setError] = useState('')
  const fail = useFailure()
  useEffect(() => {
    let active = true, url: string | null = null
    const isActive = () => active
    setError(''); setContent(EMPTY)
    const load = source.kind === 'file'
      ? loadFile(recordId, source.source_id, setContent, isActive).then(value => { url = value })
      : loadText(recordId, source).then(text => { if (active) setContent({ ...EMPTY, text }) })
    load.catch(e => { if (active) fail(e, setError) })
    return () => { active = false; if (url) URL.revokeObjectURL(url) }
  }, [recordId, source, fail])
  return { ...content, error }
}

function kindLabel(source: DrawerSource, file: Attachment | null) {
  if (source.kind === 'file') return file?.media_type === 'application/pdf' ? 'Correo / PDF' : 'Imagen'
  return source.kind === 'person' ? 'Agregado por ti' : 'Relato'
}

function linkedEvents(events: TimelineEvent[], sourceId: string) {
  return events.filter(event => (event.sources?.length ? event.sources : [event.source]).some(s => s.source_id === sourceId) && event.status !== 'discarded')
}

function MissingText({ file }: { file: Attachment }) {
  return <p className="hint">{file.media_type === 'application/pdf' ? 'VERA lee el texto del PDF para proponer eventos.'
    : 'Sin descripción. VERA no lee imágenes: describe lo que muestra para usarla como fuente.'}</p>
}

/** Read-only view of one private source. Opening it never changes what will be shared. */
export function SourceDrawer({ recordId, source, events, onClose }: { recordId: string; source: DrawerSource; events: TimelineEvent[]; onClose: () => void }) {
  const { file, text, image, error } = useSourceContent(recordId, source)
  const linked = linkedEvents(events, source.source_id)
  const name = source.kind === 'file' ? (file?.filename ?? source.label.replace(/ · tu descripción$/, '')) : source.kind === 'person' ? 'Hecho agregado por ti' : 'Relato personal'
  return <Drawer label={`Fuente ${name}`} onClose={onClose}>
    <div className="drawer-head">
      <div><span className="eyebrow muted" style={{ letterSpacing: '.05em' }}>Fuente original · {kindLabel(source, file)}</span><strong>{name}</strong>
        <span className="small">{file ? fileMeta(file) : 'Escrito por ti'}</span></div>
      <button className="close" aria-label="Cerrar" onClick={onClose}>✕</button>
    </div>
    <div className="drawer-body">
      <div className="callout" style={{ fontSize: 13 }}><strong style={{ whiteSpace: 'nowrap' }}>Fuente privada.</strong> Verla aquí no cambia qué se compartirá.</div>
      {source.quote && source.kind !== 'person' && <div className="used-quote"><span>Fragmento usado por VERA</span><q>{source.quote}</q></div>}
      <ErrorAlert message={error} />
      {image && <img className="source-preview" src={image} alt={`Vista previa de ${name}`} />}
      {text ? <pre className="source-body">{text}</pre> : file && !file.description && <MissingText file={file} />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><span className="overline" style={{ letterSpacing: '.05em' }}>Eventos vinculados</span>
        <span style={{ fontSize: 14, color: 'var(--text-2)' }}>{linked.length ? linked.map(e => e.title ?? e.description).join(' · ') : 'Ninguno todavía'}</span></div>
      {file && <span className="mono" title={file.sha256}>sha256 {shortSha(file.sha256)}</span>}
    </div>
  </Drawer>
}
