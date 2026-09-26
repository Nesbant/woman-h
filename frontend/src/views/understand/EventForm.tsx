import { useState } from 'react'
import type { FormEvent } from 'react'
import type { EventInput } from '../../api/timeline'
import type { DateKind } from '../../types'

const EMPTY: EventInput = { title: '', description: '', date_kind: 'unknown', event_date: null, approximate_date: null }

/** Title, date precision and description of an event. Dates follow the same exact/approximate/unknown rule as relatos. */
export function EventForm({ initial = EMPTY, busy, submitLabel, idPrefix, onSubmit, onCancel }: {
  initial?: EventInput; busy: boolean; submitLabel: string; idPrefix: string; onSubmit: (input: EventInput) => void; onCancel: () => void }) {
  const [value, setValue] = useState<EventInput>(initial)
  const set = (patch: Partial<EventInput>) => setValue(v => ({ ...v, ...patch }))
  const setKind = (kind: DateKind) => set({ date_kind: kind, event_date: kind === 'exact' ? value.event_date : null, approximate_date: kind === 'approximate' ? value.approximate_date : null })
  const valid = value.title.trim() && value.description.trim() && (value.date_kind !== 'exact' || value.event_date) && (value.date_kind !== 'approximate' || value.approximate_date?.trim())
  function submit(event: FormEvent) {
    event.preventDefault()
    if (valid) onSubmit({ ...value, title: value.title.trim(), description: value.description.trim(), approximate_date: value.approximate_date?.trim() || null })
  }
  return <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
    <label className="field"><span>Título</span><input id={`${idPrefix}-title`} className="input" maxLength={200} value={value.title} onChange={e => set({ title: e.target.value })} /></label>
    <label className="field"><span>Qué ocurrió, con tus palabras</span>
      <textarea id={`${idPrefix}-description`} className="edit-area" rows={3} maxLength={2000} value={value.description} onChange={e => set({ description: e.target.value })} /></label>
    <div className="field-grid">
      <label className="field"><span>Precisión de la fecha</span>
        <select className="input" value={value.date_kind} onChange={e => setKind(e.target.value as DateKind)}>
          <option value="exact">Fecha exacta</option><option value="approximate">Fecha aproximada</option><option value="unknown">No la sé</option></select></label>
      {value.date_kind === 'exact' && <label className="field"><span>Fecha</span><input className="input" type="date" value={value.event_date ?? ''} onChange={e => set({ event_date: e.target.value || null })} /></label>}
      {value.date_kind === 'approximate' && <label className="field"><span>Referencia aproximada</span>
        <input className="input" maxLength={200} placeholder="mediados de septiembre" value={value.approximate_date ?? ''} onChange={e => set({ approximate_date: e.target.value })} /></label>}
    </div>
    <div className="event-actions" style={{ borderTop: 0, paddingTop: 0 }}>
      <button type="button" className="btn btn-ghost btn-md" onClick={onCancel} disabled={busy}>Cancelar</button>
      <button className="btn btn-primary btn-md" disabled={busy || !valid}>{submitLabel}</button>
    </div>
  </form>
}
