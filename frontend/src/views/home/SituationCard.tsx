import type { Overview } from '../../types'
import { conversationPath, navigate } from '../../router'
import { progress, STEPS } from '../../progress'
import { plural, shortDate } from '../../format'
import { LockIcon } from '../../components/icons'

function summary(overview: Overview) {
  const t = overview.timeline
  return [`Actualizada ${shortDate(overview.record.updated_at).replace('Hoy', 'hoy')}`,
    overview.story ? `Relato + ${plural(overview.files, 'evidencia', 'evidencias')}` : plural(overview.files, 'evidencia', 'evidencias'),
    t.processed ? `${t.total - t.pending} de ${t.total} eventos revisados` : 'Eventos aún no propuestos'].join(' · ')
}

function ReviewStatus({ overview }: { overview: Overview }) {
  const { done, reviewLabel } = progress(overview)
  return <div className="situation-bottom">
    <div className="chips" aria-label="Estado de revisión">{STEPS.filter(step => done[step.id]).map(step => <span key={step.id} className="chip ok">✓ {step.short}</span>)}</div>
    <span className="hint" style={{ color: 'var(--text-2)' }}>{reviewLabel}</span>
  </div>
}

export function SituationCard({ overview, onRename, onDelete }: { overview: Overview; onRename: () => void; onDelete: () => void }) {
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
        <button className="btn btn-secondary" onClick={() => navigate(conversationPath(overview.record.id))}>Continuar</button>
        <div className="menu-actions">
          <button className="btn btn-link btn-sm" onClick={onRename}>Renombrar</button>
          <button className="btn btn-link btn-sm danger" onClick={onDelete}>Eliminar</button>
        </div>
      </div>
    </div>
    <ReviewStatus overview={overview} />
  </article>
}
