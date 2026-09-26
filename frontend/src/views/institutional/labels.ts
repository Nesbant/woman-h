import type { CaseStatus, StepStatus } from '../../types'

export const STATUS_LABELS: Record<CaseStatus, string> = { new: 'Nuevo', in_review: 'En revisión', follow_up: 'Seguimiento', closed: 'Cerrado' }
export const STEP_STATES: Record<StepStatus, [string, string]> = { pending: ['Pendiente', '○'], in_progress: ['En curso', '◐'], done: ['Completado', '✓'] }
export const NEXT_STEP: Record<StepStatus, StepStatus> = { pending: 'in_progress', in_progress: 'done', done: 'pending' }
