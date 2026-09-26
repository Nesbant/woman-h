import { get, send } from './http'
import type { EventContent, ReviewItem, TimelineEvent, TimelineState } from '../types'

const timeline = (recordId: string) => `/records/${recordId}/timeline`
export type EventInput = Required<Pick<EventContent, 'description' | 'date_kind' | 'event_date' | 'approximate_date'>> & { title: string }

export const getTimeline = (recordId: string) => get<TimelineState>(timeline(recordId))
export const analyzeTimeline = (recordId: string, revision: number) => send<TimelineState>('POST', `${timeline(recordId)}/analyze`, { revision })
export const reviewEvent = (recordId: string, revision: number, event: TimelineEvent, status: TimelineEvent['status'], content: Partial<EventInput> = {}) =>
  send<TimelineState>('PUT', `${timeline(recordId)}/events/${event.id}`, {
    revision, status, title: event.title, description: event.description, date_kind: event.date_kind,
    event_date: event.event_date, approximate_date: event.approximate_date, ...content })
export const addEvent = (recordId: string, revision: number, input: EventInput) => send<TimelineState>('POST', `${timeline(recordId)}/events`, { revision, ...input })
export const deleteEvent = (recordId: string, revision: number, eventId: string) =>
  send<TimelineState>('DELETE', `${timeline(recordId)}/events/${eventId}?revision=${revision}`)
export const settleReviewItem = (recordId: string, revision: number, item: ReviewItem, status: ReviewItem['status']) =>
  send<TimelineState>('PUT', `${timeline(recordId)}/review-items/${item.id}`, { revision, status })
