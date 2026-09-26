import { useCallback } from 'react'
import { getOverview } from '../../api/records'
import type { DemoView } from '../../api/session'
import type { Submission } from '../../types'
import { navigate, recordPath } from '../../router'
import { fullDate, plural, shortSha } from '../../format'
import { ErrorAlert, Loading } from '../../components/PageTitle'
import { useResource } from '../../hooks/useResource'

function Integrity({ files }: { files: Submission['summary']['files'] }) {
  return <div className="integrity"><span className="overline" style={{ letterSpacing: '.05em' }}>Integridad de archivos</span>
    {files.map(file => <div key={file.filename + file.sha256}><strong style={{ fontWeight: 600 }}>{file.filename}</strong>
      <span className="mono">original = copia · {shortSha(file.sha256)}</span><em>✓ Coincide</em></div>)}
    {!files.length && <span className="hint">No compartiste archivos.</span>}
  </div>
}

export function Sent({ recordId, demo, onDemo }: { recordId: string; demo: boolean; onDemo: (view: DemoView) => void }) {
  const { data: overview, error } = useResource(useCallback(() => getOverview(recordId), [recordId]))
  const sent = overview?.submissions[0]
  if (error) return <ErrorAlert message={error} />
  if (!overview) return <Loading text="Cargando…" />
  if (!sent) return <div className="callout"><span>Esta situación todavía no se ha enviado.</span>
    <button className="btn btn-primary btn-sm" onClick={() => navigate(recordPath(recordId, 'compartir'))}>Revisar y compartir</button></div>
  return <article className="card xl raised sent">
    <div className="sent-top"><span className="ok-mark" aria-hidden="true">✓</span><h1>Enviaste el caso {sent.case_id}</h1>
      <p className="lead">{sent.institution_name} recibió un snapshot con únicamente lo que seleccionaste.</p></div>
    <div className="sent-grid">
      <div><span>Caso</span><strong>{sent.case_id}</strong></div>
      <div><span>Enviado</span><strong>{fullDate(sent.submitted_at).replace(/^hoy, /, '')}</strong></div>
      <div><span>Snapshot</span><strong>v1 · congelado</strong></div>
      <div><span>Contenido</span><strong>{plural(sent.summary.events, 'evento', 'eventos')} · {plural(sent.summary.files.length, 'archivo', 'archivos')}</strong></div>
    </div>
    <Integrity files={sent.summary.files} />
    <div className="callout" style={{ margin: '0 28px 20px', fontSize: 13, lineHeight: '19px' }}><span><strong>Tu espacio privado sigue siendo tuyo.</strong> Puedes seguir editándolo; esos cambios no modifican el snapshot enviado.</span></div>
    <div style={{ padding: '16px 28px 24px', display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end' }}>
      <button className="btn btn-secondary" onClick={() => navigate('')}>Volver a mi espacio</button>
      {demo && <button className="btn btn-inst" onClick={() => onDemo('organization')}>Ver como la organización (demo) →</button>}
    </div>
  </article>
}
