import { api, apiBlob } from './client'
import { get, send } from './http'
import type { Attachment } from '../types'

const files = (recordId: string) => `/records/${recordId}/files`

export const listFiles = (recordId: string) => get<{ items: Attachment[] }>(files(recordId)).then(list => list.items)
export const getFile = (recordId: string, fileId: string) => get<Attachment>(`${files(recordId)}/${fileId}`)
export const filePreview = (recordId: string, fileId: string) => apiBlob(`${files(recordId)}/${fileId}/preview`)
export const deleteFile = (recordId: string, fileId: string) => send<void>('DELETE', `${files(recordId)}/${fileId}`)

export function uploadFile(recordId: string, file: File, description: string) {
  const form = new FormData()
  form.append('file', file)
  if (description.trim()) form.append('description', description.trim())
  return api<Attachment>(files(recordId), { method: 'POST', body: form })
}

/** Keeps the links to relatos; only the description changes. */
export const describeFile = (recordId: string, file: Attachment, description: string) =>
  send<Attachment>('PUT', `${files(recordId)}/${file.id}`, { description: description.trim() || null, account_ids: file.account_ids })
