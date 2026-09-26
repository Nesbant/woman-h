import { useCallback, useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { api, ApiError } from './api'
import type { Overview, RecordSummary, User } from './types'
import { navigate, NEW_RECORD, recordPath, useRoute } from './router'
import { RecordContext } from './recordContext'
import type { Route, Step } from './router'
import { progress, STEPS } from './progress'
import { initials } from './format'
import { CaseIcon, ExpiredProvider, InboxIcon, LockIcon, SquareIcon, ToastProvider } from './ui'
import { Home } from './views/Home'
import { Register } from './views/Register'
import { Understand } from './views/Understand'
import { Draft } from './views/Draft'
import { Sent, Share } from './views/Share'
import { Institutional } from './views/Institutional'


export function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [demo, setDemo] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    api<{ demo: boolean }>('/health').then(result => setDemo(result.demo)).catch(() => {})
    api<User>('/auth/me').then(setUser).catch(e => {
      if (!(e instanceof ApiError && e.status === 401)) setError(e.message)
    }).finally(() => setLoading(false))
  }, [])
  const expired = useCallback(() => { setUser(null); setError('Tu sesión terminó. Inicia sesión nuevamente.') }, [])
  async function switchDemo(viewAs: 'person' | 'organization') {
    setError('')
    try {
      setUser(await api<User>('/demo/switch', { method: 'POST', body: JSON.stringify({ view_as: viewAs }) }))
      navigate(viewAs === 'organization' ? 'institutional' : '')
    } catch (e) { setError((e as Error).message) }
  }
  async function logout() {
    try { await api('/auth/logout', { method: 'POST' }) } catch { /* the session ends locally anyway */ }
    setUser(null); navigate('')
  }
  if (loading) return <p role="status" className="loading" style={{ padding: 40 }}>Comprobando tu sesión…</p>
  if (!user) return <Login demo={demo} error={error} onLogin={value => { setError(''); setUser(value); navigate('') }} onDemo={switchDemo} />
  return <ToastProvider><ExpiredProvider value={expired}>
    <Shell key={user.id} user={user} demo={demo} onDemo={switchDemo} onLogout={logout} />
  </ExpiredProvider></ToastProvider>
}

function Login({ demo, error, onLogin, onDemo }: { demo: boolean; error: string; onLogin: (user: User) => void; onDemo: (as: 'person' | 'organization') => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setFailure('')
    try { onLogin(await api<User>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })) }
    catch (e) { setFailure((e as Error).message) }
    finally { setBusy(false) }
  }
  return <main className="login">
    <section>
      <div className="brand"><div className="brand-mark">V</div><div className="brand-name"><strong>VERA</strong><span>Documenta. Revisa. Decide.</span></div></div>
      <h1>Ordena lo que ocurrió.<br />Decide qué compartir.</h1>
      <p className="lead">Un espacio privado para documentar situaciones de hostigamiento laboral. La IA organiza tus fuentes; tú revisas y decides si algo llega a tu organización.</p>
      <div className="callout" style={{ marginTop: 24 }}><span className="icon"><LockIcon size={16} /></span>
        <span><strong>Tu organización no puede ver ni saber</strong> que tus registros existen hasta que decidas compartirlos.</span></div>
    </section>
    <section className="card xl raised">
      <form onSubmit={submit}>
        <h2>Inicia sesión</h2>
        <label className="field"><span>Correo electrónico</span><input className="input" type="email" autoComplete="username" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label className="field"><span>Contraseña</span><input className="input" type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={e => setPassword(e.target.value)} /></label>
        {(failure || error) && <p role="alert" className="error">{failure || error}</p>}
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Ingresando…' : 'Ingresar a mi espacio'}</button>
        {demo && <>
          <p className="small" style={{ marginTop: 8 }}>Demostración · datos sintéticos</p>
          <div className="demo-quick">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onDemo('person')}>Entrar como persona</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onDemo('organization')}>Entrar como organización</button>
          </div>
        </>}
      </form>
    </section>
  </main>
}

const DEMO_PERSON = 'maria@example.test', DEMO_ORGANIZATION = 'lucia@example.test'
const CRUMBS: Record<Step | 'enviado', string> = { registrar: 'Registrar', entender: 'Entender', preparar: 'Preparar reporte', compartir: 'Revisar y compartir', enviado: 'Caso enviado' }

function Shell({ user, demo, onDemo, onLogout }: { user: User; demo: boolean; onDemo: (as: 'person' | 'organization') => void; onLogout: () => void }) {
  const route = useRoute()
  const membership = user.memberships[0]
  const isInst = route.name === 'institutional'
  const [latest, setLatest] = useState<RecordSummary | null>(null)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [tick, setTick] = useState(0)
  const [caseCount, setCaseCount] = useState<number | null>(null)
  const refresh = useCallback(() => setTick(v => v + 1), [])
  const recordId = route.name === 'record' ? route.recordId : latest?.id
  useEffect(() => {
    if (isInst) return
    api<RecordSummary[]>('/records').then(items => setLatest([...items].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0] ?? null)).catch(() => {})
  }, [isInst, tick])
  useEffect(() => {
    if (!recordId || recordId === NEW_RECORD || isInst) { setOverview(null); return }
    let active = true
    api<Overview>(`/records/${recordId}/overview`).then(value => { if (active) setOverview(value) }).catch(() => { if (active) setOverview(null) })
    return () => { active = false }
  }, [recordId, isInst, tick, route])
  useEffect(() => {
    if (!isInst || !membership) return
    api<{ counts: { received: number } }>(`/institutions/${membership.institution_id}/cases`).then(v => setCaseCount(v.counts.received)).catch(() => {})
  }, [isInst, membership, tick])

  const { done } = progress(overview)
  const activeStep = route.name === 'record' ? (route.step === 'enviado' ? 'compartir' : route.step) : null
  const title = route.name === 'home' ? ['Mi espacio', '/ Situaciones'] : route.name === 'institutional' ? ['VERA Institutional', '/ Casos recibidos']
    : [CRUMBS[route.step], `/ ${overview?.record.title ?? (route.recordId === NEW_RECORD ? 'Nueva situación' : 'Situación')}`]
  const goStep = (step: Step) => { if (recordId && recordId !== NEW_RECORD) navigate(recordPath(recordId, step)); else if (step === 'registrar') navigate(recordPath(NEW_RECORD, 'registrar')) }

  return <RecordContext.Provider value={{ overview, refresh }}>
    <div className="layout">
      <aside className="sidebar" aria-label="Navegación">
        <div className="brand"><div className="brand-mark">V</div><div className="brand-name"><strong>VERA</strong><span>Documenta. Revisa. Decide.</span></div></div>
        {!isInst ? <>
          <div className="space-note"><div className="space-note-title"><LockIcon />Espacio privado · Solo tú</div><p>Tu organización no puede ver ni saber que estos registros existen.</p></div>
          <nav className="side-nav">
            <button className="side-link" aria-current={route.name === 'home' ? 'page' : undefined} onClick={() => navigate('')}><span className="side-icon"><SquareIcon /></span>Mi espacio</button>
            {recordId && <>
              <div className="side-label">{overview?.record.title ?? 'Nueva situación'}</div>
              {STEPS.map((step, i) => <button key={step.id} className="side-link" aria-current={activeStep === step.id ? 'page' : undefined} onClick={() => goStep(step.id)}>
                <span className={`step-dot${done[step.id] ? ' done' : activeStep === step.id ? ' active' : ''}`}>{done[step.id] ? '✓' : i + 1}</span><span style={{ flex: 1 }}>{step.label}</span>
              </button>)}
            </>}
          </nav>
        </> : <>
          <div className="space-note inst"><div className="space-note-title"><CaseIcon />VERA Institutional</div><p>{membership?.name} · Solo casos enviados explícitamente.</p></div>
          <nav className="side-nav"><button className="side-link inst" aria-current="page"><span className="side-icon"><InboxIcon /></span><span style={{ flex: 1 }}>Casos recibidos</span><span className="count">{caseCount ?? ''}</span></button></nav>
        </>}
        <div className="side-footer">
          {/* Own spaces first: the demo switch changes account, it must never be the only way into your institution. */}
          {membership && !(demo && user.email === DEMO_ORGANIZATION) && <>
            <span className="side-label">Tu espacio</span>
            <div className="segmented">
              <button aria-pressed={!isInst} onClick={() => navigate('')}>Privado</button>
              <button className="inst" aria-pressed={isInst} onClick={() => navigate('institutional')}>Institutional</button>
            </div>
          </>}
          {demo && <>
            <span className="side-label">Demo · ver como</span>
            <div className="segmented">
              <button aria-pressed={user.email === DEMO_PERSON} onClick={() => onDemo('person')}>Persona</button>
              <button className="inst" aria-pressed={user.email === DEMO_ORGANIZATION && isInst} onClick={() => onDemo('organization')}>Organización</button>
            </div>
          </>}
          <button className="btn btn-ghost btn-sm" onClick={onLogout}>Cerrar sesión</button>
          {demo && <small>Demostración · datos sintéticos</small>}
        </div>
      </aside>
      <div className="content">
        <header className="topbar">
          <div className="crumbs"><strong>{title[0]}</strong><span>{title[1]}</span></div>
          <div className="topbar-right">
            <span className={`chip${isInst ? ' inst' : ''}`}>{isInst ? 'Institutional · RR. HH.' : 'Privado · Solo tú'}</span>
            <div className={`avatar${isInst ? ' inst' : ''}`} title={user.name} aria-label={user.name}>{initials(user.name)}</div>
          </div>
        </header>
        <main className="main">
          {activeStep && route.name === 'record' && route.step !== 'enviado' && <Stepper active={activeStep} done={done} onGo={goStep} />}
          <View route={route} user={user} demo={demo} onDemo={onDemo} />
        </main>
      </div>
    </div>
  </RecordContext.Provider>
}

function Stepper({ active, done, onGo }: { active: Step; done: Record<Step, boolean>; onGo: (step: Step) => void }) {
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

function View({ route, user, demo, onDemo }: { route: Route; user: User; demo: boolean; onDemo: (as: 'person' | 'organization') => void }): ReactNode {
  if (route.name === 'institutional') {
    const membership = user.memberships[0]
    return membership ? <Institutional key={membership.institution_id} institutionId={membership.institution_id} name={membership.name} userId={user.id} />
      : <div className="callout"><span>Tu cuenta no pertenece a ninguna organización. Los espacios privados de otras personas nunca son visibles.</span></div>
  }
  if (route.name === 'home') return <Home user={user} />
  const { recordId, step } = route
  if (step === 'registrar') return <Register key={recordId} recordId={recordId} />
  if (recordId === NEW_RECORD) return <div className="callout"><span>Primero cuenta lo ocurrido o agrega evidencia.</span>
    <button className="btn btn-primary btn-sm" onClick={() => navigate(recordPath(NEW_RECORD, 'registrar'))}>Registrar</button></div>
  if (step === 'entender') return <Understand key={recordId} recordId={recordId} />
  if (step === 'preparar') return <Draft key={recordId} recordId={recordId} />
  if (step === 'compartir') return <Share key={recordId} recordId={recordId} />
  return <Sent key={recordId} recordId={recordId} demo={demo} onDemo={onDemo} />
}
