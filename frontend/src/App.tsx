import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { api, ApiError } from './api'
import type { User } from './api'
import { clearStartDraft, navigate, PrivateWorkspace, useRoute } from './Home'
import { Institutional } from './Institutional'

type Context = { name: string; role?: 'admin' | 'reviewer'; case_access?: boolean }
const roles = { admin: 'Administración institucional', reviewer: 'Revisión institucional' }

export function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [space, setSpace] = useState('private')
  const [context, setContext] = useState<Context | null>(null)
  const [demo, setDemo] = useState(false)
  const route = useRoute()
  const sessionExpired = useCallback(() => {
    if (user) clearStartDraft(user.id)
    setUser(null); setContext(null); setError('Tu sesión terminó. Inicia sesión nuevamente.'); setPassword('')
  }, [user])
  useEffect(() => {
    api<{demo: boolean}>('/health').then(result => setDemo(result.demo)).catch(() => {})
    api<User>('/auth/me').then(setUser).catch(e => {
      if (!(e instanceof ApiError && e.status === 401)) setError(e.message)
    }).finally(() => setLoading(false))
  }, [])
  useEffect(() => {
    setContext(null)
    if (!user) return
    let active = true
    setError('')
    const path = space === 'private' ? `/private/${user.id}/context` : `/institutions/${space}/context`
    api<Context>(path).then(data => { if (active) setContext(data) }).catch(e => {
      if (!active) return
      setError(e.message)
      if (e instanceof ApiError && e.status === 401) setUser(null)
    })
    return () => { active = false }
  }, [user, space])
  async function login(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true)
    try {
      const result = await api<User>('/auth/login', { method: 'POST', body: JSON.stringify({email, password}) })
      setContext(null); setSpace('private'); setUser(result); setPassword(''); navigate('inicio')
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  async function logout() {
    setBusy(true); setError('')
    try { await api('/auth/logout', { method: 'POST' }); if (user) clearStartDraft(user.id); setUser(null); setContext(null); setPassword(''); setEmail(''); navigate('inicio') }
    catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  return <div className={`shell${user ? ' authenticated' : ''}`}>
    <header><a className="brand" href="#/inicio" onClick={() => setSpace('private')} aria-label="VERA, inicio">VERA<span>Un espacio para ti</span></a>
      {user && <div className="user-menu"><span>{user.name}</span><button className="secondary" disabled={busy} onClick={logout}>Cerrar sesión</button></div>}</header>
    {user && <nav className="app-nav" aria-label="Navegación principal">
      <a href="#/inicio" aria-current={space === 'private' && !route.startsWith('registros') ? 'page' : undefined} onClick={() => setSpace('private')}>Inicio</a>
      <a href="#/registros" aria-current={space === 'private' && route.startsWith('registros') ? 'page' : undefined} onClick={() => setSpace('private')}>Mis registros</a>
      {user.memberships.map(m => <button key={m.institution_id} className="secondary institutional-switch" aria-pressed={space === m.institution_id} onClick={() => setSpace(m.institution_id)}>VERA Institutional · {m.name}</button>)}
    </nav>}
    {demo && <div className="demo">Entorno de demostración · Solo datos ficticios</div>}
    <main>
      {loading ? <p role="status">Comprobando tu sesión…</p> : !user ? <div className="welcome">
        <section><p className="eyebrow">A TU RITMO, BAJO TU CONTROL</p><h1>Tu historia.<br/>Tu espacio.</h1>
          <p className="intro">VERA está pensada para documentar situaciones de acoso u hostigamiento y decidir qué información compartir.</p>
          <div className="principle"><span aria-hidden="true">01</span><p><strong>Un espacio personal privado</strong>La institución no accede automáticamente a tu información.</p></div>
          <div className="principle"><span aria-hidden="true">02</span><p><strong>Tú decides qué enviar</strong>El espacio institucional contendrá únicamente lo que envíes explícitamente.</p></div>
        </section>
        <section className="card"><p className="eyebrow">BIENVENIDA A VERA</p><h2>Inicia sesión</h2><p>Accede con tu cuenta de demostración.</p>
          <form onSubmit={login}><label htmlFor="email">Correo electrónico</label><input id="email" type="email" autoComplete="username" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} />
            <label htmlFor="password">Contraseña</label><input id="password" type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={e => setPassword(e.target.value)} />
            {error && <p role="alert" className="error">{error}</p>}<button disabled={busy}>{busy ? 'Ingresando…' : 'Ingresar a mi espacio'}</button></form>
          <p className="small">Tus registros son privados hasta que decidas compartirlos.</p>
        </section>
      </div> : <>
        {error && <p role="alert" className="error">{error}</p>}
        {context && space !== 'private' ? <>
          <p className="small role-line">{roles[context.role!]} · La pertenencia a una organización no concede acceso a espacios privados.</p>
          <Institutional key={space} institutionId={space} name={context.name} userId={user.id} onExpired={sessionExpired} /></>
          : !context && !error && <p role="status">Preparando tu espacio privado…</p>}
        {context && space === 'private' && <PrivateWorkspace key={user.id} userId={user.id} route={route} onExpired={sessionExpired} />}
      </>}
    </main><footer>VERA · Tú mantienes el control de lo que compartes.</footer>
  </div>
}
