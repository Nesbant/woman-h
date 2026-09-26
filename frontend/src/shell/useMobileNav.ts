import { useEffect, useRef, useState } from 'react'
import type { Route } from '../router'

/**
 * State for the mobile off-canvas nav drawer: closes on navigation and Escape,
 * locks body scroll while open, and moves focus in/out of the panel.
 */
export function useMobileNav(route: Route) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLElement>(null)

  // Closes on navigation: `route` is a fresh object only when the hash actually changed.
  useEffect(() => { setOpen(false) }, [route])

  useEffect(() => {
    if (!open) return
    panelRef.current?.focus()
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
      buttonRef.current?.focus()
    }
  }, [open])

  return { open, toggle: () => setOpen(v => !v), close: () => setOpen(false), buttonRef, panelRef }
}
