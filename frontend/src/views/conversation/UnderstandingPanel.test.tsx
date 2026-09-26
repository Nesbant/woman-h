// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import caseExample from '../../../../contracts/examples/case_state.json'
import candidateExample from '../../../../contracts/examples/chat_turn_candidate.json'
import type { CaseState, ChatTurn } from '../../types'
import { UnderstandingPanel } from './UnderstandingPanel'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const state = caseExample as CaseState
const candidateState = (candidateExample as ChatTurn).case_state
const base = { changedIds: [] as string[], busyId: null, error: '', notice: '',
  onReview: vi.fn(async () => true), onRetry: vi.fn(), onOpenTimeline: vi.fn() }

test('cuenta hechos, evidencias y fechas aproximadas desde el estado', () => {
  render(<UnderstandingPanel {...base} state={state} />)
  const summary = screen.getByLabelText('Resumen del caso')
  expect(within(summary).getByText('Hechos').previousElementSibling).toHaveTextContent('4')
  expect(within(summary).getByText('Evidencias').previousElementSibling).toHaveTextContent(String(state.evidence.length))
  expect(within(summary).getByText('Fechas aproximadas').previousElementSibling).toHaveTextContent('1')
})

test('muestra candidato, estados y los tres orígenes sin confirmar una inferencia', () => {
  const inference = { ...state.events[3], status: 'candidate' as const, reviewed: false, needs_review: true }
  render(<UnderstandingPanel {...base} state={{ ...candidateState, events: [...candidateState.events, inference] }} />)
  const candidate = within(screen.getByLabelText('Lo que voy entendiendo')).getByRole('article', { name: candidateState.events[2].title })
  expect(within(candidate).getByText('Lo dijiste tú')).toBeInTheDocument()
  expect(within(candidate).getByText('Pendiente de confirmar')).toBeInTheDocument()
  expect(screen.getByRole('article', { name: state.events[1].title })).toHaveTextContent('De una evidencia')
  const inferred = screen.getByRole('article', { name: inference.title })
  expect(within(inferred).getByText('VERA lo infiere · confírmalo')).toBeInTheDocument()
  expect(within(inferred).getByText('Pendiente de confirmar')).toBeInTheDocument()
  expect(within(inferred).queryByText('Confirmado')).toBeNull()
})

test('resalta solo los IDs del último turno y abre la cronología existente', async () => {
  const id = candidateState.events[2].id
  const onOpenTimeline = vi.fn()
  render(<UnderstandingPanel {...base} state={candidateState} changedIds={[id]} onOpenTimeline={onOpenTimeline} />)
  expect(within(screen.getByRole('article', { name: candidateState.events[2].title })).getByText('Nuevo o actualizado')).toBeInTheDocument()
  expect(within(screen.getByRole('article', { name: candidateState.events[0].title })).queryByText('Nuevo o actualizado')).toBeNull()
  await userEvent.setup().click(screen.getByRole('button', { name: 'Ver lo registrado' }))
  expect(onOpenTimeline).toHaveBeenCalledTimes(1)
})

test('un panel sin hechos sigue disponible y no bloquea la conversación', () => {
  render(<UnderstandingPanel {...base} state={{ ...state, events: [], evidence: [], counts: { candidate: 0, confirmed: 0, corrected: 0, discarded: 0, with_evidence: 0 } }} />)
  expect(screen.getByText('Todavía no hay hechos para revisar. Puedes seguir conversando.')).toBeInTheDocument()
  expect(screen.queryByRole('article')).toBeNull()
})

test('en móvil el panel se abre y cierra con teclado y comunica aria-expanded', async () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
  render(<UnderstandingPanel {...base} state={state} />)
  const toggle = screen.getByRole('button', { name: 'Mostrar panel' })
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByRole('button', { name: 'Ver lo registrado' })).toBeNull()
  toggle.focus()
  await userEvent.setup().keyboard('{Enter}')
  expect(screen.getByRole('button', { name: 'Ocultar panel' })).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByRole('button', { name: 'Ver lo registrado' })).toBeInTheDocument()
  await userEvent.setup().keyboard('{Enter}')
  expect(screen.getByRole('button', { name: 'Mostrar panel' })).toHaveAttribute('aria-expanded', 'false')
})
