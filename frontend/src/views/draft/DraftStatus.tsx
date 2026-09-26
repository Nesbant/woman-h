import type { DraftState } from '../../types'

export function DraftStatus({ facts, evidence, measures, saving, pending }: { facts: number; evidence: number; measures: number; saving: boolean
  pending: NonNullable<DraftState['draft']>['pending'] }) {
  return <aside className="col-side sticky">
    <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h3 style={{ fontSize: 16, fontWeight: 650 }}>Estado del borrador</h3>
      <div className="stat-row"><span>Secciones</span><strong>6 de 6</strong></div>
      <div className="stat-row"><span>Eventos incluidos</span><strong>{facts}</strong></div>
      <div className="stat-row"><span>Evidencias</span><strong>{evidence}</strong></div>
      <div className="stat-row"><span>Medidas solicitadas</span><strong>{measures}</strong></div>
      <span className="save-state" role="status">{saving ? 'Guardando…' : 'Guardado automáticamente · privado'}</span>
    </div>
    <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h3 style={{ fontSize: 16, fontWeight: 650 }}>Por confirmar</h3>
      {pending.map(item => <div className="pending-item" key={item.key}><span aria-hidden="true" /><div><strong>{item.title}</strong><small>{item.detail}</small></div></div>)}
      {!pending.length && <span className="hint">Nada pendiente.</span>}
      <span className="small">Puedes continuar aunque estos datos no estén disponibles.</span>
    </div>
  </aside>
}
