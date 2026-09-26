import { LockIcon } from '../../components/icons'

const VISIBILITY: [string, boolean][] = [['Tú', true], ['Tu organización', false], ['RR. HH.', false], ['Legal', false], ['Admin de la organización', false]]

export function PrivacyHero() {
  return <section className="privacy-hero" aria-label="Quién puede ver tus registros">
    <div className="privacy-hero-text">
      <div className="privacy-hero-icon"><LockIcon size={20} width={1.5} /></div>
      <div><strong>Tú decides qué compartir.</strong><p>Guardar una situación no significa reportarla. Tú decides qué compartir con tu organización.</p></div>
    </div>
    <details className="visibility-details"><summary>¿Quién puede ver mis registros?</summary>
      <div className="visibility">{VISIBILITY.map(([who, ok]) => <div key={who}><span>{who}</span><span className={ok ? 'yes' : ''}>{ok ? '✓ Puede verlo' : '✕ No puede verlo'}</span></div>)}</div>
    </details>
  </section>
}
