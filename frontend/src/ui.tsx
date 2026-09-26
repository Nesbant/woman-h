import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ApiError } from './api'

export function LockIcon({ size = 14, width = 1.6 }: { size?: number; width?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={width} aria-hidden="true">
    <rect x="3" y="7" width="10" height="7" rx="2" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></svg>
}
export function SquareIcon() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="2.5" y="2.5" width="11" height="11" rx="3" /></svg>
}
export function CaseIcon() {
  return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="2.5" y="4" width="11" height="9.5" rx="1.5" /><path d="M6 4V2.5h4V4" /></svg>
}
export function InboxIcon() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="2.5" y="2.5" width="11" height="11" rx="2" /><path d="M2.5 6.5h11" /></svg>
}

export function PageTitle({ eyebrow, title, lead, inst, children }: { eyebrow: string; title: string; lead?: ReactNode; inst?: boolean; children?: ReactNode }) {
  return <div className="page-head">
    <div className="page-title"><span className={`eyebrow${inst ? ' inst' : ''}`}>{eyebrow}</span><h1>{title}</h1>{lead && <p>{lead}</p>}</div>
    {children}
  </div>
}

type Toast = { notify: (message: string) => void }
const ToastContext = createContext<Toast>({ notify: () => {} })
export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const notify = useCallback((text: string) => {
    clearTimeout(timer.current); setMessage(text)
    timer.current = setTimeout(() => setMessage(null), 2400)
  }, [])
  useEffect(() => () => clearTimeout(timer.current), [])
  return <ToastContext.Provider value={{ notify }}>{children}{message && <div role="status" className="toast">{message}</div>}</ToastContext.Provider>
}

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

export function Drawer({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  return <>
    <div className="scrim" onClick={onClose} />
    <aside className="drawer" role="dialog" aria-modal="true" aria-label={label}>{children}</aside>
  </>
}
