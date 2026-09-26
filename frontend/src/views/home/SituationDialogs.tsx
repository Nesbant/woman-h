import { useState } from 'react'
import type { Overview } from '../../types'
import { ConfirmDialog } from '../../components/Overlays'
import { ErrorAlert } from '../../components/PageTitle'

export function RenameDialog({ overview, busy, error, onSave, onCancel }: { overview: Overview; busy: boolean; error: string; onSave: (title: string) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(overview.record.title)
  return <ConfirmDialog title="Renombrar situación" confirmLabel="Guardar nombre" busy={busy}
    onConfirm={() => { if (title.trim()) onSave(title.trim()) }} onCancel={onCancel}>
    <label className="field"><span>Nombre</span><input className="input" autoFocus maxLength={200} value={title} onChange={e => setTitle(e.target.value)} /></label>
    <span className="small">Solo tú ves este nombre.</span>
    <ErrorAlert message={error} />
  </ConfirmDialog>
}

/** Decision D1: private data goes; cases already sent stay with the organization, and the person is told so. */
export function DeleteDialog({ overview, busy, error, onDelete, onCancel }: { overview: Overview; busy: boolean; error: string; onDelete: () => void; onCancel: () => void }) {
  const sent = overview.submissions
  return <ConfirmDialog title={`Eliminar ${overview.record.title}`} confirmLabel="Eliminar definitivamente" danger busy={busy} onConfirm={onDelete} onCancel={onCancel}>
    <p>Se eliminarán de tu espacio el relato, las evidencias, la nota privada, la cronología y el borrador. No se puede deshacer.</p>
    {sent.length > 0 && <div className="callout" role="note"><span><strong>Tu organización conserva {sent.length === 1 ? 'el caso' : 'los casos'} {sent.map(s => `${s.case_id} (${s.institution_name})`).join(', ')}.</strong> Lo que ya enviaste es una copia independiente: eliminar esta situación no lo retira.</span></div>}
    <ErrorAlert message={error} />
  </ConfirmDialog>
}
