import { afterEach, expect, test, vi } from 'vitest'
import { getMockConversation, sendMockMessage, startMockConversation } from './mockChat'
import { mockApi } from '../testing'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

test('el mock usa los ejemplos, conserva mensajes y deduplica client_message_id', async () => {
  mockApi({ 'POST /conversations': { case_id: crypto.randomUUID() } })
  const { case_id } = await startMockConversation()
  expect((await getMockConversation(case_id)).messages).toHaveLength(0)
  const first = await sendMockMessage(case_id, 'Mi relato', 'cliente-1')
  expect(first.case_state.counts.candidate).toBe(1)
  const repeated = await sendMockMessage(case_id, 'Mi relato', 'cliente-1')
  expect(repeated).toEqual(first)
  const view = await getMockConversation(case_id)
  expect(view.case_id).toBe(case_id)
  expect(view.messages.map(message => message.text)).toEqual(['Mi relato', first.assistant_message.text])
  expect(view.case_state.case_id).toBe(case_id)
})

test('un caso existente sin conversación mock previa inicia con el estado vacío', async () => {
  const view = await getMockConversation(crypto.randomUUID())
  expect(view.messages).toEqual([])
})
