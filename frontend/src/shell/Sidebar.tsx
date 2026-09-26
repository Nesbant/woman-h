import type { DemoView } from '../api/session'
import type { Overview, User } from '../types'
import { conversationPath, navigate } from '../router'
import type { Step } from '../router'
import { CaseIcon, InboxIcon, LockIcon, PersonIcon, SquareIcon } from '../components/icons'
import { Brand } from './Brand'

export const DEMO_PERSON = 'maria@example.test'
export const DEMO_ORGANIZATION = 'lucia@example.test'

type Common = { user: User; demo: boolean; onDemo: (view: DemoView) => void; onLogout: () => void }
type PrivateProps = { page: 'home' | 'profile' | 'conversation' | Step | null; recordId: string | undefined; conversationRecordId?: string; overview: Overview | null; onStep: (step: Step) => void }

const REVIEW_LINKS: { step: Step; label: string }[] = [
  { step: 'registrar', label: 'Lo registrado' },
  { step: 'entender', label: 'Eventos' },
  { step: 'preparar', label: 'Borrador' },
  { step: 'compartir', label: 'Compartir' },
]

function PrivateNav({ page, recordId, conversationRecordId, overview, onStep }: PrivateProps) {
  return <>
    <div className="space-note"><div className="space-note-title"><LockIcon />Espacio privado · Solo tú</div><p>Tu organización no puede ver ni saber que estos registros existen.</p></div>
    <nav className="side-nav">
      <button className="side-link" aria-current={page === 'conversation' ? 'page' : undefined} onClick={() => navigate(conversationPath(conversationRecordId))}><span className="side-icon"><SquareIcon /></span>Conversación</button>
      <button className="side-link" aria-current={page === 'home' ? 'page' : undefined} onClick={() => navigate('')}><span className="side-icon"><SquareIcon /></span>Mi espacio</button>
      {recordId && <>
        <div className="side-label">Revisar · {overview?.record.title ?? 'Nueva situación'}</div>
        {REVIEW_LINKS.map(({ step, label }) => <button key={step} className="side-link" aria-current={page === step ? 'page' : undefined} onClick={() => onStep(step)}>
          <span style={{ flex: 1 }}>{label}</span>
        </button>)}
      </>}
      <button className="side-link" aria-current={page === 'profile' ? 'page' : undefined} onClick={() => navigate('perfil')}><span className="side-icon"><PersonIcon /></span>Mi perfil</button>
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

export function Sidebar(props: Common & PrivateProps & { institutional: boolean; caseCount: number | null }) {
  return <aside className="sidebar" aria-label="Navegación">
    <Brand />
    {props.institutional ? <InstitutionalNav user={props.user} caseCount={props.caseCount} /> : <PrivateNav {...props} />}
    <div className="side-footer">
      <SpaceSwitch {...props} />
      <button className="btn btn-ghost btn-sm" onClick={props.onLogout}>Cerrar sesión</button>
      {props.demo && <small>Demostración · datos sintéticos</small>}
    </div>
  </aside>
}
