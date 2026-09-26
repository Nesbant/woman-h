// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { Complaint, Share } from './Complaint'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const empty = { value: null, origin: null }
const fields = {
  affected: { name: { value: 'Ana Demo', origin: 'profile' }, document: empty, contact: empty, position: empty, area: empty, relationship: empty },
  respondent: { name: empty, position: empty, area: empty, relationship: empty, suggestions: ['Julio Ramírez (supervisor)'] },
  reporter: { same_as_affected: true, name: { value: 'Ana Demo', origin: 'profile' } },
  facts: { events: [
    { event_id: 'e1', description: 'Reunión presencial', date_kind: 'approximate', event_date: null, approximate_date: 'mediados de septiembre', sources: [{ kind: 'account', source_id: 'a', label: 'Relato 1' }], edited: false },
    { event_id: 'e2', description: 'Mensaje recibido', date_kind: 'exact', event_date: '2026-09-16', approximate_date: null, sources: [{ kind: 'file', source_id: 'f1', label: 'captura_01.png · tu descripción' }], edited: false },
  ], consequences: empty },
  evidence: { file_ids: ['f1'] },
  protection_measures: { selected: [], other: null },
}
const draft = { revision: 2, timeline_revision: 5, stale: false, fields, source_map: {}, missing: ['respondent.name'], reviewed: false }
const state = { timeline_confirmed: true, timeline_revision: 5, measure_options: { no_contact_order: 'Impedimento de acercamiento' }, draft }

test('el borrador muestra las seis secciones, marca faltantes y no completa identidades', async () => {
  const calls: { url: string; body?: unknown }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit = {}) => {
    calls.push({ url, body: options.body && JSON.parse(options.body as string) })
    return Response.json(state)
  }))
  render(<Complaint recordId="r1" onExpired={vi.fn()} />)
  const user = userEvent.setup()
  for (const heading of ['I. Datos de la persona afectada', 'II. Persona contra quien se formula la queja', 'III. Persona que presenta el reporte',
    'IV. Relación de hechos', 'V. Medios probatorios', 'VI. Medidas de protección solicitadas'])
    expect(await screen.findByText(heading, { selector: 'h2' }, { timeout: 4000 })).toBeInTheDocument()
  expect(screen.getByLabelText(/^Nombre/, { selector: '#respondent-name' })).toHaveValue('')
  expect(screen.getByText('EVENTO 1 · Fecha aproximada: mediados de septiembre')).toBeInTheDocument()
  expect(screen.getByText('Fuente ← captura_01.png · tu descripción')).toBeInTheDocument()
  expect(screen.getByText('[ Sin seleccionar ]')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Usar «Julio Ramírez (supervisor)»' }))
  expect(screen.getByLabelText(/^Nombre/, { selector: '#respondent-name' })).toHaveValue('Julio Ramírez')
  expect(screen.getByRole('button', { name: 'Revisar y compartir' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Guardar borrador' }))
  const put = calls.find(call => (call.body as { revision?: number })?.revision === 2)!
  expect(put.body).toMatchObject({ respondent: { name: { value: 'Julio Ramírez' } }, measures: [] })
}, 20000)

test('compartir separa lo que se envía de lo que sigue privado y envía solo lo marcado', async () => {
  let submitted: Record<string, unknown> | null = null
  vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit = {}) => {
    if (url.endsWith('/files')) return Response.json({ items: [
      { id: 'f1', filename: 'captura_01.png' }, { id: 'f2', filename: 'correo_01.pdf' }, { id: 'f3', filename: 'captura_02.png' }] })
    if (url.endsWith('/organizations')) return Response.json([{ id: 'org-1', name: 'Institución Aurora' }])
    if (url.endsWith('/complaint/review')) return Response.json({ ...state, draft: { ...draft, reviewed: true } })
    if (url.endsWith('/submit')) { submitted = JSON.parse(options.body as string); return Response.json({ case_id: 'V-001', institution_name: 'Institución Aurora', shared: { events: 1, files: 1 } }, { status: 201 }) }
    return Response.json(state)
  }))
  render(<Share recordId="r1" onExpired={vi.fn()} />)
  const user = userEvent.setup()
  const privateCard = (await screen.findByText('Seguirá privado', { selector: 'h2' }, { timeout: 4000 })).closest('section')!
  expect(within(privateCard).getByText('🔒 Relato personal y sus citas')).toBeInTheDocument()
  expect(within(privateCard).getByText('🔒 correo_01.pdf')).toBeInTheDocument()
  expect(screen.getByLabelText('captura_01.png')).toBeChecked()
  await user.click(screen.getByLabelText('Evento 1 · Fecha aproximada: mediados de septiembre'))
  expect(within(privateCard).getByText('🔒 Evento 1')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Revisar lo que verá la organización' }))
  expect(await screen.findByText('ASÍ LO VERÁ INSTITUCIÓN AURORA')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Confirmar y enviar' }))
  expect(await screen.findByRole('heading', { name: 'Caso V-001' })).toBeInTheDocument()
  expect(submitted).toEqual({ draft_revision: 2, event_ids: ['e2'], file_ids: ['f1'], institution_id: 'org-1' })
}, 20000)

function shareFetch(current: object, onSubmit: (body: Record<string, unknown>) => void = () => {}) {
  return vi.fn(async (url: string, options: RequestInit = {}) => {
    if (url.endsWith('/files')) return Response.json({ items: [{ id: 'f1', filename: 'captura_01.png' }] })
    if (url.endsWith('/organizations')) return Response.json([{ id: 'org-1', name: 'Institución Aurora' }])
    if (url.endsWith('/complaint/review')) return Response.json({ ...current, draft: { ...(current as typeof state).draft, reviewed: true } })
    if (url.endsWith('/submit')) { onSubmit(JSON.parse(options.body as string)); return Response.json({ case_id: 'V-001', institution_name: 'Aurora', shared: { events: 2, files: 1 } }, { status: 201 }) }
    return Response.json(current)
  })
}

test('compartir no permite enviar un borrador desactualizado', async () => {
  vi.stubGlobal('fetch', shareFetch({ ...state, draft: { ...draft, stale: true } }))
  render(<Share recordId="r1" onExpired={vi.fn()} />)
  expect(await screen.findByRole('alert', {}, { timeout: 4000 })).toHaveTextContent('Tu cronología cambió')
  expect(screen.queryByText('Revisar lo que verá la organización')).toBeNull()
  expect(screen.getByRole('button', { name: 'Actualizar borrador' })).toBeInTheDocument()
}, 20000)

test('compartir ignora archivos del borrador que ya no existen', async () => {
  let submitted: Record<string, unknown> | null = null
  const current = { ...state, draft: { ...draft, fields: { ...fields, evidence: { file_ids: ['f1', 'borrado'] } } } }
  vi.stubGlobal('fetch', shareFetch(current, body => { submitted = body }))
  render(<Share recordId="r1" onExpired={vi.fn()} />)
  const user = userEvent.setup()
  await user.click(await screen.findByText('Revisar lo que verá la organización', {}, { timeout: 4000 }))
  await user.click(await screen.findByText('Confirmar y enviar'))
  await screen.findByText('Caso V-001')
  expect(submitted).toMatchObject({ file_ids: ['f1'] })
}, 20000)
