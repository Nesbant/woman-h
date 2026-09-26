import { useState } from 'react'
import type { FormEvent } from 'react'
import { login } from '../api/session'
import type { DemoView } from '../api/session'
import type { User } from '../types'
import { LockIcon } from '../components/icons'
import { ErrorAlert } from '../components/PageTitle'
import { AboutVera } from '../components/AboutVera'
import { Brand } from './Brand'

function DemoAccess({ onDemo }: { onDemo: (view: DemoView) => void }) {
  return <div className="demo-access">
    <p className="small"><strong>Demostración con datos sintéticos.</strong> Entra sin contraseña para recorrer VERA como persona o como organización.</p>
    <div className="demo-quick">
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => onDemo('person')}>Entrar como persona</button>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => onDemo('organization')}>Entrar como organización</button>
    </div>
  </div>
}

function LoginForm({ demo, error, onLogin, onDemo }: { demo: boolean; error: string; onLogin: (user: User) => void; onDemo: (view: DemoView) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setFailure('')
    try { onLogin(await login(email, password)) }
    catch (e) { setFailure((e as Error).message) }
    finally { setBusy(false) }
  }
  return <form onSubmit={submit}>
    {demo && <DemoAccess onDemo={onDemo} />}
    <span className="login-form-eyebrow">Un espacio para ti</span>
    <h2>Bienvenida de nuevo</h2>
    <p className="login-form-lead">Ingresa a tu espacio para continuar a tu ritmo.</p>
    <label className="field"><span>Correo electrónico</span><input className="input" type="email" autoComplete="username" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} /></label>
    <label className="field"><span>Contraseña</span><input className="input" type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={e => setPassword(e.target.value)} /></label>
    <ErrorAlert message={failure || error} />
    <button className="btn btn-primary" disabled={busy}>{busy ? 'Ingresando…' : 'Ingresar a mi espacio'}</button>
  </form>
}

export function Login(props: { demo: boolean; error: string; onLogin: (user: User) => void; onDemo: (view: DemoView) => void }) {
  return <main className="login-page"><div className="login">
    <section className="login-intro">
      <Brand />
      <div className="login-intro-copy">
        <span className="login-handwritten">Un espacio para volver a ti</span>
        <h1><span>No tienes que</span>{' '}<span>atravesarlo todo</span>{' '}<span>a solas.</span></h1>
        <p className="lead">Un espacio para conversar, ordenar lo que ocurrió y revisar tus registros a tu propio ritmo.</p>
      </div>
      <div className="login-companion"><img src="/images/vera-companion-sitting.jpeg" alt="Ilustración de VERA, un perrito lavanda" /><span>Puedes tomarte tu tiempo. Empieza cuando quieras.</span></div>
    </section>
    <section className="card xl raised login-card"><LoginForm {...props} />
      <div className="login-privacy"><LockIcon size={18} /><p><strong>Tu espacio es privado.</strong> Tu organización no puede ver ni saber que tus registros existen hasta que decidas compartirlos.</p></div>
    </section>
  </div><AboutVera /></main>
}
