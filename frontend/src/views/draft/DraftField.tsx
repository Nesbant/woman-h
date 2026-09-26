import type { ReactNode } from 'react'
import type { FieldValue } from '../../types'

export const MISSING = 'Pendiente de confirmar'
export const typed = (value: string): FieldValue => ({ value, origin: 'person' })

export function DraftField({ id, label, field, onChange, readOnly }: { id: string; label: string; field: FieldValue; onChange: (value: string) => void; readOnly?: boolean }) {
  return <label className="field" htmlFor={id}>
    <span>{label}{field.origin === 'detected' && <em style={{ fontStyle: 'normal', color: 'var(--warn)' }}>Detectado por VERA</em>}</span>
    <input id={id} className={`input${field.value ? '' : ' missing'}`} maxLength={2000} value={field.value ?? ''} placeholder={MISSING} readOnly={readOnly}
      onChange={e => onChange(e.target.value)} />
  </label>
}

export function Section({ id, roman, title, aside, footer, children }: { id: string; roman: string; title: string; aside?: ReactNode; footer?: string; children: ReactNode }) {
  return <section className="panel" aria-labelledby={id}>
    <div className="panel-head"><span className="roman">{roman}</span><h3 id={id}>{title}</h3>{aside}</div>
    {children}
    {footer && <div className="panel-foot">{footer}</div>}
  </section>
}
