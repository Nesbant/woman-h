import { ErrorAlert, Loading, PageTitle } from '../../components/PageTitle'
import { CaseTable, Kpis } from './CaseTable'
import { CaseView } from './CaseView'
import { useCases } from './useCases'

export { STATUS_LABELS } from './labels'

export function Institutional({ institutionId, name, userId }: { institutionId: string; name: string; userId: string }) {
  const c = useCases(institutionId)
  return <>
    <PageTitle inst eyebrow={`VERA Institutional · ${name}`} title="Casos recibidos"
      lead="Solo casos enviados explícitamente por las personas. Este espacio no puede ver, contar ni inferir registros privados." />
    <ErrorAlert message={c.error} />
    {!c.listing ? !c.error && <Loading text="Cargando casos…" /> : <>
      <Kpis counts={c.listing.counts} />
      {c.listing.items.length === 0 ? <div className="card card-pad"><p className="lead">Aún no se recibieron casos.</p></div> : <div className="two-col" style={{ gap: 20 }}>
        <CaseTable items={c.listing.items} selected={c.selected} onSelect={c.select} />
        {c.detail && <CaseView detail={c.detail} userId={userId} busy={c.busy} onAssign={c.assign} onStatus={c.setStatus} onStep={c.setStep} onDownload={c.download} />}
      </div>}
    </>}
  </>
}
