// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { Institutional } from './Institutional'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const detail = {
  case_id: 'V-001', submitted_at: new Date().toISOString(), status: 'new', assignee: null,
  members: [{ id: 'u1', name: 'Lucía Demo' }],
  files: [{ id: 'c1', filename: 'captura_01.png', media_type: 'image/png', sha256: 'a'.repeat(64) }],
  snapshot: {
    affected: { name: { value: 'Ana Demo' } }, respondent: { name: { value: null } }, reporter: { same_as_affected: true, name: { value: 'Ana Demo' } },
    facts: { events: [{ description: 'Mensaje recibido', date_kind: 'exact', event_date: '2026-09-16', approximate_date: null, sources: ['captura_01.png · tu descripción'] }], consequences: { value: null } },
    protection_measures: { selected: [], other: null } },
  procedure: [{ key: 'rights_info', label: 'Información de derechos entregada', reference: null, done: false, done_at: null, done_by: null },
    { key: 'medical_psych', label: 'Atención médica / psicológica', reference: 'máximo 1 día hábil', done: false, done_at: null, done_by: null }],
}

test('lista casos escalados, abre el detalle, se asigna y marca hitos', async () => {
  const puts: { url: string; body: unknown }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit = {}) => {
    if (options.method === 'PUT') {
      const body = JSON.parse(options.body as string); puts.push({ url, body })
      if (url.endsWith('/assignee')) return Response.json({ ...detail, assignee: { id: 'u1', name: 'Lucía Demo' } })
      return Response.json({ ...detail, procedure: [{ ...detail.procedure[0], done: true, done_by: { id: 'u1', name: 'Lucía Demo' } }, detail.procedure[1]] })
    }
    if (url.endsWith('/cases')) return Response.json({ counts: { received: 1, new: 1, in_review: 0, follow_up: 0, closed: 0 },
      items: [{ case_id: 'V-001', submitted_at: detail.submitted_at, status: 'new', assignee: null }] })
    return Response.json(detail)
  }))
  render(<Institutional institutionId="org-1" name="Institución Aurora" userId="u1" onExpired={vi.fn()} />)
  const user = userEvent.setup()
  expect(await screen.findByText('Casos recibidos')).toBeInTheDocument()
  expect(screen.getByText('Hoy')).toBeInTheDocument()
  expect(screen.getByText('Sin asignar')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'V-001' }))
  expect(await screen.findByRole('heading', { name: 'Procedimiento' })).toBeInTheDocument()
  expect(screen.getByText(/Referencia: máximo 1 día hábil/)).toBeInTheDocument()
  expect(screen.getByText('16/09/2026')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Asignarme' }))
  expect(await screen.findByLabelText('Responsable')).toHaveValue('u1')
  await user.click(screen.getByRole('checkbox', { name: /Información de derechos entregada/ }))
  expect(await screen.findByText(/Hecho por Lucía Demo/)).toBeInTheDocument()
  expect(puts.map(p => p.url.split('/V-001')[1])).toEqual(['/assignee', '/procedure/rights_info'])
}, 20000)
