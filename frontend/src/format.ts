import type { EventContent } from './types'

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** "16 sep · 22:43", "Fecha aproximada · mediados de septiembre" or "Fecha pendiente de confirmar". */
export function dateLabel(event: EventContent) {
  if (event.date_kind === 'exact' && event.event_date) {
    const [, month, day] = event.event_date.split('-')
    return `${Number(day)} ${MONTHS[Number(month) - 1]}${event.event_time ? ` · ${event.event_time}` : ''}`
  }
  if (event.date_kind === 'approximate') return `Fecha aproximada · ${event.approximate_date}`
  return 'Fecha pendiente de confirmar'
}

export function shortDate(iso: string) {
  const date = new Date(iso)
  if (date.toDateString() === new Date().toDateString()) return 'Hoy'
  return `${String(date.getDate()).padStart(2, '0')} ${MONTHS[date.getMonth()]}`
}

export function fullDate(iso: string) {
  const date = new Date(iso)
  const time = date.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false })
  const day = `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`
  return `${date.toDateString() === new Date().toDateString() ? 'hoy, ' : ''}${day} · ${time}`
}

export const shortSha = (sha: string) => `${sha.slice(0, 8)}…${sha.slice(-8)}`

export function glyph(mediaType: string) {
  return mediaType === 'application/pdf' ? 'PDF' : mediaType.startsWith('image/') ? 'IMG' : mediaType.startsWith('audio/') ? 'AUD' : 'DOC'
}

export function fileMeta(file: { media_type: string; size: number }) {
  const kind = file.media_type === 'application/pdf' ? 'PDF' : file.media_type.startsWith('image/') ? 'Imagen' : 'Archivo'
  const size = file.size >= 1024 * 1024 ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`
  return `${kind} · ${size}`
}

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase()
export const firstName = (name: string) => name.split(/\s+/)[0]
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
