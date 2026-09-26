import { createContext, useCallback, useContext } from 'react'
import { ApiError } from '../api/client'

/** Session expiry is handled once, at the shell; views only report it. */
const ExpiredContext = createContext<() => void>(() => {})
export const ExpiredProvider = ExpiredContext.Provider

export function useFailure() {
  const expired = useContext(ExpiredContext)
  return useCallback((error: unknown, set: (message: string) => void) => {
    if (error instanceof ApiError && error.status === 401) expired()
    else set((error as Error).message)
  }, [expired])
}
