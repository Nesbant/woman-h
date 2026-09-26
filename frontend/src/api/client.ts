export type Membership = { institution_id: string; name: string; role: 'admin' | 'reviewer' }
export type User = { id: string; name: string; email: string; memberships: Membership[] }
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}
async function request(path: string, options: RequestInit = {}): Promise<Response> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, { ...options, credentials: 'same-origin',
      headers: { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), 'X-VERA-Request': '1', ...options.headers } })
  } catch { throw new Error('No se pudo conectar con VERA. Intenta nuevamente.') }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new ApiError(response.status, typeof body.detail === 'string' ? body.detail : 'No se pudo completar la solicitud')
  }
  return response
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await request(path, options)
  return response.status === 204 ? undefined as T : response.json()
}
export async function apiBlob(path: string): Promise<Blob> {
  return (await request(path)).blob()
}
