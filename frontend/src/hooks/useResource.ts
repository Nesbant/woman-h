import { useCallback, useEffect, useState } from 'react'
import { useFailure } from './useFailure'

/** Loads data once per `load` identity (memoize it with useCallback); `reload` fetches again. */
export function useResource<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0)
  const fail = useFailure()
  useEffect(() => {
    let active = true
    setError('')
    load().then(value => { if (active) setData(value) }).catch(e => { if (active) fail(e, setError) })
    return () => { active = false }
  }, [load, fail, tick])
  const reload = useCallback(() => setTick(v => v + 1), [])
  return { data, setData, error, setError, reload }
}
