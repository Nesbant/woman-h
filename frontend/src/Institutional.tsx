import {useEffect, useState} from 'react'
import {api, apiBlob, ApiError} from './api'
import {factDate} from './Complaint'

type Status = 'new'|'in_review'|'follow_up'|'closed'
type Person = {id:string; name:string|null}
type Summary = {case_id:string; submitted_at:string; status:Status; assignee:Person|null}
type Listing = {counts:{received:number} & Record<Status,number>; items:Summary[]}
type FieldValue = {value:string|null}
type Snapshot = {
  affected:Record<string,FieldValue>; respondent:Record<string,FieldValue>; reporter:{same_as_affected:boolean; name:FieldValue}
  facts:{events:{description:string; date_kind:'exact'|'approximate'|'unknown'; event_date:string|null; approximate_date:string|null; sources:string[]}[]; consequences:FieldValue}
  protection_measures:{selected:{code:string; label:string}[]; other:string|null}
}
type Step = {key:string; label:string; reference:string|null; done:boolean; done_at:string|null; done_by:Person|null}
type Detail = Summary & {snapshot:Snapshot; procedure:Step[]; files:{id:string; filename:string; media_type:string; sha256:string}[]; members:Person[]}
type Props = {institutionId:string; name:string; userId:string; onExpired:()=>void}

export const statusLabels: Record<Status,string> = {new:'Nuevo', in_review:'En revisión', follow_up:'Seguimiento', closed:'Cerrado'}
const MISSING = 'No informado'
const received = (iso:string) => {
  const date = new Date(iso)
  return date.toDateString()===new Date().toDateString() ? 'Hoy' : date.toLocaleDateString('es-PE',{day:'numeric',month:'short'})
}

function CaseDetail({institutionId, caseId, userId, onExpired, onBack}:Omit<Props,'name'> & {caseId:string; onBack:()=>void}) {
  const [data,setData] = useState<Detail|null>(null)
  const [error,setError] = useState('')
  const [busy,setBusy] = useState(false)
  const base = `/institutions/${institutionId}/cases/${caseId}`
  useEffect(() => {
    let active = true
    api<Detail>(base).then(value=>{if(active)setData(value)}).catch(e=>{if(!active)return; if(e instanceof ApiError && e.status===401)onExpired(); else setError(e.message)})
    return () => {active=false}
  },[base,onExpired])
  async function change(path:string, body:object) {
    setBusy(true);setError('')
    try { setData(await api<Detail>(`${base}${path}`,{method:'PUT',body:JSON.stringify(body)})) }
    catch(e) { if(e instanceof ApiError && e.status===401)onExpired(); else setError((e as Error).message) }
    finally {setBusy(false)}
  }
  async function download(file:Detail['files'][number]) {
    try {
      const url = URL.createObjectURL(await apiBlob(`${base}/files/${file.id}/content`)), link = document.createElement('a')
      link.href = url; link.download = file.filename; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000)
    } catch(e) { if(e instanceof ApiError && e.status===401)onExpired(); else setError('No se pudo descargar el archivo.') }
  }
  const back = <button className="secondary" onClick={onBack}>Volver a casos</button>
  if(!data) return <section>{back}{error ? <p role="alert" className="error">{error}</p> : <p role="status">Cargando caso…</p>}</section>
  const s = data.snapshot
  return <section className="case-detail">{back}
    <div className="card case-header"><p className="eyebrow">CASO</p><h2>{data.case_id}</h2>
      {error && <p role="alert" className="error">{error}</p>}
      <div className="case-controls">
        <div><label htmlFor="case-status">Estado</label><select id="case-status" disabled={busy} value={data.status} onChange={e=>change('/status',{status:e.target.value})}>
          {(Object.keys(statusLabels) as Status[]).map(key=><option key={key} value={key}>{statusLabels[key]}</option>)}</select></div>
        <div><label htmlFor="case-assignee">Responsable</label><select id="case-assignee" disabled={busy} value={data.assignee?.id ?? ''} onChange={e=>change('/assignee',{assignee_id:e.target.value||null})}>
          <option value="">Sin asignar</option>{data.members.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select>
          {data.assignee?.id!==userId && <button className="secondary" disabled={busy} onClick={()=>change('/assignee',{assignee_id:userId})}>Asignarme</button>}</div>
      </div>
      <p className="small">Recibido {new Date(data.submitted_at).toLocaleString('es-PE')}. Este expediente es una copia congelada de lo que la persona decidió compartir.</p>
    </div>
    <div className="card"><h3>Resumen</h3>
      <p><strong>Persona afectada:</strong> {s.affected.name?.value ?? MISSING}{s.affected.position?.value ? ` · ${s.affected.position.value}` : ''}{s.affected.area?.value ? ` · ${s.affected.area.value}` : ''}</p>
      <p><strong>Contacto:</strong> {s.affected.contact?.value ?? MISSING}</p>
      <p><strong>Persona contra quien se formula la queja:</strong> {s.respondent.name?.value ?? MISSING}{s.respondent.position?.value ? ` · ${s.respondent.position.value}` : ''}</p>
      <p><strong>Presenta:</strong> {s.reporter.same_as_affected ? 'La propia persona afectada' : s.reporter.name.value ?? MISSING}</p>
      <p><strong>Medidas de protección solicitadas:</strong> {s.protection_measures.selected.length ? s.protection_measures.selected.map(m=>m.label).join('; ') : 'Sin seleccionar'}{s.protection_measures.other ? ` · ${s.protection_measures.other}` : ''}</p>
    </div>
    <div className="card"><h3>Cronología</h3><ol className="draft-facts">{s.facts.events.map((fact,i)=><li key={i}>
      <p className="eyebrow">{factDate(fact)}</p><p>{fact.description}</p><p className="source-label">Fuente: {fact.sources.join(' · ')}</p></li>)}</ol>
      {s.facts.consequences?.value && <p><strong>Consecuencias descritas:</strong> {s.facts.consequences.value}</p>}
    </div>
    <div className="card"><h3>Evidencias recibidas</h3>{data.files.length ? <ul className="case-files">{data.files.map(file=><li key={file.id}>
      <span>{file.filename}</span><code title={file.sha256}>SHA-256 {file.sha256.slice(0,12)}…</code>
      <button className="secondary" onClick={()=>download(file)}>Descargar</button></li>)}</ul> : <p>No se compartieron archivos.</p>}
    </div>
    <div className="card"><h3>Procedimiento</h3>
      <p className="small">Seguimiento de hitos regulatorios. VERA no decide medidas, responsabilidades ni sanciones.</p>
      <ul className="procedure">{data.procedure.map(step=><li key={step.key}><label className="check-label">
        <input type="checkbox" disabled={busy} checked={step.done} onChange={e=>change(`/procedure/${step.key}`,{done:e.target.checked})} />
        <span><strong>{step.label}</strong>{step.reference && <span className="step-ref"> · Referencia: {step.reference}</span>}
          <span className="step-state">{step.done ? ` · Hecho${step.done_by?.name ? ` por ${step.done_by.name}` : ''}` : ' · Pendiente'}</span></span></label></li>)}</ul>
    </div>
  </section>
}

export function Institutional({institutionId, name, userId, onExpired}:Props) {
  const [data,setData] = useState<Listing|null>(null)
  const [error,setError] = useState('')
  const [open,setOpen] = useState<string|null>(null)
  useEffect(() => {
    if(open)return
    let active = true
    setError('')
    api<Listing>(`/institutions/${institutionId}/cases`).then(value=>{if(active)setData(value)}).catch(e=>{if(!active)return; if(e instanceof ApiError && e.status===401)onExpired(); else setError(e.message)})
    return () => {active=false}
  },[institutionId,onExpired,open])
  if(open) return <CaseDetail institutionId={institutionId} caseId={open} userId={userId} onExpired={onExpired} onBack={()=>setOpen(null)} />
  return <section className="institutional"><p className="eyebrow">VERA INSTITUTIONAL</p><h1>{name}</h1>
    <p>Solo ves casos que una persona decidió escalar. Los espacios privados no son visibles ni contables desde aquí.</p>
    {error && <p role="alert" className="error">{error}</p>}
    {!data ? !error && <p role="status">Cargando casos…</p> : <>
      <dl className="counters">
        <div><dt>Casos recibidos</dt><dd>{data.counts.received}</dd></div>
        <div><dt>Nuevos</dt><dd>{data.counts.new}</dd></div>
        <div><dt>En revisión</dt><dd>{data.counts.in_review}</dd></div>
        <div><dt>Seguimiento</dt><dd>{data.counts.follow_up}</dd></div>
        <div><dt>Cerrados</dt><dd>{data.counts.closed}</dd></div>
      </dl>
      {data.items.length===0 ? <div className="home-empty"><p>Aún no se recibieron casos.</p></div> :
      <table className="cases"><thead><tr><th>Caso</th><th>Recibido</th><th>Estado</th><th>Responsable</th></tr></thead>
        <tbody>{data.items.map(item=><tr key={item.case_id}>
          <td><button className="record-link" onClick={()=>setOpen(item.case_id)}>{item.case_id}</button></td>
          <td>{received(item.submitted_at)}</td><td><span className={`badge status-${item.status}`}>{statusLabels[item.status]}</span></td>
          <td>{item.assignee?.name ?? 'Sin asignar'}</td></tr>)}</tbody></table>}
    </>}
  </section>
}
