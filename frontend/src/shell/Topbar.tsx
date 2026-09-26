import { initials } from '../format'
import type { User } from '../types'

export function Topbar({ title, subtitle, institutional, user }: { title: string; subtitle: string; institutional: boolean; user: User }) {
  return <header className="topbar">
    <div className="crumbs"><strong>{title}</strong><span>{subtitle}</span></div>
    <div className="topbar-right">
      <span className={`chip${institutional ? ' inst' : ''}`}>{institutional ? 'Institutional · RR. HH.' : 'Privado · Solo tú'}</span>
      <a href="#/perfil" className={`avatar${institutional ? ' inst' : ''}`} title={`${user.name} · Mi perfil`} aria-label={`${user.name}, abrir mi perfil`}>{initials(user.name)}</a>
    </div>
  </header>
}
