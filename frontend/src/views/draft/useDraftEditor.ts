import { useCallback, useEffect, useRef, useState } from 'react'
import { confirmRespondent, saveDraft } from '../../api/complaint'
import type { DraftFields, DraftState } from '../../types'
import { useFailure } from '../../hooks/useFailure'

const SAVE_MS = 600

/** Local copy of the draft with debounced, serialized saves: each save uses the revision the previous returned. */
export function useDraftEditor(recordId: string, state: DraftState | null, setState: (s: DraftState) => void, setError: (m: string) => void) {
  const [form, setForm] = useState<DraftFields | null>(null)
  const [saving, setSaving] = useState(false)
  const latest = useRef<DraftFields | null>(null)
  const revision = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const chain = useRef<Promise<void>>(Promise.resolve())
  const fail = useFailure()

  useEffect(() => {
    if (state?.draft && !latest.current) { latest.current = state.draft.fields; setForm(state.draft.fields) }
    if (state?.draft) revision.current = state.draft.revision
  }, [state])
  useEffect(() => () => clearTimeout(timer.current), [])

  const accept = useCallback((next: DraftState) => { revision.current = next.draft!.revision; setState(next) }, [setState])
  const flush = useCallback(() => {
    clearTimeout(timer.current)
    chain.current = chain.current.then(async () => {
      if (!latest.current) return
      setSaving(true)
      try { accept(await saveDraft(recordId, latest.current, revision.current)) }
      catch (e) { fail(e, setError) }
      finally { setSaving(false) }
    })
    return chain.current
  }, [recordId, accept, fail, setError])

  const change = (update: (fields: DraftFields) => DraftFields) => {
    if (!latest.current) return
    latest.current = update(latest.current); setForm(latest.current)
    clearTimeout(timer.current); timer.current = setTimeout(flush, SAVE_MS)
  }
  const confirmPerson = async () => {
    await flush()
    try {
      accept(await confirmRespondent(recordId, revision.current))
      latest.current = { ...latest.current!, respondent_confirmed: true }; setForm(latest.current)
      return true
    } catch (e) { fail(e, setError); return false }
  }
  return { form, saving, change, flush, confirmPerson }
}
