import type { Overview } from '../../types'
import { navigate, recordPath } from '../../router'
import { progress, STEPS } from '../../progress'
import { plural, shortDate } from '../../format'
import { LockIcon } from '../../components/icons'

function summary(overview: Overview) {
  const t = overview.timeline
  return [`Actualizada ${shortDate(overview.record.updated_at).replace('Hoy', 'hoy')}`,
    overview.story ? `Relato + ${plural(overview.files, 'evidencia', 'evidencias')}` : plural(overview.files, 'evidencia', 'evidencias'),
    t.processed ? `${t.total - t.pending} de ${t.total} eventos revisados` : 'Eventos aún no propuestos'].join(' · ')
}

function ProgressBars({ overview }: { overview: Overview }) {
  const { done, nextLabel } = progress(overview)
  const active = STEPS.find(step => !done[step.id])?.id
  return <div className="situation-bottom">
    <div className="progress-bars">{STEPS.map(step => <div key={step.id} className={done[step.id] ? 'done' : active === step.id ? 'active' : ''}><span /><span>{step.short}</span></div>)}</div>
    <span className="hint" style={{ color: 'var(--text-2)' }}>Siguiente paso sugerido: <strong style={{ fontWeight: 600 }}>{nextLabel}</strong></span>
  </div>
}

export function SituationCard({ overview, onRename, onDelete }: { overview: Overview; onRename: () => void; onDelete: () => void }) {
  const { next } = progress(overview)
  const sent = overview.submissions[0]
  return <article className="card raised situation" aria-label={overview.record.title}>
    <div className="situation-top">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h2>{overview.record.title}</h2>
        <span className="hint">{summary(overview)}</span>
        <div className="chips"><span className="chip"><LockIcon size={12} width={1.8} />Privado</span>
          {sent && <span className="chip ok">✓ Enviado como {sent.case_id} · snapshot v1</span>}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
        <button className="btn btn-secondary" onClick={() => navigate(recordPath(overview.record.id, sent ? 'enviado' : next))}>Continuar</button>
        <div className="menu-actions">
          <button className="btn btn-link btn-sm" onClick={onRename}>Renombrar</button>
          <button className="btn btn-link btn-sm danger" onClick={onDelete}>Eliminar</button>
        </div>
      </div>
    </div>
    <ProgressBars overview={overview} />
  </article>
}
