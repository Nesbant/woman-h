import { api } from './client'

/** JSON request helpers shared by every resource module. */
export const get = <T>(path: string) => api<T>(path)
export const send = <T>(method: 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown) =>
  api<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) })
