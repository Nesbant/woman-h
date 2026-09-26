import { vi } from 'vitest'

type Handler = (url: string, init: RequestInit) => unknown
/** Routes fetch calls by "METHOD path-suffix" to JSON responses, recording every request. */
export function mockApi(routes: Record<string, Handler | object>) {
  const calls: { method: string; url: string; body: unknown }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET'
    calls.push({ method, url, body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body })
    const key = Object.keys(routes).filter(k => { const [m, suffix] = k.split(' '); return m === method && url.endsWith(suffix) })
      .sort((a, b) => b.length - a.length)[0]
    if (!key) return Response.json({ detail: `Sin mock para ${method} ${url}` }, { status: 404 })
    const value = typeof routes[key] === 'function' ? (routes[key] as Handler)(url, init) : routes[key]
    return value instanceof Response ? value : Response.json(value)
  }))
  return calls
}
