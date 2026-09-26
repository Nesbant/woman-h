import type { CaseListing } from '../../types'
import { shortDate } from '../../format'
import { STATUS_LABELS } from './labels'

export function Kpis({ counts }: { counts: CaseListing['counts'] }) {
  const kpis: [number, string][] = [[counts.received, 'Casos recibidos'], [counts.new, 'Nuevos'], [counts.in_review + counts.follow_up, 'En revisión o seguimiento'], [counts.closed, 'Cerrados']]
  return <dl className="kpis">{kpis.map(([n, label]) => <div className="card kpi" key={label}><dt>{label}</dt><dd><strong>{n}</strong></dd></div>)}</dl>
}

export function CaseTable({ items, selected, onSelect }: { items: CaseListing['items']; selected: string | null; onSelect: (caseId: string) => void }) {
  return <div className="panel case-table" role="table" aria-label="Casos recibidos">
    <div className="case-grid case-table-head" role="row"><span role="columnheader">Caso</span><span role="columnheader">Recibido</span><span role="columnheader">Estado</span><span role="columnheader">Responsable</span></div>
    {items.map(item => <button key={item.case_id} role="row" className="case-row case-grid" aria-current={item.case_id === selected} onClick={() => onSelect(item.case_id)}>
      <strong role="cell">{item.case_id}</strong><span role="cell" className="muted">{shortDate(item.submitted_at)}</span>
      <span role="cell"><span className={`chip st-${item.status}`}>{STATUS_LABELS[item.status]}</span></span>
      <span role="cell" className={item.assignee ? '' : 'unassigned'}>{item.assignee?.name ?? 'Sin asignar'}</span>
    </button>)}
  </div>
}
