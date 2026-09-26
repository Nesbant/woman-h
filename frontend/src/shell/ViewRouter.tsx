import type { DemoView } from '../api/session'
import type { User } from '../types'
import { navigate, NEW_RECORD, recordPath } from '../router'
import type { Route } from '../router'
import { Home } from '../views/home/Home'
import { Register } from '../views/register/Register'
import { Understand } from '../views/understand/Understand'
import { Draft } from '../views/draft/Draft'
import { Share } from '../views/share/Share'
import { Sent } from '../views/share/Sent'
import { Institutional } from '../views/institutional/Institutional'
import { ProfileView } from '../views/profile/Profile'

function NotMember() {
  return <div className="callout"><span>Tu cuenta no pertenece a ninguna organización. Los espacios privados de otras personas nunca son visibles.</span></div>
}

function StartFirst() {
  return <div className="callout"><span>Primero cuenta lo ocurrido o agrega evidencia.</span>
    <button className="btn btn-primary btn-sm" onClick={() => navigate(recordPath(NEW_RECORD, 'registrar'))}>Registrar</button></div>
}

function RecordView({ recordId, step, demo, onDemo }: { recordId: string; step: string; demo: boolean; onDemo: (view: DemoView) => void }) {
  if (step === 'registrar') return <Register key={recordId} recordId={recordId} />
  if (recordId === NEW_RECORD) return <StartFirst />
  if (step === 'entender') return <Understand key={recordId} recordId={recordId} />
  if (step === 'preparar') return <Draft key={recordId} recordId={recordId} />
  if (step === 'compartir') return <Share key={recordId} recordId={recordId} />
  return <Sent key={recordId} recordId={recordId} demo={demo} onDemo={onDemo} />
}

export function ViewRouter({ route, user, demo, onDemo }: { route: Route; user: User; demo: boolean; onDemo: (view: DemoView) => void }) {
  const membership = user.memberships[0]
  switch (route.name) {
    case 'institutional':
      return membership ? <Institutional key={membership.institution_id} institutionId={membership.institution_id} name={membership.name} userId={user.id} /> : <NotMember />
    case 'profile': return <ProfileView />
    case 'home': return <Home user={user} />
    case 'record': return <RecordView recordId={route.recordId} step={route.step} demo={demo} onDemo={onDemo} />
  }
}
