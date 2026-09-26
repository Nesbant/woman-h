import { useCallback } from 'react'
import { currentDraft } from '../../api/complaint'
import { useResource } from '../../hooks/useResource'

/** The draft kept in sync with the reviewed timeline (created or refreshed when it lags behind). */
export function useCurrentDraft(recordId: string) {
  const { data: state, setData: setState, error, setError } = useResource(useCallback(() => currentDraft(recordId), [recordId]))
  return { state, setState, error, setError }
}
