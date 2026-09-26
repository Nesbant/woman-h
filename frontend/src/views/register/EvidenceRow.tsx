import { useState } from 'react'
import type { Attachment } from '../../types'
import { fileMeta, glyph } from '../../format'
import { ConfirmDialog } from '../../components/Overlays'

type Props = { file: Attachment; busy: boolean; onView: () => void; onDescribe: (text: string) => Promise<boolean>; onDelete: () => Promise<boolean> }

function DescriptionEditor({ file, busy, onSave, onCancel }: { file: Attachment; busy: boolean; onSave: (text: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(file.description ?? '')
  return <div className="upload-form" style={{ marginTop: 8 }}>
    <label className="field"><span>¿Qué muestra {file.filename}?</span>
      <textarea className="textarea" rows={4} maxLength={2000} value={text} onChange={e => setText(e.target.value)} /></label>
    <span className="small">Tu descripción es la fuente que VERA usa para esta evidencia. Vuelve a procesar la cronología para aplicar el cambio.</span>
    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
      <button className="btn btn-ghost btn-sm" onClick={onCancel} disabled={busy}>Cancelar</button>
      <button className="btn btn-primary btn-sm" onClick={() => onSave(text)} disabled={busy}>Guardar descripción</button>
    </div>
  </div>
}

export function EvidenceRow({ file, busy, onView, onDescribe, onDelete }: Props) {
  const [mode, setMode] = useState<'view' | 'edit' | 'delete'>('view')
  return <div>
    <div className="file-row">
      <span className="glyph">{glyph(file.media_type)}</span>
      <div className="file-name"><strong>{file.filename}</strong><span>{fileMeta(file)}{file.description ? ' · con descripción' : ''}</span></div>
      <span className="chip">Privado</span>
      <div className="menu-actions">
        <button className="btn btn-link btn-sm" onClick={onView}>Ver</button>
        <button className="btn btn-link btn-sm" onClick={() => setMode('edit')} aria-label={`Describir ${file.filename}`}>Describir</button>
        <button className="btn btn-link btn-sm danger" onClick={() => setMode('delete')} aria-label={`Eliminar ${file.filename}`}>Eliminar</button>
      </div>
    </div>
    {mode === 'edit' && <DescriptionEditor file={file} busy={busy} onCancel={() => setMode('view')}
      onSave={async text => { if (await onDescribe(text)) setMode('view') }} />}
    {mode === 'delete' && <ConfirmDialog title={`Eliminar ${file.filename}`} confirmLabel="Eliminar evidencia" danger busy={busy}
      onCancel={() => setMode('view')} onConfirm={async () => { if (await onDelete()) setMode('view') }}>
      <p>Se elimina de tu espacio el archivo original y su vista previa. Si ya lo enviaste, tu organización conserva su copia.</p>
    </ConfirmDialog>}
  </div>
}
