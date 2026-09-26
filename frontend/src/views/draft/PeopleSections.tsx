import type { DraftFields } from '../../types'
import { DraftField, Section, typed } from './DraftField'

type Change = (update: (fields: DraftFields) => DraftFields) => void
type AffectedKey = keyof DraftFields['affected']
type RespondentKey = keyof DraftFields['respondent']
const AFFECTED: [AffectedKey, string][] = [['name', 'Nombres'], ['document', 'Documento de identidad'], ['contact', 'Contacto'], ['position', 'Cargo'], ['area', 'Área'], ['relationship', 'Relación con la organización']]
const RESPONDENT: [RespondentKey, string][] = [['name', 'Nombre'], ['position', 'Cargo'], ['area', 'Área'], ['relationship', 'Relación con la persona afectada']]

export function AffectedSection({ form, change }: { form: DraftFields; change: Change }) {
  return <Section id="s1" roman="I" title="Datos de la persona afectada" footer="Fuente · Perfil confirmado por ti · edítalo en Mi perfil">
    <div className="panel-body field-grid">{AFFECTED.map(([key, label]) => <DraftField key={key} id={`affected-${key}`} label={label} field={form.affected[key]}
      onChange={v => change(f => ({ ...f, affected: { ...f.affected, [key]: typed(v) } }))} />)}</div>
  </Section>
}

function IdentityBanner({ foundIn, onConfirm }: { foundIn: string[] | undefined; onConfirm: () => void }) {
  return <div className="person-banner">
    <span>VERA detectó este nombre en {foundIn?.join(' y en ') ?? 'tus fuentes'}. Confirma que la identidad es correcta antes de usarla. Si no la confirmas, no se compartirá.</span>
    <button className="btn btn-warn btn-sm" onClick={onConfirm}>Confirmar identidad</button>
  </div>
}

export function RespondentSection({ form, change, onConfirm }: { form: DraftFields; change: Change; onConfirm: () => void }) {
  const detection = form.respondent_detection
  const pending = !!form.respondent.name.value && !form.respondent_confirmed
  const chip = form.respondent.name.value && <span className={`chip ${pending ? 'warn' : 'ok'}`}>{pending ? 'Pendiente de confirmar' : '✓ Confirmado por ti'}</span>
  const footer = `Fuente · ${detection ? detection.found_in.map(s => s === 'tu relato' ? 'Relato personal' : s).join(' · ') : 'Ingresado por ti'}`
  return <Section id="s2" roman="II" title="Persona contra quien se formula la queja" aside={chip} footer={footer}>
    {pending && <IdentityBanner foundIn={detection?.found_in} onConfirm={onConfirm} />}
    <div className="panel-body field-grid">{RESPONDENT.map(([key, label]) => <DraftField key={key} id={`respondent-${key}`} label={label} field={form.respondent[key]}
      onChange={v => change(f => ({ ...f, respondent: { ...f.respondent, [key]: typed(v) } }))} />)}</div>
  </Section>
}

export function ReporterSection({ form, change }: { form: DraftFields; change: Change }) {
  const same = form.reporter.same_as_affected
  return <Section id="s3" roman="III" title="Persona que formula la queja" footer={same ? 'Coincide con la persona afectada' : 'Ingresado por ti'}>
    <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label className="measure" style={{ padding: '10px 12px' }}><input type="checkbox" className="check" checked={same}
        onChange={e => { const value = e.target.checked; change(f => ({ ...f, reporter: { ...f.reporter, same_as_affected: value } })) }} />
        <span><strong>Soy la persona afectada</strong><small>Si otra persona presenta el reporte, indícalo abajo.</small></span></label>
      {same ? <DraftField id="reporter" label="Presenta el reporte" field={form.affected.name} readOnly onChange={() => {}} />
        : <DraftField id="reporter" label="Presenta el reporte" field={form.reporter.name} onChange={v => change(f => ({ ...f, reporter: { ...f.reporter, name: typed(v) } }))} />}
    </div>
  </Section>
}
