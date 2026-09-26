import { Loading } from './components/PageTitle'
import { ToastProvider } from './components/Toast'
import { ExpiredProvider } from './hooks/useFailure'
import { useRoute } from './router'
import type { User } from './types'
import type { DemoView } from './api/session'
import { Login } from './shell/Login'
import { Shell } from './shell/Shell'
import { useSession } from './shell/useSession'
import { useShellData } from './shell/useShellData'

function SignedIn({ user, demo, onDemo, onLogout }: { user: User; demo: boolean; onDemo: (view: DemoView) => void; onLogout: () => void }) {
  const route = useRoute()
  const data = useShellData(route, user)
  return <Shell route={route} user={user} demo={demo} onDemo={onDemo} onLogout={onLogout} data={data} />
}

export function App() {
  const session = useSession()
  if (session.loading) return <div style={{ padding: 40 }}><Loading text="Comprobando tu sesión…" /></div>
  if (!session.user) return <Login demo={session.demo} error={session.error} onLogin={user => session.signedIn(user)} onDemo={session.switchDemo} />
  return <ToastProvider><ExpiredProvider value={session.expired}>
    <SignedIn key={session.user.id} user={session.user} demo={session.demo} onDemo={session.switchDemo} onLogout={session.logout} />
  </ExpiredProvider></ToastProvider>
}
