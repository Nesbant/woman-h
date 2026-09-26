import { useState } from 'react'
import type { FormEvent } from 'react'
import { login } from '../api/session'
import type { DemoView } from '../api/session'
import type { User } from '../types'
import { LockIcon } from '../components/icons'
import { ErrorAlert } from '../components/PageTitle'
import { Brand } from './Brand'

function DemoAccess({ onDemo }: { onDemo: (view: DemoView) => void }) {
  return <>
    <p className="small" style={{ marginTop: 8 }}>Demostración · datos sintéticos</p>
    <div className="demo-quick">
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => onDemo('person')}>Entrar como persona</button>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => onDemo('organization')}>Entrar como organización</button>
    </div>
  </>
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
    <h2>Inicia sesión</h2>
    <label className="field"><span>Correo electrónico</span><input className="input" type="email" autoComplete="username" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} /></label>
    <label className="field"><span>Contraseña</span><input className="input" type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={e => setPassword(e.target.value)} /></label>
    <ErrorAlert message={failure || error} />
    <button className="btn btn-primary" disabled={busy}>{busy ? 'Ingresando…' : 'Ingresar a mi espacio'}</button>
    {demo && <DemoAccess onDemo={onDemo} />}
  </form>
}

export function Login(props: { demo: boolean; error: string; onLogin: (user: User) => void; onDemo: (view: DemoView) => void }) {
  return <main className="login">
    <section>
      <Brand />
      <h1>Ordena lo que ocurrió.<br />Decide qué compartir.</h1>
      <p className="lead">Un espacio privado para documentar situaciones de hostigamiento laboral. La IA organiza tus fuentes; tú revisas y decides si algo llega a tu organización.</p>
      <div className="callout" style={{ marginTop: 24 }}><span className="icon"><LockIcon size={16} /></span>
        <span><strong>Tu organización no puede ver ni saber</strong> que tus registros existen hasta que decidas compartirlos.</span></div>
    </section>
    <section className="card xl raised"><LoginForm {...props} /></section>
  </main>
}
