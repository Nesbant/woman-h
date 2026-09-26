import { useRef, useState } from 'react'

const PICKERS = [
  { label: '+ Captura', accept: 'image/png,image/jpeg,image/webp' },
  { label: '+ Correo / PDF', accept: 'application/pdf,.pdf' },
  { label: '+ Imagen', accept: 'image/*' },
]

type Props = { disabled: boolean; busy: boolean; onUpload: (file: File, description: string) => Promise<boolean>; onPick: () => void }

export function UploadForm({ disabled, busy, onUpload, onPick }: Props) {
  const [pending, setPending] = useState<File | null>(null)
  const [description, setDescription] = useState('')
  const picker = useRef<HTMLInputElement>(null)
  const reset = () => { setPending(null); setDescription(''); onPick() }
  if (pending) return <div className="upload-form">
    <strong style={{ fontSize: 14 }}>{pending.name}</strong>
    <label className="field"><span>¿Qué muestra? · opcional</span>
      <textarea className="textarea" rows={2} maxLength={2000} value={description} onChange={e => setDescription(e.target.value)}
        placeholder="Por ejemplo: mensaje recibido el 16/09/2026 a las 22:43…" /></label>
    <span className="small">VERA no lee imágenes. Si describes lo que muestra, podrá usar tu descripción como fuente.</span>
    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
      <button className="btn btn-ghost btn-sm" onClick={reset} disabled={busy}>Cancelar</button>
      <button className="btn btn-primary btn-sm" disabled={busy} onClick={async () => { if (await onUpload(pending, description)) reset() }}>{busy ? 'Guardando…' : 'Guardar evidencia'}</button>
    </div>
  </div>
  return <div className="add-grid">
    {PICKERS.map(p => <button key={p.label} className="add-tile" disabled={disabled} title={disabled ? 'Escribe tu relato para poder adjuntar evidencia' : undefined}
      onClick={() => { if (picker.current) { picker.current.accept = p.accept; picker.current.click() } }}>{p.label}</button>)}
    <input ref={picker} type="file" hidden onChange={e => { const file = e.target.files?.[0]; if (file) { setPending(file); onPick() } e.target.value = '' }} />
  </div>
}
