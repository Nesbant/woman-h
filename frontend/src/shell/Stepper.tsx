import type { Step } from '../router'
import { STEPS } from '../progress'

export function Stepper({ active, done, onGo }: { active: Step; done: Record<Step, boolean>; onGo: (step: Step) => void }) {
  return <nav className="stepper" aria-label="Pasos de la situación">{STEPS.map((step, i) => {
    const state = done[step.id] ? 'done' : active === step.id ? 'active' : ''
    return <div className="stepper-item" key={step.id}>
      {i > 0 && <span className={`stepper-line${state ? ' on' : ''}`} />}
      <button className={`stepper-btn ${state}`} aria-current={active === step.id ? 'step' : undefined} onClick={() => onGo(step.id)}>
        <span className="step-dot">{done[step.id] ? '✓' : i + 1}</span>{step.short}
      </button>
    </div>
  })}</nav>
}
