// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import type { ReactNode } from 'react'
import conversation from '../../../../contracts/examples/conversation.json'
import shareTurn from '../../../../contracts/examples/chat_turn_share.json'
import { ToastProvider } from '../../components/Toast'
import { mockApi } from '../../testing'
import { ConversationView } from '../conversation/ConversationView'
import { Share } from './Share'
import { stageSharePreselection } from './useShareSelection'

const field = (value: string | null) => ({ value, origin: value ? 'profile' : null })
const fact = (event_id: string, title: string) => ({ event_id, title, description: title, date_kind: 'unknown',
  event_date: null, approximate_date: null, event_time: null, sources: [], edited: false })
const draft = { revision: 5, timeline_revision: 3, stale: false, reviewed: true, pending: [], fields: {
  affected: { name: field('María'), document: field(null), contact: field(null), position: field(null), area: field(null), relationship: field(null) },
  respondent: { name: field(null), position: field(null), area: field(null), relationship: field(null) },
  respondent_confirmed: false, respondent_detection: null,
  reporter: { same_as_affected: true, name: field('María') },
  facts: { events: [fact('e1', 'Primer hecho'), fact('e2', 'Segundo hecho')], consequences: field(null) },
  evidence: { file_ids: ['f1', 'f2'] }, protection_measures: { selected: [], other: null },
} }
const file = (id: string) => ({ id, filename: `${id}.pdf`, description: null, media_type: 'application/pdf',
  size: 10, sha256: 'a'.repeat(64), created_at: '', account_ids: [] })
const setup = (extra: Record<string, unknown> = {}) => mockApi({
  'GET /complaint': { timeline_revision: 3, measure_options: [], draft },
  'GET /files': { items: [file('f1'), file('f2')] },
  'GET /organizations': [{ id: 'org', name: 'Organización' }],
  'GET /profile': { name: 'María', institution: { id: 'org', name: 'Organización' } },
  'POST /submit': { case_id: 'V-004', institution_name: 'Organización', submitted_at: '', shared: { events: 1, files: 1 }, files: [] },
  ...extra,
})
const wrap = (node: ReactNode) => render(<ToastProvider>{node}</ToastProvider>)
const shared = () => screen.getByRole('heading', { name: 'Se compartirá' }).closest('section')!
const kept = () => screen.getByRole('heading', { name: 'Seguirá privado' }).closest('section')!

beforeEach(() => { vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); sessionStorage.clear() })
afterEach(() => { cleanup(); window.location.hash = ''; sessionStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

test('entrada manual conserva la selección normal de EST-06 sin enviar', async () => {
  const calls = setup()
  wrap(<Share recordId="rec" />)
  await screen.findByRole('heading', { name: 'Se compartirá' })
  expect(await within(shared()).findByText('Primer hecho', { exact: false })).toBeInTheDocument()
  expect(within(shared()).getByText('Segundo hecho', { exact: false })).toBeInTheDocument()
  expect(within(shared()).getByText('f1.pdf')).toBeInTheDocument()
  expect(within(shared()).getByText('f2.pdf')).toBeInTheDocument()
  expect(calls.some(call => call.url.endsWith('/submit'))).toBe(false)
})

test('preselección válida e IDs obsoletos eligen solo elementos disponibles desde el primer render', async () => {
  stageSharePreselection('rec', { event_ids: ['e2', 'no-existe'], file_ids: ['f2', 'otro'] })
  const calls = setup()
  wrap(<Share recordId="rec" />)
  await screen.findByRole('heading', { name: 'Se compartirá' })
  expect(await within(shared()).findByText('Segundo hecho', { exact: false })).toBeInTheDocument()
  expect(within(shared()).getByText('f2.pdf')).toBeInTheDocument()
  expect(within(kept()).getByText('Primer hecho', { exact: false })).toBeInTheDocument()
  expect(within(kept()).getByText('f1.pdf')).toBeInTheDocument()
  expect(calls.some(call => call.url.endsWith('/submit'))).toBe(false)
  const user = userEvent.setup()
  await user.click(within(kept()).getByText('Primer hecho', { exact: false }))
  expect(within(shared()).getByText('Primer hecho', { exact: false })).toBeInTheDocument()
  expect(calls.some(call => call.url.endsWith('/submit'))).toBe(false)
})

test('una preselección sin IDs válidos queda vacía y no se amplía a compartir todo', async () => {
  stageSharePreselection('rec', { event_ids: ['obsoleto'], file_ids: ['obsoleto'] })
  setup()
  wrap(<Share recordId="rec" />)
  await screen.findByRole('heading', { name: 'Se compartirá' })
  expect(await within(kept()).findByText('Primer hecho', { exact: false })).toBeInTheDocument()
  expect(within(kept()).getByText('Segundo hecho', { exact: false })).toBeInTheDocument()
  expect(within(kept()).getByText('f1.pdf')).toBeInTheDocument()
  expect(within(kept()).getByText('f2.pdf')).toBeInTheDocument()
})

test('un ID de hecho no selecciona un archivo con el mismo identificador', async () => {
  stageSharePreselection('rec', { event_ids: ['e2'], file_ids: [] })
  setup({ 'GET /files': { items: [file('e2')] } })
  wrap(<Share recordId="rec" />)
  await screen.findByRole('heading', { name: 'Se compartirá' })
  expect(within(shared()).getByText('Segundo hecho', { exact: false })).toBeInTheDocument()
  expect(within(kept()).getByText('e2.pdf')).toBeInTheDocument()
})

test('open_share_preview navega sin enviar; solo consentimiento y Confirmar y enviar usan EST-06', async () => {
  const turn = { ...shareTurn, suggested_actions: [{ type: 'open_share_preview', label: 'Ver vista previa',
    event_ids: ['e2', 'obsoleto'], file_ids: ['f2', 'obsoleto'] }] }
  const calls = setup({ 'GET /conversation': { ...conversation, case_id: 'rec', messages: [], case_state: shareTurn.case_state },
    'POST /messages': turn })
  const user = userEvent.setup()
  const chat = wrap(<ConversationView recordId="rec" />)
  await user.type(await screen.findByRole('textbox', { name: 'Tu mensaje' }), 'Quiero revisar antes de compartir')
  await user.click(screen.getByRole('button', { name: 'Enviar' }))
  await user.click(await screen.findByRole('button', { name: 'Ver vista previa' }))
  expect(window.location.hash).toBe('#/s/rec/compartir')
  expect(calls.some(call => call.url.endsWith('/submit'))).toBe(false)
  chat.unmount()
  wrap(<Share recordId="rec" />)
  await screen.findByRole('heading', { name: 'Se compartirá' })
  expect(await within(shared()).findByText('Segundo hecho', { exact: false })).toBeInTheDocument()
  expect(within(shared()).getByText('f2.pdf')).toBeInTheDocument()
  expect(within(kept()).getByText('Primer hecho', { exact: false })).toBeInTheDocument()
  expect(within(kept()).getByText('f1.pdf')).toBeInTheDocument()
  expect(calls.some(call => call.url.endsWith('/submit'))).toBe(false)
  await user.click(screen.getByRole('button', { name: 'Revisar lo que verá la organización' }))
  const dialog = await screen.findByRole('dialog')
  const ack = within(dialog).getByRole('checkbox')
  expect(ack).not.toBeChecked()
  await user.click(within(dialog).getByRole('button', { name: 'Confirmar y enviar' }))
  expect(calls.some(call => call.url.endsWith('/submit'))).toBe(false)
  await user.click(within(dialog).getByRole('button', { name: 'Volver y editar' }))
  await user.click(within(kept()).getByText('Primer hecho', { exact: false }))
  await user.click(within(shared()).getByText('f2.pdf'))
  expect(calls.some(call => call.url.endsWith('/submit'))).toBe(false)
  await user.click(screen.getByRole('button', { name: 'Revisar lo que verá la organización' }))
  const finalDialog = await screen.findByRole('dialog')
  expect(within(finalDialog).getByRole('checkbox')).not.toBeChecked()
  await user.click(within(finalDialog).getByRole('checkbox'))
  await user.click(within(finalDialog).getByRole('button', { name: 'Confirmar y enviar' }))
  await vi.waitFor(() => expect(calls.filter(call => call.url.endsWith('/submit'))).toHaveLength(1))
  expect(calls.find(call => call.url.endsWith('/submit'))!.body).toEqual({ draft_revision: 5, event_ids: ['e1', 'e2'], file_ids: [], institution_id: 'org' })
})
