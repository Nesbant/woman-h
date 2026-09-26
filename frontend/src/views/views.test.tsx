// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import type { ReactNode } from 'react'
import { ToastProvider } from '../components/Toast'
import { mockApi } from '../testing'
import { Understand } from './understand/Understand'
import { Draft } from './draft/Draft'
import { Share } from './share/Share'
import { Institutional } from './institutional/Institutional'

afterEach(() => { cleanup(); window.location.hash = ''; vi.restoreAllMocks(); vi.unstubAllGlobals() })
beforeEach(() => { vi.spyOn(window, 'scrollTo').mockImplementation(() => {}) })
const wrap = (node: ReactNode) => render(<ToastProvider>{node}</ToastProvider>)

const relato = { id: 's1', kind: 'account', source_id: 'acc', label: 'Relato 1', quote: 'A mediados de septiembre tuve una reunión.', page: null }
const captura = { id: 's2', kind: 'file', source_id: 'f1', label: 'captura_01.png · tu descripción', quote: '22:43 — «¿Sigues despierta?', page: null }
const event = (id: string, title: string, source: object, extra: object = {}) => ({ id, title, description: `${title} descrita`, date_kind: 'exact',
  event_date: '2026-09-16', approximate_date: null, event_time: '22:43', status: 'proposed', edited: false, reviewed: false, mode: 'fixture',
  original: {}, source, sources: [source], support_quotes: [(source as { quote: string }).quote], ...extra })
const timeline = (events: object[], items: object[] = []) => ({ revision: 3, mode: 'fixture', configured_mode: 'fixture', warnings: [], processed_at: 'x', events, review_items: items })

test('Entender confirma eventos y resuelve avisos citando sus fuentes', async () => {
  const meeting = event('e1', 'Reunión presencial', relato, { date_kind: 'approximate', event_date: null, event_time: null, approximate_date: 'mediados de septiembre' })
  const messages = event('e2', 'Mensajes fuera de horario', captura)
  const notice = { id: 'r1', kind: 'date_inconsistency', message: 'El relato dice martes 15.', source_ids: ['s2'], file_id: null, status: 'open', event_ids: ['e2'], action_label: 'Usar 16 sep', resolution_note: 'Fecha conservada según captura_01.png' }
  const calls = mockApi({
    'GET /timeline': timeline([meeting, messages], [notice]),
    'PUT /events/e1': timeline([{ ...meeting, status: 'accepted', reviewed: true }, messages], [notice]),
    'PUT /review-items/r1': timeline([{ ...meeting, status: 'accepted', reviewed: true }, { ...messages, note: 'Fecha conservada según captura_01.png' }], [{ ...notice, status: 'resolved' }]),
  })
  wrap(<Understand recordId="rec" />)
  const user = userEvent.setup()
  expect(await screen.findByText('Fecha aproximada · mediados de septiembre')).toBeInTheDocument()
  expect(screen.getByText('16 sep · 22:43')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /captura_01.png ↗/ })).toBeInTheDocument()
  expect(screen.getByText('0 de 2')).toBeInTheDocument()
  const card = screen.getByRole('article', { name: 'Reunión presencial' })
  await user.click(within(card).getByRole('button', { name: 'Confirmar' }))
  expect(await screen.findByText('Evento confirmado. Tú mantienes el control.')).toBeInTheDocument()
  expect(calls.find(c => c.url.endsWith('/events/e1'))!.body).toMatchObject({ revision: 3, status: 'accepted', title: 'Reunión presencial' })
  expect(screen.getByText('1 de 2')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Usar 16 sep' }))
  expect(await screen.findByText('✓ Fecha conservada según captura_01.png')).toBeInTheDocument()
  expect(screen.getByText('Fecha conservada según captura_01.png', { selector: '.event-note' })).toBeInTheDocument()
})

const field = (value: string | null, origin: string | null = value ? 'profile' : null) => ({ value, origin })
const fields = (confirmed: boolean) => ({
  affected: { name: field('María X.'), document: field('DNI •••• 4821'), contact: field(null), position: field('Analista'), area: field('Operaciones'), relationship: field(null) },
  respondent: { name: field('Juan X.', 'detected'), position: field('Supervisor', 'detected'), area: field(null), relationship: field(null) },
  respondent_confirmed: confirmed, respondent_detection: { name: 'Juan X.', position: 'Supervisor', found_in: ['tu relato', 'captura_01.png'] },
  reporter: { same_as_affected: true, name: field('María X.') },
  facts: { events: [{ event_id: 'e2', title: 'Mensajes fuera de horario', description: 'Dos mensajes.', date_kind: 'exact', event_date: '2026-09-16', approximate_date: null, event_time: '22:43',
    sources: [{ kind: 'file', source_id: 'f1', label: 'captura_01.png · tu descripción' }], edited: false }], consequences: field(null) },
  evidence: { file_ids: ['f1'] }, protection_measures: { selected: [], other: null },
})
const draftState = (confirmed: boolean, extra: object = {}) => ({ timeline_revision: 3,
  measure_options: [{ code: 'no_contact', label: 'Impedimento de acercamiento o contacto', help: 'Evitar comunicación directa.' }],
  draft: { revision: 5, timeline_revision: 3, stale: false, reviewed: false, fields: fields(confirmed),
    pending: confirmed ? [] : [{ key: 'respondent', title: 'Identidad de la persona mencionada', detail: 'Detectada por VERA; requiere tu confirmación.' }], ...extra } })
const files = { items: [{ id: 'f1', filename: 'captura_01.png', description: null, media_type: 'image/png', size: 2048, sha256: 'a'.repeat(64), created_at: '', account_ids: [] },
  { id: 'f3', filename: 'captura_02.png', description: null, media_type: 'image/png', size: 2048, sha256: 'b'.repeat(64), created_at: '', account_ids: [] }] }

test('Preparar muestra la identidad detectada como pendiente y guarda cambios automáticamente', async () => {
  const calls = mockApi({
    'GET /complaint': draftState(false), 'GET /files': files,
    'PUT /complaint': draftState(false, { revision: 6 }),
    'POST /complaint/confirm-respondent': draftState(true, { revision: 7 }),
  })
  wrap(<Draft recordId="rec" />)
  const user = userEvent.setup()
  expect(await screen.findByText(/VERA detectó este nombre en tu relato y en captura_01.png/)).toBeInTheDocument()
  expect(screen.getByLabelText(/^Documento de identidad/)).toHaveValue('DNI •••• 4821')
  expect(screen.getByLabelText(/^Contacto/)).toHaveAttribute('placeholder', 'Pendiente de confirmar')
  expect(screen.getByText('Respalda Evento 1')).toBeInTheDocument()
  await user.click(screen.getByText('Impedimento de acercamiento o contacto'))
  await vi.waitFor(() => expect(calls.some(c => c.method === 'PUT')).toBe(true), { timeout: 3000 })
  expect(calls.find(c => c.method === 'PUT')!.body).toMatchObject({ revision: 5, measures: ['no_contact'], facts: [] })
  await user.click(screen.getByRole('button', { name: 'Confirmar identidad' }))
  expect(await screen.findByText('✓ Confirmado por ti')).toBeInTheDocument()
  expect(calls.find(c => c.url.endsWith('/confirm-respondent'))!.body).toEqual({ revision: 6 })
}, 20000)

test('Compartir envía solo lo marcado y la vista previa no muestra identidades sin confirmar', async () => {
  const calls = mockApi({
    'GET /complaint': draftState(false), 'GET /files': files, 'GET /organizations': [{ id: 'otra', name: 'Otra' }],
    'GET /profile': { name: 'María X.', institution: { id: 'andina', name: 'Empresa Andina S.A.C.' } },
    'POST /complaint/review': draftState(false, { reviewed: true }),
    'POST /submit': { case_id: 'V-004', institution_name: 'Empresa Andina S.A.C.', submitted_at: '', shared: { events: 1, files: 0 }, files: [] },
  })
  wrap(<Share recordId="rec" />)
  const user = userEvent.setup()
  const privateList = (await screen.findByRole('heading', { name: 'Seguirá privado' })).closest('section')!
  expect(within(privateList).getByText('captura_02.png')).toBeInTheDocument()
  expect(within(privateList).getByText('Nota privada')).toBeInTheDocument()
  await user.click(screen.getByText('captura_01.png'))
  expect(within(privateList).getByText('captura_01.png')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Revisar lo que verá la organización' }))
  const dialog = await screen.findByRole('dialog')
  expect(within(dialog).getByText('Sin confirmar · no se compartirá')).toBeInTheDocument()
  expect(within(dialog).getByText(/relato personal completo · nota privada · captura_01.png · captura_02.png/)).toBeInTheDocument()
  await user.click(within(dialog).getByRole('button', { name: 'Confirmar y enviar' }))
  expect(calls.some(c => c.url.endsWith('/submit'))).toBe(false)
  await user.click(within(dialog).getByText(/Entiendo que, al confirmar, Empresa Andina S.A.C./))
  await user.click(within(dialog).getByRole('button', { name: 'Confirmar y enviar' }))
  await vi.waitFor(() => expect(calls.some(c => c.url.endsWith('/submit'))).toBe(true))
  expect(calls.find(c => c.url.endsWith('/submit'))!.body).toEqual({ draft_revision: 5, event_ids: ['e2'], file_ids: [], institution_id: 'andina' })
  expect(window.location.hash).toBe('#/s/rec/enviado')
}, 20000)

test('Institutional asigna, cambia estado y avanza el checklist en tres estados', async () => {
  const step = (status: string) => ({ key: 'rights_info', label: 'Información de derechos', description: 'Dejar constancia', reference: null, status, updated_at: null, updated_by: null })
  const detail = (extra: object = {}) => ({ case_id: 'V-004', submitted_at: new Date().toISOString(), status: 'new', assignee: null, members: [], files: [],
    snapshot: { summary: 'Caso recibido con 1 evento y 0 archivos seleccionados por la persona.', affected: { name: field('María X.') }, respondent: { name: field(null) },
      respondent_confirmed: false, reporter: { same_as_affected: true, name: field('María X.') },
      facts: { events: [{ title: 'Mensajes fuera de horario', description: '', date_kind: 'exact', event_date: '2026-09-16', approximate_date: null, event_time: '22:43', sources: [] }], consequences: field(null) },
      evidence: [], protection_measures: { selected: [], other: null } }, procedure: [step('pending')], ...extra })
  const calls = mockApi({
    'GET /cases': { counts: { received: 4, new: 1, in_review: 1, follow_up: 1, closed: 1 }, items: [{ case_id: 'V-004', submitted_at: new Date().toISOString(), status: 'new', assignee: null }] },
    'GET /cases/V-004': detail(),
    'PUT /V-004/assignee': detail({ status: 'in_review', assignee: { id: 'lucia', name: 'Lucía R.' } }),
    'PUT /procedure/rights_info': detail({ status: 'in_review', assignee: { id: 'lucia', name: 'Lucía R.' }, procedure: [step('in_progress')] }),
  })
  wrap(<Institutional institutionId="org" name="Empresa Andina S.A.C." userId="lucia" />)
  const user = userEvent.setup()
  expect(await screen.findByRole('heading', { name: 'Caso V-004' })).toBeInTheDocument()
  expect(screen.getByText('En revisión o seguimiento')).toBeInTheDocument()
  expect(screen.getByText('No informada')).toBeInTheDocument()
  expect(screen.getByText('16 sep · 22:43')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Asignarme' }))
  expect(await screen.findByText('Lucía R. (tú)')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Información de derechos: Pendiente. Cambiar estado' }))
  expect(await screen.findByRole('button', { name: 'Información de derechos: En curso. Cambiar estado' })).toBeInTheDocument()
  expect(calls.find(c => c.url.endsWith('/procedure/rights_info'))!.body).toEqual({ status: 'in_progress' })
  expect(calls.every(c => !c.url.includes('/records'))).toBe(true)
}, 20000)
