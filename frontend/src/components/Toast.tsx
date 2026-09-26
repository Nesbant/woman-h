import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

const ToastContext = createContext<{ notify: (message: string) => void }>({ notify: () => {} })
export const useToast = () => useContext(ToastContext)
const VISIBLE_MS = 2400

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const notify = useCallback((text: string) => {
    clearTimeout(timer.current); setMessage(text)
    timer.current = setTimeout(() => setMessage(null), VISIBLE_MS)
  }, [])
  useEffect(() => () => clearTimeout(timer.current), [])
  return <ToastContext.Provider value={{ notify }}>{children}{message && <div role="status" className="toast">{message}</div>}</ToastContext.Provider>
}
