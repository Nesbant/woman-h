import { useEffect, useRef, useState } from 'react'
import { browserSpeech, speechErrors } from './speech'
import type { SpeechSession } from './speech'

/** Reusable session state machine for browser speech recognition. Shared by VoiceCapture and the composer's mic button. */
export type DictationPhase = 'idle' | 'permission' | 'listening' | 'transcribing'

type DictationOptions = { text: string; onText: (text: string) => void; onBusy?: (busy: boolean) => void }

export function useDictation({ text, onText, onBusy }: DictationOptions) {
  const [phase, setPhase] = useState<DictationPhase>('idle')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [seconds, setSeconds] = useState(0)
  const current = useRef<SpeechSession | null>(null)
  const stopping = useRef(false)
  const callbacks = useRef({ text, onText, onBusy })
  callbacks.current = { text, onText, onBusy }
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null)
  const supported = !!browserSpeech()

  function clearTimers() {
    timers.current.forEach(clearTimeout); timers.current = []
    if (ticker.current) clearInterval(ticker.current)
    ticker.current = null
  }
  function release(abort = true) {
    const session = current.current
    current.current = null
    clearTimers()
    if (session) {
      session.onstart = null; session.onresult = null; session.onerror = null; session.onend = null
      if (abort) { try { session.abort() } catch { /* Ya estaba detenido. */ } }
    }
  }
  function finish(message?: string) {
    release()
    setPhase('idle'); callbacks.current.onBusy?.(false)
    if (message) setError(message)
  }
  function stop() {
    const session = current.current
    if (!session) return
    stopping.current = true
    clearTimers(); setPhase('transcribing')
    timers.current.push(setTimeout(() => {
      if (current.current === session) finish('El servicio de voz tardó demasiado. Revisa el texto disponible o continúa escribiendo.')
    }, 8000))
    try { session.stop() } catch { finish('No pudimos finalizar la transcripción. Puedes revisar el texto disponible y escribir.') }
  }
  /** Hard cancel: abort immediately, no waiting for a final transcript (used on send/unmount/"keep writing"). */
  function cancel() { finish() }

  useEffect(() => {
    const leave = () => { if (document.hidden && current.current) stop() }
    document.addEventListener('visibilitychange', leave)
    return () => {
      document.removeEventListener('visibilitychange', leave)
      release(); callbacks.current.onBusy?.(false)
    }
  }, [])

  function start() {
    if (current.current) return
    const Constructor = browserSpeech()
    if (!Constructor) return
    setError(''); setNotice(''); setSeconds(0)
    const base = callbacks.current.text.trimEnd()
    if (base.length >= 10000) { setError('El texto alcanzó el límite de 10 000 caracteres. Revísalo antes de añadir más.'); return }
    let receivedText = false
    try {
      const session = new Constructor()
      stopping.current = false
      current.current = session
      session.lang = 'es-PE'; session.continuous = true; session.interimResults = true; session.maxAlternatives = 1
      setPhase('permission'); callbacks.current.onBusy?.(true)
      timers.current.push(setTimeout(() => {
        if (current.current === session) finish('No se pudo iniciar la voz. Revisa el permiso del micrófono o continúa escribiendo.')
      }, 20000))
      session.onstart = () => {
        if (current.current !== session || stopping.current) return
        clearTimers(); setPhase('listening')
        ticker.current = setInterval(() => setSeconds(value => value + 1), 1000)
        timers.current.push(setTimeout(() => {
          if (current.current === session) { setNotice('Se alcanzaron los 2 minutos. Revisa el texto; puedes iniciar otra captura.'); stop() }
        }, 120000))
      }
      session.onresult = event => {
        if (current.current !== session) return
        // La lista es acumulativa: reemplazar esta captura, no añadir repetidamente sus resultados.
        const words = Array.from(event.results).map(result => result[0].transcript.trim()).filter(Boolean).join(' ')
        if (!words) return
        receivedText = true
        const combined = [base, words].filter(Boolean).join('\n\n')
        callbacks.current.onText(combined.slice(0, 10000))
        if (combined.length > 10000) {
          finish('Se alcanzó el límite de 10 000 caracteres. El texto que excedía el límite no se añadió. Revisa lo capturado.')
        }
      }
      session.onerror = event => {
        if (current.current === session) finish(speechErrors[event.error] ?? 'La voz no está disponible ahora. Tu texto sigue aquí; puedes escribir.')
      }
      session.onend = () => {
        if (current.current !== session) return
        release(false); setPhase('idle'); callbacks.current.onBusy?.(false)
        if (!receivedText) setError('No se obtuvo texto. Puedes volver a intentar o escribir.')
        else setNotice('Revisa el texto obtenido. Puede contener errores; nada se guarda como relato hasta que confirmes y continúes.')
      }
      session.start()
    } catch {
      finish('No se pudo iniciar la voz en este navegador. Tu texto sigue aquí; puedes escribir.')
    }
  }

  return { supported, phase, error, notice, seconds, start, stop, cancel, clearError: () => setError(''), clearNotice: () => setNotice('') }
}
