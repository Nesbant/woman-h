import { useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { AttachmentChips } from './AttachmentChips'
import type { ComposerAttachment } from './AttachmentChips'

type Props = {
  text: string
  onTextChange: (text: string) => void
  onSend: () => void
  onUpload: (file: File, description: string) => Promise<void>
  onRemove: (file: ComposerAttachment) => void
  files: ComposerAttachment[]
  disabled: boolean
  sending: boolean
}

export function Composer({ text, onTextChange, onSend, onUpload, onRemove, files, disabled, sending }: Props) {
  const [selected, setSelected] = useState<File | null>(null)
  const [description, setDescription] = useState('')
  const picker = useRef<HTMLInputElement>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  const canSend = !!text.trim() && !disabled && !sending && !selected && files.every(file => file.status === 'ready')

  useLayoutEffect(() => {
    if (!area.current) return
    area.current.style.height = 'auto'
    area.current.style.height = `${Math.max(44, Math.min(area.current.scrollHeight, 240))}px`
  }, [text])

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      if (canSend) onSend()
    }
  }

  async function saveSelected() {
    if (!selected) return
    const file = selected
    const detail = description
    setSelected(null)
    setDescription('')
    await onUpload(file, detail)
  }

  return <form className="conversation-composer" onSubmit={event => { event.preventDefault(); if (canSend) onSend() }}>
    <label htmlFor="chat-text">Tu mensaje</label>
    <textarea ref={area} id="chat-text" className="textarea" rows={1} value={text} onChange={event => onTextChange(event.target.value)}
      onKeyDown={keyDown} disabled={disabled} aria-describedby="chat-keyboard-help" />
    <span id="chat-keyboard-help" className="small">Enter para enviar · Shift+Enter para una nueva línea.</span>
    <AttachmentChips files={files} onRemove={onRemove} />
    {selected && <div className="upload-form">
      <strong>{selected.name}</strong>
      <label className="field"><span>¿Qué muestra? · opcional</span>
        <textarea className="textarea" rows={2} maxLength={2000} value={description} onChange={event => setDescription(event.target.value)}
          placeholder="Describe brevemente lo que muestra el archivo…" /></label>
      <span className="small">VERA no asume el contenido de las imágenes. Tu descripción puede servir como fuente.</span>
      <div className="composer-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSelected(null); setDescription('') }}>Cancelar</button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => void saveSelected()}>Guardar evidencia</button>
      </div>
    </div>}
    <div className="composer-actions">
      <input ref={picker} type="file" hidden accept="image/png,image/jpeg,image/webp,application/pdf,.pdf" aria-label="Seleccionar evidencia"
        onChange={event => { const file = event.target.files?.[0]; if (file) { setSelected(file); setDescription('') } event.target.value = '' }} />
      <button type="button" className="btn btn-secondary" disabled={disabled || sending || !!selected} onClick={() => picker.current?.click()}>Adjuntar archivo</button>
      <button type="submit" className="btn btn-primary" disabled={!canSend}>Enviar</button>
    </div>
  </form>
}
