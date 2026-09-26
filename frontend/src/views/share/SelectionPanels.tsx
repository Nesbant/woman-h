import { plural } from '../../format'
import { LockIcon } from '../../components/icons'
import type { Row } from './useShareSelection'

const FIXED_PRIVATE = [
  { name: 'Relato personal completo', why: 'Los hechos derivados van en el borrador; el texto original no.' },
  { name: 'Nota privada', why: 'Nunca forma parte del expediente.' },
]

export function SharedPanel({ rows, onToggle }: { rows: Row[]; onToggle: (key: string) => void }) {
  return <section className="panel" aria-labelledby="shared-title">
    <div className="panel-head split"><h3 id="shared-title">Se compartirá</h3><span className="chip ok">{plural(rows.length + 1, 'elemento', 'elementos')}</span></div>
    <div className="share-row fixed">
      <input type="checkbox" className="check" checked disabled aria-label="Borrador estructurado, siempre incluido" style={{ accentColor: 'var(--ok)' }} />
      <div><strong>Borrador estructurado · secciones I–VI</strong><small>Necesario para crear el caso · incluye solo eventos seleccionados</small></div>
      <em>Visible para la organización</em>
    </div>
    {rows.map(row => <label className="share-row" key={row.key}>
      <input type="checkbox" className="check" checked onChange={() => onToggle(row.key)} />
      <div><strong>{row.name}</strong><small>{row.detail}</small></div><em>Visible para la organización</em></label>)}
    {!rows.length && <p className="hint" style={{ padding: '14px 20px' }}>No hay eventos ni archivos seleccionados. El caso solo incluiría el borrador.</p>}
  </section>
}

export function PrivatePanel({ rows, onToggle }: { rows: Row[]; onToggle: (key: string) => void }) {
  return <section className="panel" aria-labelledby="private-title">
    <div className="panel-head split"><h3 id="private-title">Seguirá privado</h3><span className="chip"><LockIcon size={12} width={1.8} />Solo tú</span></div>
    {rows.map(row => <label className="share-row private" key={row.key}>
      <input type="checkbox" className="check" checked={false} onChange={() => onToggle(row.key)} />
      <div><strong>{row.name}</strong><small>{row.detail}</small></div><em>Privado</em></label>)}
    {FIXED_PRIVATE.map(item => <div className="share-row private fixed" key={item.name}>
      <span style={{ width: 18, flex: 'none', color: 'var(--brand-deep)', display: 'grid', placeItems: 'center' }}><LockIcon size={14} width={1.7} /></span>
      <div><strong>{item.name}</strong><small>{item.why}</small></div><em>Siempre privado</em></div>)}
  </section>
}

export function OrgSummary({ events, files, organization, onPreview }: { events: number; files: number; organization: string | null; onPreview: () => void }) {
  return <aside className="col-side sticky" style={{ gap: 12 }}>
    <div className="org-card">
      <div className="org-card-head"><span>Lo que verá la organización</span><span>Un snapshot independiente de tu espacio privado.</span></div>
      <div className="org-card-body">
        <div><span>Borrador estructurado</span><strong>Sí</strong></div>
        <div><span>Eventos</span><strong>{events}</strong></div>
        <div><span>Archivos</span><strong>{files}</strong></div>
        <div><span>Contenido privado</span><strong style={{ color: 'var(--brand-deep)' }}>No visible</strong></div>
      </div>
    </div>
    <button className="btn btn-primary btn-lg" onClick={onPreview} disabled={!organization}>Revisar lo que verá la organización</button>
    <span className="caption">{organization ? `Destino: ${organization}. ` : 'No hay una organización configurada. '}Aún no se envía nada. Verás una vista previa exacta antes de confirmar.</span>
  </aside>
}
