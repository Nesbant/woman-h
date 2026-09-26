import { useCallback, useEffect, useState } from 'react'
import * as session from '../api/session'
import type { DemoView } from '../api/session'
import type { User } from '../types'
import { navigate } from '../router'

/** Who is signed in, whether demo mode is on, and the actions that change it. */
export function useSession() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [demo, setDemo] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    session.health().then(result => setDemo(result.demo)).catch(() => {})
    session.currentUser().then(setUser).catch(e => setError((e as Error).message)).finally(() => setLoading(false))
  }, [])
  // A new screen starts at the top even when the hash does not change (the login form may be scrolled on mobile).
  const signedIn = useCallback((value: User, path = '') => {
    setError(''); setUser(value); navigate(path)
    try { window.scrollTo(0, 0) } catch { /* jsdom */ }
  }, [])
  const expired = useCallback(() => { setUser(null); setError('Tu sesión terminó. Inicia sesión nuevamente.') }, [])
  const switchDemo = useCallback(async (view: DemoView) => {
    try { signedIn(await session.switchDemo(view), view === 'organization' ? 'institutional' : '') }
    catch (e) { setError((e as Error).message) }
  }, [signedIn])
  const logout = useCallback(async () => {
    try { await session.logout() } catch { /* the session ends locally anyway */ }
    setUser(null); navigate('')
  }, [])
  return { user, loading, demo, error, signedIn, expired, switchDemo, logout }
}
