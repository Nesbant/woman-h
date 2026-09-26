import { useEffect, useState } from 'react'
import { api, apiBlob } from './api'
import type { Attachment, Overview, SourceRef, TimelineEvent } from './types'
import { fileMeta, shortSha } from './format'
import { Drawer, useFailure } from './ui'

export type DrawerSource = { kind: SourceRef['kind']; source_id: string; label: string; quote?: string }

/** Read-only view of one private source. Opening it never changes what will be shared. */
export function SourceDrawer({ recordId, source, events, onClose }: { recordId: string; source: DrawerSource; events: TimelineEvent[]; onClose: () => void }) {
  const [file, setFile] = useState<Attachment | null>(null)
  const [text, setText] = useState<string | null>(null)
  const [image, setImage] = useState<string | null>(null)
  const [error, setError] = useState('')
  const fail = useFailure()
  useEffect(() => {
    let active = true, url: string | null = null
    setError(''); setFile(null); setText(null); setImage(null)
    const load = source.kind === 'file'
      ? api<Attachment>(`/records/${recordId}/files/${source.source_id}`).then(async meta => {
          if (!active) return
          setFile(meta); setText(meta.description)
          url = URL.createObjectURL(await apiBlob(`/records/${recordId}/files/${meta.id}/preview`))
          if (active) setImage(url)
        })
      : source.kind === 'account'
        ? api<{ description: string }>(`/records/${recordId}/accounts/${source.source_id}`).then(a => { if (active) setText(a.description) })
        : api<Overview>(`/records/${recordId}/overview`).then(o => { if (active) setText(o.story?.description ?? null) })
    load.catch(e => { if (active) fail(e, setError) })
    return () => { active = false; if (url) URL.revokeObjectURL(url) }
  }, [recordId, source, fail])
  const linked = events.filter(event => (event.sources?.length ? event.sources : [event.source]).some(s => s.source_id === source.source_id) && event.status !== 'discarded')
  const kind = source.kind === 'file' ? (file?.media_type === 'application/pdf' ? 'Correo / PDF' : 'Imagen') : 'Relato'
  const name = source.kind === 'file' ? (file?.filename ?? source.label.replace(/ · tu descripción$/, '')) : 'Relato personal'
  return <Drawer label={`Fuente ${name}`} onClose={onClose}>
    <div className="drawer-head">
      <div><span className="eyebrow muted" style={{ letterSpacing: '.05em' }}>Fuente original · {kind}</span><strong>{name}</strong>
        <span className="small">{file ? fileMeta(file) : 'Escrito por ti'}</span></div>
      <button className="close" aria-label="Cerrar" onClick={onClose}>✕</button>
    </div>
    <div className="drawer-body">
      <div className="callout" style={{ fontSize: 13 }}><strong style={{ whiteSpace: 'nowrap' }}>Fuente privada.</strong> Verla aquí no cambia qué se compartirá.</div>
      {source.quote && <div className="used-quote"><span>Fragmento usado por VERA</span><q>{source.quote}</q></div>}
      {error && <p role="alert" className="error">{error}</p>}
      {image && <img className="source-preview" src={image} alt={`Vista previa de ${name}`} />}
      {text ? <pre className="source-body">{text}</pre> : source.kind === 'file' && file && !file.description &&
        <p className="hint">{file.media_type === 'application/pdf' ? 'VERA lee el texto del PDF para proponer eventos.' : 'Sin descripción. VERA no lee imágenes: describe lo que muestra para usarla como fuente.'}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><span className="overline" style={{ letterSpacing: '.05em' }}>Eventos vinculados</span>
        <span style={{ fontSize: 14, color: 'var(--text-2)' }}>{linked.length ? linked.map(e => e.title ?? e.description).join(' · ') : 'Ninguno todavía'}</span></div>
      {file && <span className="mono" title={file.sha256}>sha256 {shortSha(file.sha256)}</span>}
    </div>
  </Drawer>
}
