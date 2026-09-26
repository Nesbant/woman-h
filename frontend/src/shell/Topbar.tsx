import { initials } from '../format'
import type { User } from '../types'
import { MenuIcon } from '../components/icons'
import type { useMobileNav } from './useMobileNav'

type Nav = ReturnType<typeof useMobileNav>

export function Topbar({ title, subtitle, institutional, user, nav }: { title: string; subtitle: string; institutional: boolean; user: User; nav: Nav }) {
  return <header className="topbar">
    <div className="topbar-left">
      <button ref={nav.buttonRef} type="button" className="menu-btn" aria-expanded={nav.open} aria-controls="mobile-sidebar"
        aria-label={nav.open ? 'Cerrar menú' : 'Abrir menú'} onClick={nav.toggle}><MenuIcon /></button>
      <div className="crumbs"><strong>{title}</strong><span>{subtitle}</span></div>
    </div>
    <div className="topbar-right">
      <span className={`chip${institutional ? ' inst' : ''}`}>{institutional ? 'Institutional · RR. HH.' : 'Privado · Solo tú'}</span>
      <a href="#/perfil" className={`avatar${institutional ? ' inst' : ''}`} title={`${user.name} · Mi perfil`} aria-label={`${user.name}, abrir mi perfil`}>{initials(user.name)}</a>
    </div>
  </header>
}
