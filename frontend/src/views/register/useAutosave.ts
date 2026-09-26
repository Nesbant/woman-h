import { useEffect, useRef, useState } from 'react'

const DELAY_MS = 700

/** Debounced saves per key, with a visible saving state. `flush` cancels pending timers. */
export function useAutosave(onError: (e: unknown) => void) {
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const [saving, setSaving] = useState(false)
  useEffect(() => { const pending = timers.current; return () => Object.values(pending).forEach(clearTimeout) }, [])
  const run = async (task: () => Promise<unknown>) => {
    setSaving(true)
    try { await task() } catch (e) { onError(e) } finally { setSaving(false) }
  }
  const schedule = (key: string, task: () => Promise<unknown>) => {
    clearTimeout(timers.current[key])
    timers.current[key] = setTimeout(() => run(task), DELAY_MS)
  }
  const cancel = () => Object.values(timers.current).forEach(clearTimeout)
  return { saving, schedule, run, cancel }
}
