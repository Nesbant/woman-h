import { useEffect, useState } from 'react'

export type Step = 'registrar' | 'entender' | 'preparar' | 'compartir'
export type Route =
  | { name: 'home' }
  | { name: 'record'; recordId: string; step: Step | 'enviado' }
  | { name: 'institutional' }

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#\/?/, '')
  const record = /^s\/([^/]+)\/(registrar|entender|preparar|compartir|enviado)$/.exec(path)
  if (record) return { name: 'record', recordId: record[1], step: record[2] as Step | 'enviado' }
  if (path === 'institutional') return { name: 'institutional' }
  return { name: 'home' }
}

export const NEW_RECORD = 'nuevo'

export function navigate(path: string) { window.location.hash = `/${path}` }
export const recordPath = (recordId: string, step: Step | 'enviado') => `s/${recordId}/${step}`

export function useRoute() {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash))
  useEffect(() => {
    const update = () => { setRoute(parseRoute(window.location.hash)); try { window.scrollTo(0, 0) } catch { /* jsdom */ } }
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])
  return route
}
