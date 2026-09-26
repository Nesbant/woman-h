// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { ToastProvider } from '../components/Toast'
import { mockApi } from '../testing'
import { Register } from './register/Register'
import { Institutional } from './institutional/Institutional'
import { App } from '../App'

afterEach(() => { cleanup(); window.location.hash = ''; vi.restoreAllMocks(); vi.unstubAllGlobals() })
beforeEach(() => { vi.spyOn(window, 'scrollTo').mockImplementation(() => {}) })

test('situación nueva: escribir y pulsar "Entender" crea una sola vez y abre Entender', async () => {
  window.location.hash = '#/s/nuevo/registrar'
  const calls = mockApi({ 'POST /start': { record_id: 'r9', account_id: 'a9' } })
  render(<ToastProvider><Register recordId="nuevo" /></ToastProvider>)
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Tu relato'), 'Algo ocurrió en la oficina.')
  await user.click(screen.getByRole('button', { name: 'Entender lo ocurrido →' }))
  await vi.waitFor(() => expect(window.location.hash).toBe('#/s/r9/entender'))
  await new Promise(resolve => setTimeout(resolve, 50))
  expect(window.location.hash).toBe('#/s/r9/entender')
  expect(calls.filter(c => c.url.endsWith('/start'))).toHaveLength(1)
})

test('un error de carga desaparece al cancelar', async () => {
  mockApi({
    'GET /overview': { record: { id: 'r1', title: 'Situación #001', private_note: null, created_at: '', updated_at: '' }, story: null, files: 0,
      timeline: { processed: false, revision: 0, total: 0, pending: 0, accepted: 0, discarded: 0, open_review_items: 0 }, draft: { exists: false, reviewed: false, stale: false }, submissions: [] },
    'GET /files': { items: [] },
    'POST /files': () => Response.json({ detail: 'Archivo inválido o dañado. Usa PNG, JPEG, WebP o PDF válido' }, { status: 415 }),
  })
  render(<ToastProvider><Register recordId="r1" /></ToastProvider>)
  const user = userEvent.setup()
  await screen.findByLabelText('Tu relato')
  const input = document.querySelector('input[type=file]') as HTMLInputElement
  await user.upload(input, new File(['no soy un pdf'], 'falso.pdf', { type: 'application/pdf' }))
  await user.click(screen.getByRole('button', { name: 'Guardar evidencia' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Archivo inválido')
  await user.click(screen.getByRole('button', { name: 'Cancelar' }))
  expect(screen.queryByRole('alert')).toBeNull()
})

test('con la demo activa, una cuenta con organización puede entrar a su espacio institucional', async () => {
  mockApi({
    'GET /health': { demo: true },
    'GET /auth/me': { id: 'rev', name: 'Lucía Demo', email: 'revisora@example.test', memberships: [{ institution_id: 'aurora', name: 'Institución Aurora', role: 'reviewer' }] },
    'GET /records': [],
    'GET /cases': { counts: { received: 0, new: 0, in_review: 0, follow_up: 0, closed: 0 }, items: [] },
  })
  render(<App />)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Institutional' }))
  expect(await screen.findByText('VERA Institutional · Institución Aurora')).toBeInTheDocument()
  expect(window.location.hash).toBe('#/institutional')
})

test('Institutional dice "No informada" cuando no se compartió persona mencionada', async () => {
  const field = (value: string | null) => ({ value, origin: value ? 'person' : null })
  mockApi({
    'GET /cases': { counts: { received: 1, new: 1, in_review: 0, follow_up: 0, closed: 0 }, items: [{ case_id: 'V-001', submitted_at: new Date().toISOString(), status: 'new', assignee: null }] },
    'GET /cases/V-001': { case_id: 'V-001', submitted_at: new Date().toISOString(), status: 'new', assignee: null, members: [], files: [], procedure: [],
      snapshot: { affected: { name: field('María X.') }, respondent: { name: field(null) }, respondent_confirmed: false,
        reporter: { same_as_affected: true, name: field('María X.') }, facts: { events: [], consequences: field(null) }, evidence: [], protection_measures: { selected: [], other: null } } },
  })
  render(<ToastProvider><Institutional institutionId="org" name="Andina" userId="u" /></ToastProvider>)
  expect(await screen.findByText('No informada')).toBeInTheDocument()
  expect(screen.queryByText(/No confirmada/)).toBeNull()
})
