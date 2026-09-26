import { createContext, useContext } from 'react'
import type { Overview } from './types'

/** Current situation shared by the shell (sidebar, stepper) and the views that change it. */
export const RecordContext = createContext<{ overview: Overview | null; refresh: () => void }>({ overview: null, refresh: () => {} })
export const useRecordContext = () => useContext(RecordContext)
