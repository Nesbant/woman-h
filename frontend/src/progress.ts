import type { Overview } from './types'
import type { Step } from './router'

export const STEPS: { id: Step; label: string; short: string }[] = [
  { id: 'registrar', label: 'Registrar', short: 'Registrar' },
  { id: 'entender', label: 'Entender', short: 'Entender' },
  { id: 'preparar', label: 'Preparar reporte', short: 'Preparar' },
  { id: 'compartir', label: 'Revisar y compartir', short: 'Compartir' },
]

/** Which steps of a situation are done, derived only from the owner's own overview. */
export function progress(overview: Overview | null) {
  const sent = !!overview?.submissions.length
  const t = overview?.timeline
  const done: Record<Step, boolean> = {
    registrar: !!overview?.story || !!overview?.files,
    entender: !!t && t.processed && t.total > 0 && t.pending === 0,
    preparar: sent || (!!overview?.draft.exists && !overview.draft.stale),
    compartir: sent,
  }
  const reviewLabel = sent ? 'Caso enviado · puedes seguir editando en privado.'
    : 'Puedes revisar y completar esta situación cuando quieras.'
  return { done, reviewLabel, sent }
}
