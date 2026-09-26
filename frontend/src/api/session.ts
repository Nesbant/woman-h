import { api, ApiError } from './client'
import { get, send } from './http'
import type { User } from '../types'

export type DemoView = 'person' | 'organization'

export const health = () => get<{ demo: boolean }>('/health')
export const login = (email: string, password: string) => send<User>('POST', '/auth/login', { email, password })
export const logout = () => send<void>('POST', '/auth/logout')
export const switchDemo = (view_as: DemoView) => send<User>('POST', '/demo/switch', { view_as })

/** The signed-in user, or null when there is no session. */
export async function currentUser() {
  try { return await api<User>('/auth/me') }
  catch (e) { if (e instanceof ApiError && e.status === 401) return null; throw e }
}
