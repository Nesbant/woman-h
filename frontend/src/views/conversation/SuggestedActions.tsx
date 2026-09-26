import { useState } from 'react'
import type { CaseEvent, CaseState, SuggestedAction } from '../../types'
import { navigate, recordPath } from '../../router'
import { stageSharePreselection } from '../share/useShareSelection'

export function SuggestedActions({ actions, recordId, state, busy, onConfirm, onKeepTalking }: {
  actions: SuggestedAction[]; recordId?: string; state: CaseState | null; busy: boolean
  onConfirm: (event: CaseEvent) => void; onKeepTalking?: () => void
}) {
  const [error, setError] = useState('')
  return <div className="conversation-suggested-actions" aria-label="Acciones sugeridas">
    {(Array.isArray(actions) ? actions : []).map((action, index) => {
      if (!action || typeof action !== 'object') return null
      if (action.type as string === 'keep_talking') return <button key={index} type="button" className="btn btn-secondary btn-sm"
        onClick={onKeepTalking}>{action.label || 'Seguir conversando'}</button>
      if (action.type === 'open_share_preview') return <button key={index} type="button" className="btn btn-secondary btn-sm" disabled={!recordId}
        onClick={() => {
          if (!recordId) return
          if (!stageSharePreselection(recordId, action)) { setError('No se pudo preparar la vista previa. Intenta nuevamente.'); return }
          setError('')
          navigate(recordPath(recordId, 'compartir'))
        }}>{typeof action.label === 'string' && action.label || 'Ver vista previa de lo que compartirías'}</button>
      if (action.type === 'confirm_event') return (Array.isArray(action.event_ids) ? action.event_ids : []).map(id => {
        const event = state?.events.find(item => item.id === id)
        return event?.status === 'candidate' ? <button key={`${index}-${id}`} type="button" className="btn btn-secondary btn-sm"
          disabled={busy} onClick={() => onConfirm(event)}>{action.label}: {event.title}</button> : null
      })
      return null
    })}
    {error && <p role="alert" className="error">{error}</p>}
  </div>
}
