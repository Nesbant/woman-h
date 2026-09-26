import type { CaseDetail, StepStatus } from '../../types'
import { NEXT_STEP, STEP_STATES } from './labels'

export function Checklist({ steps, busy, onChange }: { steps: CaseDetail['procedure']; busy: boolean; onChange: (step: string, status: StepStatus) => void }) {
  const done = steps.filter(step => step.status === 'done').length
  return <section className="case-section">
    <div className="aside-title"><h3>Procedimiento</h3><span className="hint">{done} de {steps.length} completados</span></div>
    {steps.map(step => {
      const [label, icon] = STEP_STATES[step.status]
      return <div className="check-row" key={step.key}>
        <span className={`check-icon ${step.status}-state`} style={{ border: 0 }} aria-hidden="true">{icon}</span>
        <div><strong>{step.label}</strong><small>{step.description}</small></div>
        {step.reference && <span className="ref">{step.reference}</span>}
        <button className={`state-btn ${step.status}-state`} disabled={busy} aria-label={`${step.label}: ${label}. Cambiar estado`}
          title={step.updated_by?.name ? `Actualizado por ${step.updated_by.name}` : undefined} onClick={() => onChange(step.key, NEXT_STEP[step.status])}>{label}</button>
      </div>
    })}
    <span className="small">Los plazos son referenciales. VERA no calcula días hábiles ni emite decisiones.</span>
  </section>
}
