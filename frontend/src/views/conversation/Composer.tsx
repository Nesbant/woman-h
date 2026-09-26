import { useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { AttachmentChips } from './AttachmentChips'
import type { ComposerAttachment } from './AttachmentChips'
import { MicIcon } from '../../components/icons'
import { useDictation } from '../../useDictation'

type Props = {
  onSend: (text: string) => void
  onUpload: (file: File, description: string) => Promise<void>
  onRemove: (file: ComposerAttachment) => void
  files: ComposerAttachment[]
  disabled: boolean
  sending: boolean
}

/** The composer owns its own draft text: typing here must never re-render the rest of the conversation screen. */
export function Composer({ onSend, onUpload, onRemove, files, disabled, sending }: Props) {
  const [text, setText] = useState('')
  const [selected, setSelected] = useState<File | null>(null)
  const [description, setDescription] = useState('')
  const picker = useRef<HTMLInputElement>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  const dictation = useDictation({ text, onText: setText })
  const listening = dictation.phase !== 'idle'
  const canSend = !!text.trim() && !disabled && !sending && !selected && files.every(file => file.status === 'ready')

  useLayoutEffect(() => {
    if (!area.current) return
    area.current.style.height = 'auto'
    area.current.style.height = `${Math.max(44, Math.min(area.current.scrollHeight, 240))}px`
  }, [text])

  function deliver() {
    if (!canSend) return
    dictation.cancel() // Nunca se envía audio adicional después de enviar: se detiene sin esperar transcripción.
    const value = text.trim()
    setText('')
    onSend(value)
  }

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      deliver()
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

  return <form className="conversation-composer" onSubmit={event => { event.preventDefault(); deliver() }}>
    <label htmlFor="chat-text">Tu mensaje</label>
    <div className="composer-textarea-wrap">
      <textarea ref={area} id="chat-text" className="textarea" rows={1} value={text} onChange={event => setText(event.target.value)}
        onKeyDown={keyDown} disabled={disabled} aria-describedby="chat-keyboard-help" />
      {dictation.supported && <button type="button" className="btn btn-secondary mic-button" aria-pressed={listening}
        aria-label={listening ? 'Detener dictado' : 'Dictar mensaje'} aria-describedby="mic-privacy-hint"
        title="Dictado por voz: usa el servicio de voz del navegador (algunos navegadores, como Chrome, envían el audio a Google)."
        disabled={disabled || dictation.phase === 'transcribing'}
        onClick={() => (listening ? dictation.stop() : dictation.start())}>
        <MicIcon />
      </button>}
    </div>
    <span id="mic-privacy-hint" className="sr-only">El dictado usa el servicio de voz del navegador. Chrome puede enviar tu voz a Google para transcribirla. No se guarda audio.</span>
    <span id="chat-keyboard-help" className="small">Enter para enviar · Shift+Enter para una nueva línea.</span>
    {listening && <p role="status" aria-live="polite" className="small dictation-status">
      {dictation.phase === 'permission' ? 'Esperando permiso del micrófono…'
        : dictation.phase === 'transcribing' ? 'Finalizando la transcripción…' : 'Escuchando… habla a tu ritmo, luego revisa el texto.'}
    </p>}
    {dictation.notice && <p role="status" className="small">{dictation.notice}</p>}
    {dictation.error && <p className="error" role="alert">{dictation.error}</p>}
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
