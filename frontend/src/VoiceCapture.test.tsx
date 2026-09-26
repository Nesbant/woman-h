// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { VoiceCapture } from './VoiceCapture'
import type { SpeechResultEvent, SpeechSession } from './speech'

class Recognition implements SpeechSession {
  static last: Recognition
  lang = ''; continuous = false; interimResults = false; maxAlternatives = 1
  onstart: (() => void) | null = null
  onend: (() => void) | null = null
  onresult: ((event: SpeechResultEvent) => void) | null = null
  onerror: ((event: {error: string}) => void) | null = null
  start = vi.fn(() => { this.onstart?.() })
  stop = vi.fn()
  abort = vi.fn()
  constructor() { Recognition.last = this }
  result(text: string, isFinal = false) { this.onresult?.({results:[{0:{transcript:text}, isFinal, length:1}]}) }
}
beforeEach(() => {
  vi.stubGlobal('SpeechRecognition', Recognition)
  vi.stubGlobal('webkitSpeechRecognition', undefined)
  vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => options.method ?
    Response.json({record_id:'guardado',account_id:'relato'}) : Response.json([])))
})
afterEach(() => { cleanup(); sessionStorage.clear(); window.location.hash=''; vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

// La captura por voz está oculta del recorrido principal (SPEC §35); se prueba el componente aislado.
test('error de red conserva texto pendiente y desmontar aborta sin aceptar resultados tardíos', async () => {
  const onText = vi.fn()
  const view = render(<VoiceCapture text="Previo" onText={onText} onBusy={() => {}} onWrite={() => {}} />)
  await userEvent.click(screen.getByRole('button', {name:'Iniciar voz'}))
  const session = Recognition.last
  act(() => session.result('Texto ficticio'))
  expect(onText).toHaveBeenCalledWith('Previo\n\nTexto ficticio')
  act(() => session.onerror?.({error:'network'}))
  expect(screen.getByRole('alert')).toHaveTextContent('servicio de voz')
  await userEvent.click(screen.getByRole('button', {name:'Iniciar voz'}))
  const late = Recognition.last.onresult!
  view.unmount()
  expect(Recognition.last.abort).toHaveBeenCalledOnce()
  late({results:[{0:{transcript:'Resultado tardío'},length:1,isFinal:true}]})
  expect(onText).toHaveBeenCalledTimes(1)
})

test('se libera el micrófono si el servicio no finaliza', async () => {
  vi.useFakeTimers()
  render(<VoiceCapture text="" onText={() => {}} onBusy={() => {}} onWrite={() => {}} />)
  fireEvent.click(screen.getByRole('button', {name:'Iniciar voz'}))
  fireEvent.click(screen.getByRole('button', {name:'Detener y revisar'}))
  act(() => { vi.advanceTimersByTime(8000) })
  expect(Recognition.last.abort).toHaveBeenCalledOnce()
  expect(screen.getByRole('alert')).toHaveTextContent('tardó demasiado')
})
