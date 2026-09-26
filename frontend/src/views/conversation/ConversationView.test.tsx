// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import example from '../../../../contracts/examples/conversation.json'
import turnExample from '../../../../contracts/examples/chat_turn_candidate.json'
import type { CaseEvent, CaseState, ChatTurn, ConversationView as ConversationData, TimelineEvent, TimelineState } from '../../types'
import { getCaseState, getConversation, sendMessage, startConversation } from '../../api/chat'
import { deleteFile, uploadFile } from '../../api/files'
import { getTimeline, reviewEvent } from '../../api/timeline'
import { ConversationView } from './ConversationView'

vi.mock('../../api/chat', () => ({ getCaseState: vi.fn(), getConversation: vi.fn(), sendMessage: vi.fn(), startConversation: vi.fn() }))
vi.mock('../../api/files', () => ({ uploadFile: vi.fn(), deleteFile: vi.fn() }))
vi.mock('../../api/timeline', () => ({ getTimeline: vi.fn(), reviewEvent: vi.fn() }))
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.unstubAllGlobals(); window.location.hash = '' })

const view = example as ConversationData
const turn = turnExample as ChatTurn
const candidate = turn.case_state.events.find(event => event.status === 'candidate')!
const timelineEvent = { id: candidate.id, title: candidate.title, description: candidate.description,
  date_kind: candidate.date.date_kind, event_date: candidate.date.event_date, approximate_date: candidate.date.approximate_date,
  status: 'proposed', edited: false, reviewed: false, mode: 'demo', original: { ...candidate.date, description: candidate.description },
  source: { id: 's1', kind: 'account', source_id: 'a1', label: 'Relato', quote: candidate.description, page: null } } as TimelineEvent
const timelineState = { revision: 4, mode: 'demo', configured_mode: 'demo', events: [timelineEvent], warnings: [], review_items: [], processed_at: '' } as TimelineState
const withStatus = (status: CaseEvent['status']): CaseState => ({ ...turn.case_state,
  events: turn.case_state.events.map(event => event.id === candidate.id ? { ...event, status, reviewed: true, needs_review: false } : event),
  counts: { ...turn.case_state.counts, candidate: 0, confirmed: status === 'confirmed' ? 3 : 2,
    corrected: status === 'corrected' ? 1 : 0, discarded: status === 'discarded' ? 1 : 0 },
})
beforeEach(() => { vi.mocked(getCaseState).mockResolvedValue(view.case_state); vi.mocked(getTimeline).mockResolvedValue(timelineState) })

test('estado vacío invita a contar lo ocurrido y recuerda la privacidad; desaparece al conversar', async () => {
  vi.mocked(getConversation).mockResolvedValue({ ...view, messages: [] })
  vi.mocked(sendMessage).mockResolvedValue(turn)
  const user = userEvent.setup()
  render(<ConversationView recordId="r1" />)
  expect(await screen.findByRole('heading', { name: '¿Qué pasó? Puedes empezar por donde quieras.' })).toBeInTheDocument()
  expect(screen.getByText(/Lo que cuentes queda en tu espacio privado/)).toBeInTheDocument()
  await user.type(screen.getByRole('textbox', { name: 'Tu mensaje' }), 'Mi relato')
  await user.keyboard('{Enter}')
  expect(await screen.findByText(turn.assistant_message.text)).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: '¿Qué pasó? Puedes empezar por donde quieras.' })).toBeNull()
})

test('el aviso usa configured_mode de la cronología y permanece fuera del log después de varios turnos', async () => {
  vi.mocked(getConversation).mockResolvedValue({ ...view, messages: [] })
  vi.mocked(getTimeline).mockResolvedValue({ ...timelineState, mode: 'fixture', configured_mode: 'ai' })
  vi.mocked(sendMessage).mockResolvedValue(turn)
  const user = userEvent.setup()
  render(<ConversationView recordId="r1" />)
  await screen.findByText('IA conectada: tus mensajes se procesan con el proveedor configurado')
  const note = screen.getByRole('note', { name: 'Modo de conversación' })
  expect(note).toHaveTextContent('IA conectada: tus mensajes se procesan con el proveedor configurado')
  expect(screen.getByRole('log')).not.toContainElement(note)
  await user.type(screen.getByRole('textbox', { name: 'Tu mensaje' }), 'Uno')
  await user.keyboard('{Enter}')
  await screen.findByText(turn.assistant_message.text)
  expect(note).toHaveTextContent('IA conectada: tus mensajes se procesan con el proveedor configurado')
  expect(getTimeline).toHaveBeenCalledWith('r1')
})

test('configured_mode fixture muestra Modo demostración', async () => {
  vi.mocked(getConversation).mockResolvedValue({ ...view, messages: [] })
  render(<ConversationView recordId="r1" />)
  await screen.findByText('Modo demostración')
  expect(screen.getByRole('note', { name: 'Modo de conversación' })).toHaveTextContent('Modo demostración')
})

test('colapsar panel en móvil conserva mensajes y texto del composer', async () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
  vi.mocked(getConversation).mockResolvedValue(view)
  const user = userEvent.setup()
  render(<ConversationView recordId="r1" />)
  const log = screen.getByRole('log')
  await within(log).findByText(view.messages[0].text)
  await user.type(screen.getByRole('textbox', { name: 'Tu mensaje' }), 'Texto sin enviar')
  const toggle = screen.getByRole('button', { name: 'Mostrar panel' })
  await user.click(toggle)
  expect(screen.getByRole('button', { name: 'Ocultar panel' })).toHaveAttribute('aria-expanded', 'true')
  await user.click(screen.getByRole('button', { name: 'Ocultar panel' }))
  expect(screen.getByRole('textbox', { name: 'Tu mensaje' })).toHaveValue('Texto sin enviar')
  expect(within(log).getByText(view.messages[0].text)).toBeInTheDocument()
})
const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

test('carga mensajes del contrato y envía uno optimista una sola vez', async () => {
  vi.mocked(getConversation).mockResolvedValue(view)
  const reply = deferred<ChatTurn>()
  vi.mocked(sendMessage).mockReturnValue(reply.promise)
  const user = userEvent.setup()
  render(<ConversationView recordId="r1" />)
  const log = await screen.findByRole('log', { name: 'Mensajes de la conversación' })
  expect(log).toHaveAttribute('aria-live', 'polite')
  expect(await within(log).findByText(view.messages[0].text)).toBeInTheDocument()
  await user.type(screen.getByRole('textbox', { name: 'Tu mensaje' }), 'Quiero contarte algo')
  await user.click(screen.getByRole('button', { name: 'Enviar' }))
  fireEvent.submit(screen.getByRole('textbox', { name: 'Tu mensaje' }).closest('form')!)
  expect(within(log).getByText('Quiero contarte algo')).toBeInTheDocument()
  expect(within(log).getByText('Enviando…')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled()
  expect(sendMessage).toHaveBeenCalledTimes(1)
  const [recordId, text, clientId] = vi.mocked(sendMessage).mock.calls[0]
  expect(recordId).toBe('r1')
  expect(text).toBe('Quiero contarte algo')
  expect(clientId).toMatch(/^[0-9a-f-]{36}$/)
  reply.resolve({ ...turn, user_message: { ...turn.user_message, text, client_message_id: clientId } })
  expect(await within(log).findByText(turn.assistant_message.text)).toBeInTheDocument()
  expect(within(log).getAllByText(text)).toHaveLength(1)
})

test('un fallo conserva el mensaje y Reintentar usa el mismo id sin duplicarlo', async () => {
  vi.mocked(getConversation).mockResolvedValue({ ...view, messages: [] })
  vi.mocked(sendMessage).mockRejectedValueOnce(new Error('Sin conexión')).mockImplementationOnce(async (_id, text, clientId) => ({
    ...turn, user_message: { ...turn.user_message, text, client_message_id: clientId },
  }))
  const user = userEvent.setup()
  render(<ConversationView recordId="r1" />)
  await user.type(await screen.findByRole('textbox', { name: 'Tu mensaje' }), 'Mi texto sigue aquí')
  await user.click(screen.getByRole('button', { name: 'Enviar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión')
  const log = screen.getByRole('log')
  expect(within(log).getByText('Mi texto sigue aquí')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Reintentar' }))
  expect(await within(log).findByText(turn.assistant_message.text)).toBeInTheDocument()
  expect(within(log).getAllByText('Mi texto sigue aquí')).toHaveLength(1)
  expect(vi.mocked(sendMessage).mock.calls[1]).toEqual(vi.mocked(sendMessage).mock.calls[0])
})

test('la conversación general crea la situación al enviar el primer mensaje', async () => {
  vi.mocked(startConversation).mockResolvedValue({ case_id: 'r2' })
  vi.mocked(sendMessage).mockImplementation(async (_id, text, clientId) => ({
    ...turn, user_message: { ...turn.user_message, text, client_message_id: clientId },
  }))
  const user = userEvent.setup()
  render(<ConversationView />)
  await user.type(screen.getByRole('textbox', { name: 'Tu mensaje' }), 'Hola VERA')
  await user.click(screen.getByRole('button', { name: 'Enviar' }))
  await vi.waitFor(() => expect(window.location.hash).toBe('#/s/r2/conversar'))
  expect(startConversation).toHaveBeenCalledTimes(1)
  expect(sendMessage).toHaveBeenCalledWith('r2', 'Hola VERA', expect.any(String), [])
})

test('adjunta PNG con descripción y lo referencia en el siguiente mensaje', async () => {
  vi.mocked(getConversation).mockResolvedValue({ ...view, messages: [] })
  const uploaded = deferred<Awaited<ReturnType<typeof uploadFile>>>()
  vi.mocked(uploadFile).mockReturnValue(uploaded.promise)
  vi.mocked(sendMessage).mockImplementation(async (_id, text, clientId, attachmentIds) => ({
    ...turn, user_message: { ...turn.user_message, text, client_message_id: clientId, attachment_ids: attachmentIds ?? [] },
  }))
  const user = userEvent.setup()
  render(<ConversationView recordId="r1" />)
  const file = new File(['png'], 'captura.png', { type: 'image/png' })
  await user.upload(await screen.findByLabelText('Seleccionar evidencia'), file)
  await user.type(screen.getByRole('textbox', { name: /¿Qué muestra/ }), 'Mensajes recibidos')
  await user.click(screen.getByRole('button', { name: 'Guardar evidencia' }))
  expect(uploadFile).toHaveBeenCalledWith('r1', file, 'Mensajes recibidos')
  expect(await screen.findByText('Subiendo…')).toBeInTheDocument()
  uploaded.resolve({ id: 'file-1', filename: 'captura.png', description: 'Mensajes recibidos',
    media_type: 'image/png', size: 4, sha256: 'hash', created_at: '', account_ids: [] })
  expect(await screen.findByText('Listo')).toBeInTheDocument()
  await user.type(screen.getByRole('textbox', { name: 'Tu mensaje' }), 'Mira esta captura')
  await user.keyboard('{Enter}')
  await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith('r1', 'Mira esta captura', expect.any(String), ['file-1']))
  expect(await screen.findByText('1 archivo adjunto')).toBeInTheDocument()
})

test('archivo inválido muestra error, se quita y el chat continúa sin adjuntos', async () => {
  vi.mocked(getConversation).mockResolvedValue({ ...view, messages: [] })
  vi.mocked(uploadFile).mockRejectedValue(new Error('Archivo inválido o dañado'))
  vi.mocked(sendMessage).mockImplementation(async (_id, text, clientId, attachmentIds) => ({
    ...turn, user_message: { ...turn.user_message, text, client_message_id: clientId, attachment_ids: attachmentIds ?? [] },
  }))
  const user = userEvent.setup()
  render(<ConversationView recordId="r1" />)
  await user.upload(await screen.findByLabelText('Seleccionar evidencia'), new File(['bad'], 'malo.png', { type: 'image/png' }))
  await user.click(screen.getByRole('button', { name: 'Guardar evidencia' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Archivo inválido o dañado')
  await user.click(screen.getByRole('button', { name: 'Quitar malo.png' }))
  expect(screen.queryByText('malo.png')).toBeNull()
  await user.type(screen.getByRole('textbox', { name: 'Tu mensaje' }), 'Solo texto')
  await user.click(screen.getByRole('button', { name: 'Enviar' }))
  await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith('r1', 'Solo texto', expect.any(String), []))
})

test('Shift+Enter agrega línea y quitar un PDF listo borra el archivo antes de enviar', async () => {
  vi.mocked(getConversation).mockResolvedValue({ ...view, messages: [] })
  vi.mocked(uploadFile).mockResolvedValue({ id: 'pdf-1', filename: 'correo.pdf', description: null,
    media_type: 'application/pdf', size: 4, sha256: 'hash', created_at: '', account_ids: [] })
  vi.mocked(deleteFile).mockResolvedValue(undefined)
  vi.mocked(sendMessage).mockImplementation(async (_id, text, clientId) => ({
    ...turn, user_message: { ...turn.user_message, text, client_message_id: clientId, attachment_ids: [] },
  }))
  const user = userEvent.setup()
  render(<ConversationView recordId="r1" />)
  await user.upload(await screen.findByLabelText('Seleccionar evidencia'), new File(['pdf'], 'correo.pdf', { type: 'application/pdf' }))
  await user.click(screen.getByRole('button', { name: 'Guardar evidencia' }))
  await screen.findByText('Listo')
  await user.click(screen.getByRole('button', { name: 'Quitar correo.pdf' }))
  await vi.waitFor(() => expect(deleteFile).toHaveBeenCalledWith('r1', 'pdf-1'))
  await vi.waitFor(() => expect(screen.queryByText('correo.pdf')).toBeNull())
  const input = screen.getByRole('textbox', { name: 'Tu mensaje' }) as HTMLTextAreaElement
  Object.defineProperty(input, 'scrollHeight', { configurable: true, get: () => 120 })
  await user.type(input, 'Primera línea')
  await user.keyboard('{Shift>}{Enter}{/Shift}')
  expect(input.value).toBe('Primera línea\n')
  expect(input.style.height).toBe('120px')
  expect(sendMessage).not.toHaveBeenCalled()
  await user.type(input, 'Segunda línea')
  await user.keyboard('{Enter}')
  await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith('r1', 'Primera línea\nSegunda línea', expect.any(String), []))
})

function prepareReview(next: CaseState) {
  vi.mocked(getConversation).mockResolvedValue({ ...view, messages: [], case_state: turn.case_state })
  vi.mocked(getTimeline).mockResolvedValue(timelineState)
  vi.mocked(reviewEvent).mockResolvedValue(timelineState)
  vi.mocked(getCaseState).mockResolvedValue(next)
}

test('Confirmar desde la card usa timeline y vuelve a cargar CaseState', async () => {
  prepareReview(withStatus('confirmed'))
  const user = userEvent.setup()
  render(<ConversationView recordId="r1" />)
  const card = await screen.findByRole('article', { name: candidate.title })
  await user.click(within(card).getByRole('button', { name: 'Confirmar' }))
  await vi.waitFor(() => expect(getCaseState).toHaveBeenCalledWith('r1'))
  expect(reviewEvent).toHaveBeenCalledWith('r1', 4, timelineEvent, 'accepted', undefined)
  expect(await within(card).findByText('Confirmado')).toBeInTheDocument()
})

test('Descartar actualiza el panel y deja de ofrecer acciones de candidato', async () => {
  prepareReview(withStatus('discarded'))
  const user = userEvent.setup()
  render(<ConversationView recordId="r1" />)
  const card = await screen.findByRole('article', { name: candidate.title })
  await user.click(within(card).getByRole('button', { name: 'Descartar' }))
  await vi.waitFor(() => expect(getCaseState).toHaveBeenCalledWith('r1'))
  expect(reviewEvent).toHaveBeenCalledWith('r1', 4, timelineEvent, 'discarded', undefined)
  expect(await within(card).findByText('Descartado')).toBeInTheDocument()
  expect(within(card).queryByRole('button', { name: 'Confirmar' })).toBeNull()
})

test('Corregir usa EventForm, guarda contenido y recarga el estado', async () => {
  prepareReview(withStatus('corrected'))
  const user = userEvent.setup()
  render(<ConversationView recordId="r1" />)
  const card = await screen.findByRole('article', { name: candidate.title })
  await user.click(within(card).getByRole('button', { name: 'Corregir' }))
  await user.clear(within(card).getByLabelText('Título'))
  await user.type(within(card).getByLabelText('Título'), 'Correo corregido')
  await user.click(within(card).getByRole('button', { name: 'Guardar corrección' }))
  await vi.waitFor(() => expect(getCaseState).toHaveBeenCalledWith('r1'))
  expect(reviewEvent).toHaveBeenCalledWith('r1', 4, timelineEvent, 'accepted', expect.objectContaining({ title: 'Correo corregido' }))
  expect(await within(card).findByText('Corregido')).toBeInTheDocument()
})

test('un error de revisión conserva la card y permite reintentar', async () => {
  prepareReview(withStatus('confirmed'))
  vi.mocked(reviewEvent).mockRejectedValueOnce(new Error('No se pudo guardar'))
  const user = userEvent.setup()
  render(<ConversationView recordId="r1" />)
  const card = await screen.findByRole('article', { name: candidate.title })
  await user.click(within(card).getByRole('button', { name: 'Confirmar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar')
  expect(within(card).getByRole('button', { name: 'Confirmar' })).toBeEnabled()
  expect(getCaseState).not.toHaveBeenCalled()
  await user.click(within(card).getByRole('button', { name: 'Confirmar' }))
  await vi.waitFor(() => expect(getCaseState).toHaveBeenCalledTimes(1))
  expect(await within(card).findByText('Confirmado')).toBeInTheDocument()
})

test('un turno nuevo muestra su candidato y solo el changed_event_id queda resaltado', async () => {
  vi.mocked(getConversation).mockResolvedValue({ ...view, messages: [], case_state: { ...view.case_state, events: [] } })
  vi.mocked(sendMessage).mockResolvedValue({ ...turn, touched_event_ids: [], changed_event_ids: [candidate.id] } as ChatTurn)
  const user = userEvent.setup()
  render(<ConversationView recordId="r1" />)
  await user.type(await screen.findByRole('textbox', { name: 'Tu mensaje' }), 'Ocurrió algo más')
  await user.click(screen.getByRole('button', { name: 'Enviar' }))
  const card = await screen.findByRole('article', { name: candidate.title })
  expect(within(card).getByText('Nuevo o actualizado')).toBeInTheDocument()
  expect(within(screen.getByRole('article', { name: turn.case_state.events[0].title })).queryByText('Nuevo o actualizado')).toBeNull()
})

test('Confirmar desde una acción del chat usa la misma operación que la card', async () => {
  vi.mocked(getConversation).mockResolvedValue({ ...view, messages: [], case_state: { ...view.case_state, events: [] } })
  vi.mocked(sendMessage).mockResolvedValue({ ...turn, suggested_actions: [{ type: 'confirm_event', label: 'Confirmar hecho', event_ids: [candidate.id], file_ids: [] }] })
  vi.mocked(getTimeline).mockResolvedValue(timelineState)
  vi.mocked(reviewEvent).mockResolvedValue(timelineState)
  vi.mocked(getCaseState).mockResolvedValue(withStatus('confirmed'))
  const user = userEvent.setup()
  render(<ConversationView recordId="r1" />)
  await user.type(await screen.findByRole('textbox', { name: 'Tu mensaje' }), 'Confírmalo')
  await user.click(screen.getByRole('button', { name: 'Enviar' }))
  await user.click(await screen.findByRole('button', { name: `Confirmar hecho: ${candidate.title}` }))
  await vi.waitFor(() => expect(reviewEvent).toHaveBeenCalledWith('r1', 4, timelineEvent, 'accepted', undefined))
  expect(await within(screen.getByRole('article', { name: candidate.title })).findByText('Confirmado')).toBeInTheDocument()
})

test('mientras confirma bloquea acciones duplicadas y conserva la card', async () => {
  prepareReview(withStatus('confirmed'))
  const delayed = deferred<TimelineState>()
  vi.mocked(reviewEvent).mockReturnValue(delayed.promise)
  const user = userEvent.setup()
  render(<ConversationView recordId="r1" />)
  const card = await screen.findByRole('article', { name: candidate.title })
  await user.click(within(card).getByRole('button', { name: 'Confirmar' }))
  expect(await within(card).findByRole('button', { name: 'Guardando…' })).toBeDisabled()
  expect(within(card).getByRole('button', { name: 'Descartar' })).toBeDisabled()
  expect(reviewEvent).toHaveBeenCalledTimes(1)
  delayed.resolve(timelineState)
  expect(await within(card).findByText('Confirmado')).toBeInTheDocument()
})

test('si falla la actualización del estado ofrece reintentar sin perder el hecho', async () => {
  prepareReview(withStatus('confirmed'))
  vi.mocked(getCaseState).mockRejectedValueOnce(new Error('No se pudo actualizar el panel'))
  const user = userEvent.setup()
  render(<ConversationView recordId="r1" />)
  const card = await screen.findByRole('article', { name: candidate.title })
  await user.click(within(card).getByRole('button', { name: 'Confirmar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo actualizar el panel')
  expect(card).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Reintentar actualización' }))
  expect(await within(card).findByText('Confirmado')).toBeInTheDocument()
  expect(getCaseState).toHaveBeenCalledTimes(2)
})

test('Ver lo registrado abre la ruta de cronología del caso', async () => {
  vi.mocked(getConversation).mockResolvedValue({ ...view, case_state: turn.case_state })
  const user = userEvent.setup()
  render(<ConversationView recordId="r1" />)
  await user.click(await screen.findByRole('button', { name: 'Ver lo registrado' }))
  expect(window.location.hash).toBe('#/s/r1/entender')
})

test('sin candidatos pendientes se puede seguir conversando', async () => {
  vi.mocked(getConversation).mockResolvedValue({ ...view, messages: [], case_state: { ...view.case_state, events: [] } })
  vi.mocked(sendMessage).mockResolvedValue({ ...turn, case_state: { ...turn.case_state, events: [], counts: { candidate: 0, confirmed: 0, corrected: 0, discarded: 0, with_evidence: 0 } } })
  const user = userEvent.setup()
  render(<ConversationView recordId="r1" />)
  expect(await screen.findByText('Todavía no hay hechos para revisar. Puedes seguir conversando.')).toBeInTheDocument()
  await user.type(screen.getByRole('textbox', { name: 'Tu mensaje' }), 'Necesito conversar')
  await user.click(screen.getByRole('button', { name: 'Enviar' }))
  expect(await screen.findByText(turn.assistant_message.text)).toBeInTheDocument()
  expect(screen.getByText('Todavía no hay hechos para revisar. Puedes seguir conversando.')).toBeInTheDocument()
})
