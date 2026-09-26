import { useDictation } from './useDictation'

type Props = {text: string; onText: (text: string) => void; onBusy: (busy: boolean) => void; onWrite: () => void}

export function VoiceCapture(props: Props) {
  const { supported, phase, error, notice, seconds, start, stop, cancel } = useDictation({
    text: props.text, onText: props.onText, onBusy: props.onBusy,
  })
  function write() { cancel(); props.onWrite() }

  return <section className="voice-panel" aria-label="Captura de voz">
    <p className="voice-explanation">VERA no guarda archivos de audio. El navegador puede enviar tu voz a su proveedor para transcribirla. La disponibilidad depende del navegador y de la conexión.</p>
    {!supported ? <p role="status">La voz no está disponible en este navegador o conexión. Puedes contar lo ocurrido por escrito.</p> : <>
      <div className="voice-controls">
        {phase === 'idle' ? <button type="button" onClick={start}>Iniciar voz</button> :
          <button type="button" disabled={phase === 'transcribing'} onClick={stop}>{phase === 'transcribing' ? 'Transcribiendo…' : 'Detener y revisar'}</button>}
        <p role="status" aria-live="polite">{phase === 'permission' ? 'Esperando permiso del micrófono…' : phase === 'listening' ? 'Micrófono activo · Escuchando…' : phase === 'transcribing' ? 'Finalizando la transcripción…' : 'Habla a tu ritmo. Hasta 2 minutos por captura.'}</p>
        {phase === 'listening' && <span className="voice-timer" aria-label="Tiempo de captura">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</span>}
      </div>
      <p className="small">Al iniciar, permites que el navegador procese tu voz. Usa solo datos ficticios durante la demostración.</p>
    </>}
    {notice && <p className="voice-notice">{notice}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    <button type="button" className="secondary" onClick={write}>Seguir escribiendo</button>
  </section>
}
