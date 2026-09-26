import { useEffect, useState } from 'react'
import { api } from '../api'
import type { Overview, RecordSummary, User } from '../types'
import { navigate, NEW_RECORD, recordPath } from '../router'
import { progress, STEPS } from '../progress'
import { firstName, plural, shortDate } from '../format'
import { LockIcon, PageTitle, useFailure } from '../ui'

const VISIBILITY: [string, boolean][] = [['Tú', true], ['Tu organización', false], ['RR. HH.', false], ['Legal', false], ['Admin de la organización', false]]
const GUIDE = [
  ['Agrega lo que tengas', 'Relatos, capturas, correos o documentos.'],
  ['VERA propone una estructura', 'Eventos y relaciones, siempre vinculados a sus fuentes.'],
  ['Tú revisas', 'Confirma, corrige o descarta antes de usar la información.'],
  ['Tú decides qué compartir', 'Solo lo autorizado pasa al espacio institucional.'],
]

export function Home({ user }: { user: User }) {
  const [items, setItems] = useState<Overview[] | null>(null)
  const [error, setError] = useState('')
  const fail = useFailure()
  useEffect(() => {
    let active = true
    api<RecordSummary[]>('/records').then(records => Promise.all(
      [...records].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).map(r => api<Overview>(`/records/${r.id}/overview`))
    )).then(value => { if (active) setItems(value) }).catch(e => { if (active) fail(e, setError) })
    return () => { active = false }
  }, [fail])
  const create = () => navigate(recordPath(NEW_RECORD, 'registrar'))
  return <>
    <PageTitle eyebrow="Espacio privado" title={`Hola, ${firstName(user.name)}`} lead="Ordena lo que ocurrió a tu ritmo. Guardar algo aquí no significa haberlo reportado.">
      <button className="btn btn-primary" onClick={create}>+ Registrar una situación</button>
    </PageTitle>
    <section className="privacy-hero" aria-label="Quién puede ver tus registros">
      <div className="privacy-hero-text">
        <div className="privacy-hero-icon"><LockIcon size={20} width={1.5} /></div>
        <div><strong>Esto todavía es tuyo.</strong><p>Tus registros permanecen privados hasta que decidas compartirlos. Tu organización no puede verlos, contarlos ni saber que existen.</p></div>
      </div>
      <div className="visibility">{VISIBILITY.map(([who, ok]) => <div key={who}><span>{who}</span><span className={ok ? 'yes' : ''}>{ok ? '✓ Puede verlo' : '✕ No puede verlo'}</span></div>)}</div>
    </section>
    <div className="two-col">
      <div className="col-main">
        <span className="eyebrow muted">Tus situaciones</span>
        {error && <p role="alert" className="error">{error}</p>}
        {!items ? !error && <p role="status" className="loading">Cargando tus situaciones…</p> : items.map(item => <SituationCard key={item.record.id} overview={item} />)}
        <button className="add-new" onClick={create}><span className="plus" aria-hidden="true">+</span>
          <span><strong>Registrar algo nuevo</strong><span>Empieza con un relato, una captura o un documento. No necesitas tener la secuencia clara.</span></span></button>
      </div>
      <aside className="col-side card guide" aria-label="Cómo funciona">
        <h3>Cómo funciona</h3>
        {GUIDE.map(([title, detail], i) => <div className="numbered" key={title}><span>{i + 1}</span><div><strong>{title}</strong><span>{detail}</span></div></div>)}
      </aside>
    </div>
  </>
}

function SituationCard({ overview }: { overview: Overview }) {
  const { done, next, nextLabel } = progress(overview)
  const active = STEPS.find(step => !done[step.id])?.id
  const t = overview.timeline
  const sent = overview.submissions[0]
  const parts = [`Actualizada ${shortDate(overview.record.updated_at).replace('Hoy', 'hoy')}`,
    overview.story ? `Relato + ${plural(overview.files, 'evidencia', 'evidencias')}` : plural(overview.files, 'evidencia', 'evidencias'),
    t.processed ? `${t.total - t.pending} de ${t.total} eventos revisados` : 'Eventos aún no propuestos']
  return <article className="card raised situation">
    <div className="situation-top">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h2>{overview.record.title}</h2>
        <span className="hint">{parts.join(' · ')}</span>
        <div className="chips"><span className="chip"><LockIcon size={12} width={1.8} />Privado</span>
          {sent && <span className="chip ok">✓ Enviado como {sent.case_id} · snapshot v1</span>}</div>
      </div>
      <button className="btn btn-secondary" onClick={() => navigate(recordPath(overview.record.id, sent ? 'enviado' : next))}>Continuar</button>
    </div>
    <div className="situation-bottom">
      <div className="progress-bars">{STEPS.map(step => <div key={step.id} className={done[step.id] ? 'done' : active === step.id ? 'active' : ''}><span /><span>{step.short}</span></div>)}</div>
      <span className="hint" style={{ color: 'var(--text-2)' }}>Siguiente paso sugerido: <strong style={{ fontWeight: 600 }}>{nextLabel}</strong></span>
    </div>
  </article>
}
