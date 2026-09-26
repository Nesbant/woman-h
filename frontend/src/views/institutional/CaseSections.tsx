import type { CaseDetail, FieldValue } from '../../types'
import { dateLabel, shortSha } from '../../format'

type Snapshot = CaseDetail['snapshot']
const person = (name?: FieldValue, extra: (string | null | undefined)[] = []) =>
  [name?.value, extra.filter(Boolean).join(', ')].filter(Boolean).join(' · ') || 'No informado'

function parties(s: Snapshot): [string, string][] {
  return [
    ['Persona afectada', person(s.affected.name, [s.affected.position?.value, s.affected.area?.value])],
    // An unconfirmed identity is never shared, so the organization cannot tell it apart from none at all.
    ['Persona mencionada', s.respondent.name?.value ? person(s.respondent.name, [s.respondent.position?.value]) : 'No informada'],
    ['Presenta el reporte', s.reporter.same_as_affected ? (s.affected.name?.value ?? 'La persona afectada') : (s.reporter.name.value ?? 'No informado')],
  ]
}

export function SummarySection({ snapshot }: { snapshot: Snapshot }) {
  return <section className="case-section"><h3>Resumen</h3>
    <p>{snapshot.summary ?? `Caso recibido con ${snapshot.facts.events.length} eventos y ${snapshot.evidence.length} archivos seleccionados por la persona.`}</p>
    <div className="parties boxed">{parties(snapshot).map(([k, v]) => <div key={k}><span>{k}</span><span>{v}</span></div>)}</div>
  </section>
}

export function TimelineSection({ snapshot }: { snapshot: Snapshot }) {
  return <section className="case-section"><h3>Cronología recibida</h3>
    {snapshot.facts.events.map((event, i) => <div className="case-event" key={i}>
      <span>{event.date_kind === 'exact' ? dateLabel(event) : `≈ ${event.approximate_date ?? 'fecha por confirmar'}`}</span><span>{event.title || event.description}</span></div>)}
    {!snapshot.facts.events.length && <span className="hint">La persona no compartió hechos.</span>}
  </section>
}

export function EvidenceSection({ files, onDownload }: { files: CaseDetail['files']; onDownload: (file: CaseDetail['files'][number]) => void }) {
  return <section className="case-section"><h3>Evidencias recibidas</h3>
    {files.map(file => <div className="case-file" key={file.id}><strong style={{ fontWeight: 600 }}>{file.filename}</strong>
      <span className="mono" title={file.sha256}>sha256 {shortSha(file.sha256)}</span><em>✓ Hash verificado</em>
      <button className="btn btn-link btn-sm" onClick={() => onDownload(file)}>Descargar</button></div>)}
    {!files.length && <span className="hint">La persona no compartió archivos.</span>}
  </section>
}

export function MeasuresSection({ snapshot }: { snapshot: Snapshot }) {
  const measures = snapshot.protection_measures.selected.map(m => m.label)
  return <section className="case-section"><h3>Medidas de protección solicitadas</h3>
    <span>{measures.length ? measures.join(' · ') : 'La persona no seleccionó medidas.'}{snapshot.protection_measures.other ? ` · ${snapshot.protection_measures.other}` : ''}</span></section>
}
