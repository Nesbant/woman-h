export type ComposerAttachment = {
  key: string
  name: string
  status: 'uploading' | 'ready' | 'error' | 'removing'
  id?: string
  error?: string
}

export function AttachmentChips({ files, onRemove }: { files: ComposerAttachment[]; onRemove: (file: ComposerAttachment) => void }) {
  if (!files.length) return null
  return <ul className="attachment-chips" aria-label="Archivos para el siguiente mensaje" aria-live="polite">
    {files.map(file => <li className="chip outline" key={file.key}>
      <span className="attachment-name">{file.name}</span>
      <span className="attachment-state" role={file.status === 'error' ? 'alert' : 'status'}>
        {file.status === 'uploading' ? 'Subiendo…' : file.status === 'removing' ? 'Quitando…'
          : file.status === 'ready' ? 'Listo' : file.error ?? 'Error al subir'}
      </span>
      <button type="button" className="attachment-remove" aria-label={`Quitar ${file.name}`} disabled={file.status === 'uploading' || file.status === 'removing'}
        onClick={() => onRemove(file)}>×</button>
    </li>)}
  </ul>
}
