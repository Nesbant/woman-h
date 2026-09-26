// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import candidateTurn from '../../../../contracts/examples/chat_turn_candidate.json'
import type { CaseState, SuggestedAction } from '../../types'
import { readSharePreselection } from '../share/useShareSelection'
import { SuggestedActions } from './SuggestedActions'

afterEach(() => { cleanup(); sessionStorage.clear(); window.location.hash = ''; vi.unstubAllGlobals() })

test('payload incompleto no rompe el chat ni dispara APIs; Confirmar sigue disponible', async () => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  const state = candidateTurn.case_state as CaseState
  const candidate = state.events.find(event => event.status === 'candidate')!
  const onConfirm = vi.fn()
  const malformed = { type: 'open_share_preview', label: 'Revisar propuesta', event_ids: null, file_ids: 42 } as unknown as SuggestedAction
  const actions = [null, malformed, { type: 'confirm_event', label: 'Confirmar hecho', event_ids: [candidate.id], file_ids: [] }] as SuggestedAction[]
  const user = userEvent.setup()
  render(<SuggestedActions actions={actions} recordId="rec" state={state} busy={false} onConfirm={onConfirm} />)
  await user.click(screen.getByRole('button', { name: `Confirmar hecho: ${candidate.title}` }))
  expect(onConfirm).toHaveBeenCalledWith(candidate)
  await user.click(screen.getByRole('button', { name: 'Revisar propuesta' }))
  expect(window.location.hash).toBe('#/s/rec/compartir')
  expect(readSharePreselection('rec')).toEqual({ event_ids: [], file_ids: [] })
  expect(fetch).not.toHaveBeenCalled()
})

test('keep_talking sigue siendo un botón accesible que devuelve el foco al composer', async () => {
  const action = { type: 'keep_talking', label: 'Seguir conversando', event_ids: [], file_ids: [] } as unknown as SuggestedAction
  const input = document.createElement('textarea')
  document.body.append(input)
  const user = userEvent.setup()
  render(<SuggestedActions actions={[action]} recordId="rec" state={null} busy={false}
    onConfirm={vi.fn()} onKeepTalking={() => input.focus()} />)
  await user.click(screen.getByRole('button', { name: 'Seguir conversando' }))
  expect(input).toHaveFocus()
  input.remove()
})
