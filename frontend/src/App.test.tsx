// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { App } from './App'
import { mockApi } from './testing'

afterEach(() => { cleanup(); window.location.hash = ''; vi.restoreAllMocks(); vi.unstubAllGlobals() })
beforeEach(() => { vi.spyOn(window, 'scrollTo').mockImplementation(() => {}) })
const maria = { id: 'm', name: 'María X.', email: 'maria@example.test', memberships: [] }
const lucia = { id: 'l', name: 'Lucía R.', email: 'lucia@example.test', memberships: [{ institution_id: 'org', name: 'Empresa Andina S.A.C.', role: 'reviewer' }] }

test('entra como persona con la demo y ve su espacio privado', async () => {
  const calls = mockApi({
    'GET /health': { demo: true }, 'GET /auth/me': () => Response.json({ detail: 'Inicia sesión' }, { status: 401 }),
    'POST /demo/switch': maria, 'GET /records': [],
  })
  render(<App />)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Entrar como persona' }))
  expect(await screen.findByRole('heading', { name: 'Hola, María' })).toBeInTheDocument()
  expect(screen.getByText('Privado · Solo tú')).toBeInTheDocument()
  expect(screen.getAllByText('✕ No puede verlo')).toHaveLength(4)
  expect(calls.find(c => c.url.endsWith('/demo/switch'))!.body).toEqual({ view_as: 'person' })
})

test('una cuenta con membresía ve el espacio institucional, nunca registros privados ajenos', async () => {
  window.location.hash = '#/institutional'
  const calls = mockApi({
    'GET /health': { demo: false }, 'GET /auth/me': lucia,
    'GET /cases': { counts: { received: 0, new: 0, in_review: 0, follow_up: 0, closed: 0 }, items: [] },
  })
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Casos recibidos' })).toBeInTheDocument()
  expect(await screen.findByText('Aún no se recibieron casos.')).toBeInTheDocument()
  expect(screen.getByText('Institutional · RR. HH.')).toBeInTheDocument()
  expect(calls.some(c => c.url.includes('/records'))).toBe(false)
})

test('el menú móvil abre y cierra el panel de navegación, y se cierra al navegar', async () => {
  mockApi({
    'GET /health': { demo: true }, 'GET /auth/me': () => Response.json({ detail: 'Inicia sesión' }, { status: 401 }),
    'POST /demo/switch': maria, 'GET /records': [],
  })
  render(<App />)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Entrar como persona' }))
  await screen.findByRole('heading', { name: 'Hola, María' })

  const menuButton = screen.getByRole('button', { name: 'Abrir menú' })
  expect(menuButton).toHaveAttribute('aria-expanded', 'false')
  expect(menuButton).toHaveAttribute('aria-controls', 'mobile-sidebar')

  await user.click(menuButton)
  expect(screen.getByRole('button', { name: 'Cerrar menú' })).toHaveAttribute('aria-expanded', 'true')
  expect(document.body.style.overflow).toBe('hidden')
  expect(document.getElementById('mobile-sidebar')).toHaveFocus()

  await user.keyboard('{Escape}')
  expect(screen.getByRole('button', { name: 'Abrir menú' })).toHaveAttribute('aria-expanded', 'false')
  expect(document.body.style.overflow).toBe('')
  expect(screen.getByRole('button', { name: 'Abrir menú' })).toHaveFocus()

  await user.click(screen.getByRole('button', { name: 'Abrir menú' }))
  await user.click(screen.getByRole('button', { name: 'Mi perfil' }))
  await screen.findByRole('heading', { name: 'Mi perfil' })
  expect(screen.getByRole('button', { name: 'Abrir menú' })).toHaveAttribute('aria-expanded', 'false')
})

test('un fallo de conexión se comunica sin mostrar una sesión simulada', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
  render(<App />)
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo conectar con VERA')
  expect(screen.queryByText('Privado · Solo tú')).not.toBeInTheDocument()
})
