// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { Composer } from './Composer'
import type { SpeechResultEvent, SpeechSession } from '../../speech'

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
  result(text: string) { this.onresult?.({ results: [{ 0: { transcript: text }, isFinal: true, length: 1 }] }) }
}

const noop = () => {}
const baseProps = { onSend: vi.fn(), onUpload: vi.fn(async () => {}), onRemove: noop, files: [], disabled: false, sending: false }

beforeEach(() => {
  vi.stubGlobal('SpeechRecognition', Recognition)
  vi.stubGlobal('webkitSpeechRecognition', undefined)
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

test('el botón de dictado alterna entre "Dictar mensaje" y "Detener dictado"', async () => {
  const user = userEvent.setup()
  render(<Composer {...baseProps} />)
  const mic = screen.getByRole('button', { name: 'Dictar mensaje' })
  expect(mic).toHaveAttribute('aria-pressed', 'false')
  await user.click(mic)
  const stopButton = screen.getByRole('button', { name: 'Detener dictado' })
  expect(stopButton).toHaveAttribute('aria-pressed', 'true')
  await user.click(stopButton)
  const session = Recognition.last
  act(() => session.onend?.())
  expect(await screen.findByRole('button', { name: 'Dictar mensaje' })).toHaveAttribute('aria-pressed', 'false')
})

test('el texto reconocido llega al textarea sin enviar el mensaje automáticamente', async () => {
  const onSend = vi.fn()
  const user = userEvent.setup()
  render(<Composer {...baseProps} onSend={onSend} />)
  await user.type(screen.getByRole('textbox', { name: 'Tu mensaje' }), 'Antes')
  await user.click(screen.getByRole('button', { name: 'Dictar mensaje' }))
  act(() => Recognition.last.result('lo que dije'))
  const textarea = screen.getByRole('textbox', { name: 'Tu mensaje' }) as HTMLTextAreaElement
  expect(textarea.value).toBe('Antes\n\nlo que dije')
  expect(onSend).not.toHaveBeenCalled()
})

test('un error del reconocimiento se muestra con el mensaje en español y no bloquea seguir escribiendo', async () => {
  const user = userEvent.setup()
  render(<Composer {...baseProps} />)
  await user.click(screen.getByRole('button', { name: 'Dictar mensaje' }))
  act(() => Recognition.last.onerror?.({ error: 'not-allowed' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('No se permitió el micrófono')
  expect(screen.getByRole('button', { name: 'Dictar mensaje' })).toBeInTheDocument()
})

test('sin reconocimiento de voz disponible el botón de dictado no se muestra', () => {
  vi.stubGlobal('SpeechRecognition', undefined)
  vi.stubGlobal('webkitSpeechRecognition', undefined)
  render(<Composer {...baseProps} />)
  expect(screen.queryByRole('button', { name: 'Dictar mensaje' })).toBeNull()
})

test('enviar el formulario detiene el dictado sin volver a tocar el texto', async () => {
  const onSend = vi.fn()
  const user = userEvent.setup()
  render(<Composer {...baseProps} onSend={onSend} />)
  await user.type(screen.getByRole('textbox', { name: 'Tu mensaje' }), 'Mensaje final')
  await user.click(screen.getByRole('button', { name: 'Dictar mensaje' }))
  const session = Recognition.last
  await user.click(screen.getByRole('button', { name: 'Enviar' }))
  expect(onSend).toHaveBeenCalledWith('Mensaje final')
  expect(session.abort).toHaveBeenCalled()
})
