import { useCallback, useState } from 'react'
import { useFailure } from './useFailure'

/** Runs one mutation at a time, exposing `busy` and a user-facing error. Resolves to undefined on failure. */
export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fail = useFailure()
  const run = useCallback(async <T,>(task: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true); setError('')
    try { return await task() }
    catch (e) { fail(e, setError); return undefined }
    finally { setBusy(false) }
  }, [fail])
  return { busy, error, setError, run }
}
