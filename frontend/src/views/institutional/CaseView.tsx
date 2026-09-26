import type { CaseDetail, CaseStatus, StepStatus } from '../../types'
import { fullDate } from '../../format'
import { EvidenceSection, MeasuresSection, SummarySection, TimelineSection } from './CaseSections'
import { Checklist } from './Checklist'
import { STATUS_LABELS } from './labels'

type Props = { detail: CaseDetail; userId: string; busy: boolean; onAssign: (userId: string) => void; onStatus: (status: CaseStatus) => void
  onStep: (step: string, status: StepStatus) => void; onDownload: (file: CaseDetail['files'][number]) => void }

function CaseHeader({ detail, userId, busy, onAssign }: Pick<Props, 'detail' | 'userId' | 'busy' | 'onAssign'>) {
  return <div className="case-head">
    <div><span className={`chip st-${detail.status}`}>{STATUS_LABELS[detail.status]}</span><h2>Caso {detail.case_id}</h2>
      <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Recibido {fullDate(detail.submitted_at)} · Snapshot v1 · inmutable</span></div>
    <div><span className="small">Responsable</span>
      {detail.assignee && <strong style={{ fontSize: 14, fontWeight: 600 }}>{detail.assignee.name}{detail.assignee.id === userId ? ' (tú)' : ''}</strong>}
      {detail.assignee?.id !== userId && <button className="btn btn-inst btn-md" disabled={busy} onClick={() => onAssign(userId)}>Asignarme</button>}
    </div>
  </div>
}

function StatusBar({ status, busy, onStatus }: { status: CaseStatus; busy: boolean; onStatus: (status: CaseStatus) => void }) {
  return <div className="status-bar"><span className="small" style={{ fontWeight: 600 }}>Estado</span>
    <div className="status-options" role="group" aria-label="Estado del caso">{(Object.keys(STATUS_LABELS) as CaseStatus[]).map(value =>
      <button key={value} aria-pressed={status === value} disabled={busy} onClick={() => onStatus(value)}>{STATUS_LABELS[value]}</button>)}</div>
  </div>
}

export function CaseView({ detail, userId, busy, onAssign, onStatus, onStep, onDownload }: Props) {
  return <article className="card case-detail" aria-label={`Caso ${detail.case_id}`}>
    <CaseHeader detail={detail} userId={userId} busy={busy} onAssign={onAssign} />
    <StatusBar status={detail.status} busy={busy} onStatus={onStatus} />
    <div className="case-body">
      <SummarySection snapshot={detail.snapshot} />
      <TimelineSection snapshot={detail.snapshot} />
      <EvidenceSection files={detail.files} onDownload={onDownload} />
      <MeasuresSection snapshot={detail.snapshot} />
      <Checklist steps={detail.procedure} busy={busy} onChange={onStep} />
    </div>
    <div className="panel-foot" style={{ padding: '12px 22px' }}>Este caso es un snapshot limitado. No existe acceso al espacio privado de la persona.</div>
  </article>
}
