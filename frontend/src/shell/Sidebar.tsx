import type { RefObject } from 'react'
import type { DemoView } from '../api/session'
import type { Overview, User } from '../types'
import { navigate } from '../router'
import type { Step } from '../router'
import { STEPS } from '../progress'
import { CaseIcon, InboxIcon, LockIcon, PersonIcon, SquareIcon } from '../components/icons'
import { Brand } from './Brand'

export const DEMO_PERSON = 'maria@example.test'
export const DEMO_ORGANIZATION = 'lucia@example.test'

type Common = { user: User; demo: boolean; onDemo: (view: DemoView) => void; onLogout: () => void }
type PrivateProps = { page: 'home' | 'profile' | Step | null; recordId: string | undefined; overview: Overview | null; done: Record<Step, boolean>; onStep: (step: Step) => void }

function PrivateNav({ page, recordId, overview, done, onStep }: PrivateProps) {
  return <>
    <div className="space-note"><div className="space-note-title"><LockIcon />Espacio privado · Solo tú</div><p>Tu organización no puede ver ni saber que estos registros existen.</p></div>
    <nav className="side-nav">
      <button className="side-link" aria-current={page === 'home' ? 'page' : undefined} onClick={() => navigate('')}><span className="side-icon"><SquareIcon /></span>Mi espacio</button>
      <button className="side-link" aria-current={page === 'profile' ? 'page' : undefined} onClick={() => navigate('perfil')}><span className="side-icon"><PersonIcon /></span>Mi perfil</button>
      {recordId && <>
        <div className="side-label">{overview?.record.title ?? 'Nueva situación'}</div>
        {STEPS.map((step, i) => <button key={step.id} className="side-link" aria-current={page === step.id ? 'page' : undefined} onClick={() => onStep(step.id)}>
          <span className={`step-dot${done[step.id] ? ' done' : page === step.id ? ' active' : ''}`}>{done[step.id] ? '✓' : i + 1}</span><span style={{ flex: 1 }}>{step.label}</span>
        </button>)}
      </>}
    </nav>
  </>
}

function InstitutionalNav({ user, caseCount }: { user: User; caseCount: number | null }) {
  return <>
    <div className="space-note inst"><div className="space-note-title"><CaseIcon />VERA Institutional</div><p>{user.memberships[0]?.name} · Solo casos enviados explícitamente.</p></div>
    <nav className="side-nav"><button className="side-link inst" aria-current="page"><span className="side-icon"><InboxIcon /></span><span style={{ flex: 1 }}>Casos recibidos</span><span className="count">{caseCount ?? ''}</span></button></nav>
  </>
}

function SpaceSwitch({ user, demo, institutional, onDemo }: Common & { institutional: boolean }) {
  // Own spaces first: the demo switch changes account, so it must never be the only way into your institution.
  const ownSwitch = user.memberships.length > 0 && !(demo && user.email === DEMO_ORGANIZATION)
  return <>
    {ownSwitch && <>
      <span className="side-label">Tu espacio</span>
      <div className="segmented">
        <button aria-pressed={!institutional} onClick={() => navigate('')}>Privado</button>
        <button className="inst" aria-pressed={institutional} onClick={() => navigate('institutional')}>Institutional</button>
      </div>
    </>}
    {demo && <>
      <span className="side-label">Demo · ver como</span>
      <div className="segmented">
        <button aria-pressed={user.email === DEMO_PERSON} onClick={() => onDemo('person')}>Persona</button>
        <button className="inst" aria-pressed={user.email === DEMO_ORGANIZATION && institutional} onClick={() => onDemo('organization')}>Organización</button>
      </div>
    </>}
  </>
}

type DrawerProps = { open: boolean; panelRef: RefObject<HTMLElement | null> }

export function Sidebar(props: Common & PrivateProps & { institutional: boolean; caseCount: number | null } & DrawerProps) {
  return <aside ref={props.panelRef} id="mobile-sidebar" tabIndex={-1} className={`sidebar${props.open ? ' open' : ''}`} aria-label="Navegación">
    <Brand />
    {props.institutional ? <InstitutionalNav user={props.user} caseCount={props.caseCount} /> : <PrivateNav {...props} />}
    <div className="side-footer">
      <SpaceSwitch {...props} />
      <button className="btn btn-ghost btn-sm" onClick={props.onLogout}>Cerrar sesión</button>
      {props.demo && <small>Demostración · datos sintéticos</small>}
    </div>
  </aside>
}
