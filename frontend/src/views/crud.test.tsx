// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import type { ReactNode } from 'react'
import { ToastProvider } from '../components/Toast'
import { mockApi } from '../testing'
import { Home } from './home/Home'
import { Register } from './register/Register'
import { Understand } from './understand/Understand'
import { ProfileView } from './profile/Profile'

afterEach(() => { cleanup(); window.location.hash = ''; vi.restoreAllMocks(); vi.unstubAllGlobals() })
beforeEach(() => { vi.spyOn(window, 'scrollTo').mockImplementation(() => {}) })
const wrap = (node: ReactNode) => render(<ToastProvider>{node}</ToastProvider>)
const overview = (submissions: object[] = []) => ({
  record: { id: 'r1', title: 'Situación #001', private_note: null, created_at: '', updated_at: new Date().toISOString() },
  story: { account_id: 'a1', description: 'Relato' }, files: 1,
  timeline: { processed: false, revision: 0, total: 0, pending: 0, accepted: 0, discarded: 0, open_review_items: 0 },
  draft: { exists: false, reviewed: false, stale: false }, submissions })

test('eliminar una situación enviada avisa qué conserva la organización y la borra', async () => {
  const sent = [{ case_id: 'V-004', institution_name: 'Empresa Andina S.A.C.', submitted_at: '', summary: { events: 1, files: [] } }]
  let deleted = false
  const calls = mockApi({
    'GET /records': () => deleted ? [] : [{ id: 'r1', title: 'Situación #001', created_at: '', updated_at: '' }],
    'GET /overview': overview(sent), 'DELETE /records/r1': () => { deleted = true; return new Response(null, { status: 204 }) },
  })
  wrap(<Home user={{ id: 'm', name: 'María X.', email: 'm', memberships: [] }} />)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Eliminar' }))
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByText(/Tu organización conserva el caso V-004 \(Empresa Andina S.A.C.\)/)).toBeInTheDocument()
  await user.click(within(dialog).getByRole('button', { name: 'Eliminar definitivamente' }))
  expect(await screen.findByText('Situación eliminada de tu espacio.')).toBeInTheDocument()
  expect(calls.some(c => c.method === 'DELETE' && c.url.endsWith('/records/r1'))).toBe(true)
  expect(screen.queryByRole('heading', { name: 'Situación #001' })).toBeNull()
}, 20000)

test('renombrar una situación conserva su descripción', async () => {
  const calls = mockApi({
    'GET /records': [{ id: 'r1', title: 'Situación #001', created_at: '', updated_at: '' }],
    'GET /overview': overview(), 'GET /records/r1': { id: 'r1', title: 'Situación #001', description: 'Texto inicial' },
    'PUT /records/r1': { id: 'r1', title: 'Reunión de septiembre', description: 'Texto inicial' },
  })
  wrap(<Home user={{ id: 'm', name: 'María X.', email: 'm', memberships: [] }} />)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Renombrar' }))
  await user.clear(screen.getByLabelText('Nombre'))
  await user.type(screen.getByLabelText('Nombre'), 'Reunión de septiembre')
  await user.click(screen.getByRole('button', { name: 'Guardar nombre' }))
  expect(await screen.findByText('Nombre actualizado.')).toBeInTheDocument()
  expect(calls.find(c => c.method === 'PUT')!.body).toEqual({ title: 'Reunión de septiembre', description: 'Texto inicial' })
}, 20000)

test('una evidencia se puede describir de nuevo y eliminar', async () => {
  const file = { id: 'f1', filename: 'captura_01.png', description: null, media_type: 'image/png', size: 2048, sha256: 'a'.repeat(64), created_at: '', account_ids: ['a1'] }
  const calls = mockApi({
    'GET /overview': overview(), 'GET /files': { items: [file] }, 'GET /accounts/a1': { id: 'a1', description: 'Relato', date_kind: 'unknown' },
    'PUT /files/f1': { ...file, description: 'Mensaje del 16/09/2026' },
    'DELETE /files/f1': () => new Response(null, { status: 204 }),
  })
  wrap(<Register recordId="r1" />)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Describir captura_01.png' }))
  await user.type(screen.getByLabelText(/Qué muestra captura_01.png/), 'Mensaje del 16/09/2026')
  await user.click(screen.getByRole('button', { name: 'Guardar descripción' }))
  expect(await screen.findByText('Descripción actualizada.')).toBeInTheDocument()
  expect(calls.find(c => c.method === 'PUT' && c.url.endsWith('/files/f1'))!.body).toEqual({ description: 'Mensaje del 16/09/2026', account_ids: ['a1'] })
  await user.click(screen.getByRole('button', { name: 'Eliminar captura_01.png' }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Eliminar evidencia' }))
  expect(await screen.findByText('Evidencia eliminada de tu espacio.')).toBeInTheDocument()
  expect(screen.queryByText('captura_01.png')).toBeNull()
}, 20000)

const proposal = { id: 'e1', title: 'Reunión', description: 'Reunión descrita', date_kind: 'unknown', event_date: null, approximate_date: null,
  status: 'accepted', edited: false, reviewed: true, mode: 'fixture', original: {},
  source: { id: 's1', kind: 'account', source_id: 'a1', label: 'Relato 1', quote: 'Reunión', page: null }, support_quotes: ['Reunión'] }
const manual = { ...proposal, id: 'm1', title: 'Cambio de escritorio', description: 'Me movieron.', mode: 'person',
  source: { id: 'manual:m1', kind: 'person', source_id: 'm1', label: 'Agregado por ti', quote: 'Me movieron.', page: null }, support_quotes: [] }
const state = (events: object[], revision = 4) => ({ revision, mode: 'fixture', configured_mode: 'fixture', warnings: [], processed_at: 'x', events, review_items: [] })

test('la persona agrega, edita y elimina un hecho propio; las propuestas de VERA solo se deshacen', async () => {
  const calls = mockApi({
    'GET /timeline': state([proposal]),
    'POST /timeline/events': state([proposal, manual], 5),
    'PUT /events/m1': state([proposal, { ...manual, title: 'Cambio de escritorio sin aviso', date_kind: 'exact', event_date: '2026-09-19', edited: true }], 6),
    'DELETE /events/m1?revision=6': state([proposal], 7),
  })
  wrap(<Understand recordId="r1" />)
  const user = userEvent.setup()
  const vera = await screen.findByRole('article', { name: 'Reunión' })
  expect(within(vera).getByRole('button', { name: 'Deshacer' })).toBeInTheDocument()
  expect(within(vera).queryByRole('button', { name: 'Eliminar' })).toBeNull()
  await user.click(screen.getByRole('button', { name: /Agregar un hecho que VERA no detectó/ }))
  await user.type(screen.getByLabelText('Título'), 'Cambio de escritorio')
  await user.type(screen.getByLabelText('Qué ocurrió, con tus palabras'), 'Me movieron.')
  await user.click(screen.getByRole('button', { name: 'Agregar hecho' }))
  const mine = await screen.findByRole('article', { name: 'Cambio de escritorio' })
  expect(calls.find(c => c.method === 'POST')!.body).toEqual({ revision: 4, title: 'Cambio de escritorio', description: 'Me movieron.', date_kind: 'unknown', event_date: null, approximate_date: null })
  expect(within(mine).getAllByText(/Agregado por ti/).length).toBeGreaterThan(0)
  await user.click(within(mine).getByRole('button', { name: 'Editar' }))
  await user.clear(within(mine).getByLabelText('Título'))
  await user.type(within(mine).getByLabelText('Título'), 'Cambio de escritorio sin aviso')
  await user.selectOptions(within(mine).getByLabelText('Precisión de la fecha'), 'exact')
  await user.type(within(mine).getByLabelText('Fecha'), '2026-09-19')
  await user.click(within(mine).getByRole('button', { name: 'Guardar corrección' }))
  const edited = await screen.findByRole('article', { name: 'Cambio de escritorio sin aviso' })
  expect(calls.find(c => c.method === 'PUT')!.body).toMatchObject({ revision: 5, status: 'accepted', title: 'Cambio de escritorio sin aviso', date_kind: 'exact', event_date: '2026-09-19' })
  await user.click(within(edited).getByRole('button', { name: 'Eliminar' }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Eliminar hecho' }))
  expect(await screen.findByText('Hecho eliminado.')).toBeInTheDocument()
  expect(screen.queryByRole('article', { name: 'Cambio de escritorio sin aviso' })).toBeNull()
}, 30000)

test('el perfil se edita y guarda', async () => {
  const profile = { name: 'María X.', email: 'm', institution: { id: 'andina', name: 'Empresa Andina S.A.C.' }, document: 'DNI •••• 4821', contact: null, position: 'Analista', area: null, relationship: null }
  const calls = mockApi({ 'GET /profile': profile, 'GET /organizations': [{ id: 'andina', name: 'Empresa Andina S.A.C.' }],
    'PUT /profile': { ...profile, area: 'Operaciones' } })
  wrap(<ProfileView />)
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('Área'), 'Operaciones')
  await user.click(screen.getByRole('button', { name: 'Guardar perfil' }))
  expect(await screen.findByText('Perfil guardado.')).toBeInTheDocument()
  expect(calls.find(c => c.method === 'PUT')!.body).toEqual({ institution_id: 'andina', document: 'DNI •••• 4821', contact: null, position: 'Analista', area: 'Operaciones', relationship: null })
}, 20000)
