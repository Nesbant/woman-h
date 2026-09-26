import type { ReviewItem } from '../../types'

const TITLES = { date_inconsistency: 'Fecha inconsistente', possible_relation: 'Posible relación', unlinked_evidence: 'Evidencia no vinculada' }
const ICONS = { date_inconsistency: '!', possible_relation: '↔', unlinked_evidence: '+' }

function closedText(item: ReviewItem) {
  if (item.status === 'dismissed') return 'Ignorado · puedes retomarlo luego.'
  if (item.kind === 'date_inconsistency') return `✓ ${item.resolution_note ?? 'Revisaste la fecha.'}`
  if (item.kind === 'possible_relation') return '✓ Relacionaste estos eventos.'
  return `✓ ${item.message.split(' ')[0]} queda en tu espacio, sin vincular.`
}

function OpenActions({ item, busy, onSource, onSettle }: { item: ReviewItem; busy: boolean; onSource: (() => void) | null; onSettle: (status: ReviewItem['status'], message?: string) => void }) {
  const primary = item.action_label ?? (item.kind === 'possible_relation' ? 'Relacionar' : 'Marcar como revisado')
  return <div className="review-actions">
    {item.kind !== 'possible_relation' && onSource && <button className="btn btn-secondary btn-sm" onClick={onSource}>Ver fuente</button>}
    {item.kind === 'unlinked_evidence'
      ? <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onSettle('resolved')}>Mantener sin vincular</button>
      : <button className="btn btn-primary btn-sm" disabled={busy}
          onClick={() => onSettle('resolved', item.kind === 'possible_relation' ? 'Relación guardada para tu revisión.' : undefined)}>{primary}</button>}
    {item.kind !== 'unlinked_evidence' && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onSettle('dismissed')}>Ignorar</button>}
  </div>
}

export function ReviewCard({ item, busy, onSource, onSettle }: { item: ReviewItem; busy: boolean; onSource: (() => void) | null; onSettle: (status: ReviewItem['status'], message?: string) => void }) {
  return <div className="card review-card">
    <div className="review-head"><span className={`review-icon ${item.kind}`} aria-hidden="true">{ICONS[item.kind]}</span>
      <div><strong>{TITLES[item.kind]}</strong><span>Sugerido por VERA</span></div></div>
    <p>{item.message}</p>
    {item.status === 'open' ? <OpenActions item={item} busy={busy} onSource={onSource} onSettle={onSettle} />
      : <div className="review-actions" style={{ justifyContent: 'space-between' }}>
          <span className={`resolved${item.status === 'dismissed' ? ' ignored' : ''}`}>{closedText(item)}</span>
          <button className="btn btn-link btn-sm" disabled={busy} onClick={() => onSettle('open')}>Retomar</button>
        </div>}
  </div>
}
