import {useEffect, useState} from 'react'
import type {FormEvent} from 'react'
import {api, ApiError} from './api'
import type {Attachment} from './Files'
import {navigate} from './Home'

type FieldValue = {value:string|null; origin:'profile'|'person'|null}
type SourceRef = {kind:'account'|'record'|'file'; source_id:string; label:string}
type Fact = {event_id:string; description:string; date_kind:'exact'|'approximate'|'unknown'; event_date:string|null; approximate_date:string|null; sources:SourceRef[]; edited:boolean}
type Fields = {
  affected: Record<AffectedKey, FieldValue>
  respondent: Record<RespondentKey, FieldValue> & {suggestions:string[]}
  reporter: {same_as_affected:boolean; name:FieldValue}
  facts: {events:Fact[]; consequences:FieldValue}
  evidence: {file_ids:string[]}
  protection_measures: {selected:string[]; other:string|null}
}
type Draft = {revision:number; timeline_revision:number; stale:boolean; fields:Fields; source_map:Record<string,string|string[]>; missing:string[]; reviewed:boolean}
type DraftState = {timeline_confirmed:boolean; timeline_revision:number; measure_options:Record<string,string>; draft:Draft|null}
type Organization = {id:string; name:string}
type Receipt = {case_id:string; institution_name:string; shared:{events:number; files:number}}
type Props = {recordId:string; onExpired:()=>void}

type AffectedKey = 'name'|'document'|'contact'|'position'|'area'|'relationship'
type RespondentKey = 'name'|'position'|'area'|'relationship'
const affectedLabels: Record<AffectedKey,string> = {name:'Nombres', document:'Documento de identidad', contact:'Datos de contacto', position:'Cargo', area:'Área', relationship:'Relación con la organización'}
const respondentLabels: Record<RespondentKey,string> = {name:'Nombre', position:'Cargo', area:'Área', relationship:'Relación con la persona afectada'}
const MISSING = 'Falta confirmar esta información'

export const factDate = (fact:Pick<Fact,'date_kind'|'event_date'|'approximate_date'>) => fact.date_kind==='exact' ? fact.event_date!.split('-').reverse().join('/') :
  fact.date_kind==='approximate' ? `Fecha aproximada: ${fact.approximate_date}` : 'Fecha pendiente de confirmar'

function useDraft(recordId:string, onExpired:()=>void) {
  const [state,setState] = useState<DraftState|null>(null)
  const [error,setError] = useState('')
  const [busy,setBusy] = useState(false)
  const [attempt,setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    setError('')
    api<DraftState>(`/records/${recordId}/complaint`).then(value => {if(active)setState(value)}).catch(e => {
      if(!active)return
      if(e instanceof ApiError && e.status===401)onExpired(); else setError(e.message)
    })
    return () => {active=false}
  },[recordId,onExpired,attempt])
  async function call(path:string, body:object, method='POST') {
    setBusy(true);setError('')
    try { const next = await api<DraftState>(`/records/${recordId}/complaint${path}`,{method,body:JSON.stringify(body)}); setState(next); return next }
    catch(e) { if(e instanceof ApiError && e.status===401)onExpired(); else setError((e as Error).message); return null }
    finally {setBusy(false)}
  }
  return {state, error, busy, call, reload:()=>setAttempt(v=>v+1)}
}

function Origin({field}:{field:FieldValue}) {
  if(!field.value)return <span className="field-missing">{MISSING}</span>
  return <span className="field-origin">{field.origin==='profile'?'De tu perfil':'Ingresado por ti'}</span>
}

function TextField({id,label,field,value,onChange,multiline}:{id:string; label:string; field:FieldValue; value:string; onChange:(v:string)=>void; multiline?:boolean}) {
  return <div className="draft-field"><label htmlFor={id}>{label} <Origin field={field} /></label>
    {multiline ? <textarea id={id} rows={3} maxLength={2000} value={value} placeholder={MISSING} onChange={e=>onChange(e.target.value)} /> :
      <input id={id} maxLength={2000} value={value} placeholder={MISSING} onChange={e=>onChange(e.target.value)} />}</div>
}

function evidenceOf(fields:Fields) {
  const seen = new Map<string,string>()
  fields.facts.events.forEach(fact => fact.sources.forEach(s => {if(s.kind==='file' && !seen.has(s.source_id))seen.set(s.source_id, s.label.replace(/ · tu descripción$/,''))}))
  return [...seen].map(([id,label])=>({id,label}))
}

export function Complaint({recordId,onExpired}:Props) {
  const {state,error,busy,call} = useDraft(recordId,onExpired)
  const [form,setForm] = useState<Fields|null>(null)
  const [dirty,setDirty] = useState(false)
  const draft = state?.draft
  useEffect(() => {if(draft){setForm(draft.fields);setDirty(false)}},[draft])
  function update(change:(f:Fields)=>Fields) { setForm(f=>f&&change(f)); setDirty(true) }
  async function save(event?:FormEvent) {
    event?.preventDefault()
    if(!form || !draft)return
    const value = (f:FieldValue) => ({value:f.value?.trim() || null})
    await call('',{revision:draft.revision,
      affected:Object.fromEntries(Object.entries(form.affected).map(([k,f])=>[k,value(f)])),
      respondent:Object.fromEntries((Object.keys(respondentLabels) as RespondentKey[]).map(k=>[k,value(form.respondent[k])])),
      reporter_same_as_affected:form.reporter.same_as_affected, reporter_name:value(form.reporter.name),
      facts:form.facts.events.map(f=>({event_id:f.event_id, description:f.description})),
      consequences:value(form.facts.consequences), measures:form.protection_measures.selected,
      measures_other:form.protection_measures.other?.trim() || null},'PUT')
  }
  const back = <button className="secondary" onClick={()=>navigate(`registros/${recordId}/cronologia`)}>Volver a la cronología</button>
  const set = (value:string, current:FieldValue):FieldValue => ({value, origin:current.origin==='profile'&&value===current.value?'profile':'person'})
  return <div className="home-page complaint-page">
    <section className="home-intro"><p className="eyebrow">PREPARAR REPORTE · PRIVADO</p><h1>Tu borrador de queja</h1>
      <p>VERA solo usa información que revisaste. Todo es editable y nada se envía hasta que lo confirmes.</p></section>
    {error && <p role="alert" className="error">{error}</p>}
    {!state ? !error && <p role="status">Cargando borrador…</p> : !state.timeline_confirmed && !draft ? <div className="notice">
      <p>Primero revisa y confirma tu cronología. El borrador se basa únicamente en los eventos que aceptaste.</p>{back}</div> :
    !draft ? <div className="notice"><p>Tu cronología está confirmada. VERA puede preparar un borrador con las seis secciones del formato referencial (RM 115-2020-MIMP).</p>
      <button disabled={busy} onClick={()=>call('/generate',{revision:state.timeline_revision})}>{busy?'Preparando…':'Preparar borrador'}</button></div> :
    form && <form onSubmit={save} className="draft-form">
      {draft.stale && <div className="notice"><p>Tu cronología cambió después de preparar este borrador.</p>
        {state.timeline_confirmed ? <button type="button" disabled={busy} onClick={()=>call('/generate',{revision:state.timeline_revision})}>Actualizar hechos desde la cronología</button> : back}</div>}
      <p className="notice">{draft.missing.length ? `${draft.missing.length} dato(s) pendiente(s) de confirmar. Puedes continuar igual: no es necesario que el expediente esté perfecto.` : 'Todas las secciones tienen información.'}</p>
      <fieldset disabled={busy}>
        <section className="card draft-section"><h2>I. Datos de la persona afectada</h2>
          {(Object.keys(affectedLabels) as AffectedKey[]).map(key => <TextField key={key} id={`affected-${key}`} label={affectedLabels[key]} field={form.affected[key]}
            value={form.affected[key].value ?? ''} onChange={v=>update(f=>({...f, affected:{...f.affected, [key]:set(v,f.affected[key])}}))} />)}
        </section>
        <section className="card draft-section"><h2>II. Persona contra quien se formula la queja</h2>
          {!!form.respondent.suggestions.length && <div className="suggestions"><p>Mencionado en tus relatos. VERA no completa identidades: confírmalo tú.</p>
            {form.respondent.suggestions.map(name=><button type="button" className="secondary" key={name} onClick={()=>update(f=>({...f, respondent:{...f.respondent, name:set(name.replace(/\s*\(.*\)$/,''),f.respondent.name)}}))}>Usar «{name}»</button>)}</div>}
          {(Object.keys(respondentLabels) as RespondentKey[]).map(key => <TextField key={key} id={`respondent-${key}`} label={respondentLabels[key]} field={form.respondent[key]}
            value={form.respondent[key].value ?? ''} onChange={v=>update(f=>({...f, respondent:{...f.respondent, [key]:set(v,f.respondent[key])}}))} />)}
        </section>
        <section className="card draft-section"><h2>III. Persona que presenta el reporte</h2>
          <label className="check-label"><input type="checkbox" checked={form.reporter.same_as_affected} onChange={e=>update(f=>({...f, reporter:{...f.reporter, same_as_affected:e.target.checked}}))} />Soy la persona afectada</label>
          {!form.reporter.same_as_affected && <TextField id="reporter-name" label="Nombre de quien presenta" field={form.reporter.name} value={form.reporter.name.value ?? ''}
            onChange={v=>update(f=>({...f, reporter:{...f.reporter, name:set(v,f.reporter.name)}}))} />}
        </section>
        <section className="card draft-section"><h2>IV. Relación de hechos</h2>
          <ol className="draft-facts">{form.facts.events.map((fact,i)=><li key={fact.event_id}>
            <p className="eyebrow">EVENTO {i+1} · {factDate(fact)}</p>
            <label htmlFor={`fact-${fact.event_id}`}>Descripción {fact.edited && <span className="field-origin">Editado por ti</span>}</label>
            <textarea id={`fact-${fact.event_id}`} rows={3} maxLength={2000} value={fact.description}
              onChange={e=>update(f=>({...f, facts:{...f.facts, events:f.facts.events.map(x=>x.event_id===fact.event_id?{...x, description:e.target.value}:x)}}))} />
            <p className="source-label">Fuente ← {fact.sources.map(s=>s.label).join(' · ')}</p>
          </li>)}</ol>
          <TextField id="consequences" label="Consecuencias descritas por ti (opcional)" field={form.facts.consequences} multiline value={form.facts.consequences.value ?? ''}
            onChange={v=>update(f=>({...f, facts:{...f.facts, consequences:set(v,f.facts.consequences)}}))} />
        </section>
        <section className="card draft-section"><h2>V. Medios probatorios</h2>
          {evidenceOf(form).length ? <ul>{evidenceOf(form).map(file=><li key={file.id}>{file.label}</li>)}</ul> : <p>{MISSING}</p>}
          <p className="small">En el siguiente paso eliges exactamente qué archivos compartir.</p>
        </section>
        <section className="card draft-section"><h2>VI. Medidas de protección solicitadas</h2>
          <p>Puedes indicar las medidas que deseas solicitar. VERA no decide cuál corresponde; la organización evalúa tu solicitud.</p>
          {Object.entries(state.measure_options).map(([code,label])=><label key={code} className="check-label"><input type="checkbox" checked={form.protection_measures.selected.includes(code)}
            onChange={e=>update(f=>({...f, protection_measures:{...f.protection_measures, selected:e.target.checked?[...f.protection_measures.selected,code]:f.protection_measures.selected.filter(x=>x!==code)}}))} />{label}</label>)}
          {form.protection_measures.selected.includes('other') && <><label htmlFor="measures-other">Describe la medida</label>
            <input id="measures-other" maxLength={1000} value={form.protection_measures.other ?? ''} onChange={e=>update(f=>({...f, protection_measures:{...f.protection_measures, other:e.target.value}}))} /></>}
          {!form.protection_measures.selected.length && <p className="field-missing">[ Sin seleccionar ]</p>}
        </section>
      </fieldset>
      <div className="actions sticky-actions">
        <button type="submit" disabled={busy || !dirty}>{busy?'Guardando…':dirty?'Guardar borrador':'Borrador guardado'}</button>
        <button type="button" className="secondary" disabled={busy || dirty || draft.stale} onClick={()=>navigate(`registros/${recordId}/compartir`)}>Revisar y compartir</button>
        {back}
      </div>
      {dirty && <p className="small">Guarda tus cambios antes de continuar.</p>}
    </form>}
  </div>
}

export function Share({recordId,onExpired}:Props) {
  const {state,error:draftError,busy,call} = useDraft(recordId,onExpired)
  const [files,setFiles] = useState<Attachment[]|null>(null)
  const [orgs,setOrgs] = useState<Organization[]|null>(null)
  const [events,setEvents] = useState<Set<string>|null>(null)
  const [chosen,setChosen] = useState<Set<string>|null>(null)
  const [org,setOrg] = useState('')
  const [preview,setPreview] = useState(false)
  const [sending,setSending] = useState(false)
  const [error,setError] = useState('')
  const [receipt,setReceipt] = useState<Receipt|null>(null)
  const draft = state?.draft
  useEffect(() => {
    let active = true
    Promise.all([api<{items:Attachment[]}>(`/records/${recordId}/files`), api<Organization[]>('/organizations')]).then(([f,o]) => {
      if(!active)return
      setFiles(f.items); setOrgs(o); setOrg(o[0]?.id ?? '')
    }).catch(e => {if(!active)return; if(e instanceof ApiError && e.status===401)onExpired(); else setError(e.message)})
    return () => {active=false}
  },[recordId,onExpired])
  useEffect(() => {
    if(!draft || !files || events)return
    setEvents(new Set(draft.fields.facts.events.map(f=>f.event_id)))
    // Preselect only files that still exist: a deleted file would be sent invisibly and rejected.
    setChosen(new Set(draft.fields.evidence.file_ids.filter(id=>files.some(file=>file.id===id))))
  },[draft,files,events])
  function toggle(set:Set<string>, id:string, apply:(s:Set<string>)=>void) {
    const next = new Set(set); if(next.has(id))next.delete(id); else next.add(id); apply(next); setPreview(false)
  }
  async function review() {
    if(!draft)return
    const next = draft.reviewed ? state : await call('/review',{revision:draft.revision})
    if(next)setPreview(true)
  }
  async function send() {
    if(!draft || !events || !chosen)return
    setSending(true);setError('')
    try {
      const facts = draft.fields.facts.events.filter(f=>events.has(f.event_id)).map(f=>f.event_id)
      setReceipt(await api<Receipt>(`/records/${recordId}/submit`,{method:'POST',body:JSON.stringify({draft_revision:draft.revision, event_ids:facts, file_ids:[...chosen], institution_id:org})}))
    } catch(e) { if(e instanceof ApiError && e.status===401)onExpired(); else setError((e as Error).message) }
    finally {setSending(false)}
  }
  if(receipt) return <div className="home-page share-page"><section className="card receipt" role="status">
    <p className="eyebrow">ENVIADO</p><h1>Caso {receipt.case_id}</h1>
    <p>{receipt.institution_name} recibió {receipt.shared.events} hecho(s) y {receipt.shared.files} archivo(s). Recibió únicamente lo que marcaste.</p>
    <p>Tu espacio privado sigue siendo tuyo: puedes seguir editándolo y eso no modifica lo enviado.</p>
    <button onClick={()=>navigate(`registros/${recordId}`)}>Volver a mi registro</button></section></div>
  const loading = !state || !files || !orgs || !events || !chosen
  const facts = draft?.fields.facts.events ?? []
  const shareFacts = facts.filter(f=>events?.has(f.event_id))
  const shareFiles = (files ?? []).filter(f=>chosen?.has(f.id))
  const privateFiles = (files ?? []).filter(f=>!chosen?.has(f.id))
  const orgName = orgs?.find(o=>o.id===org)?.name
  return <div className="home-page share-page">
    <section className="home-intro"><p className="eyebrow">REVISAR Y COMPARTIR</p><h1>Tú decides qué se comparte</h1>
      <p>Tener algo guardado en VERA no significa haberlo denunciado. Solo lo que marques llegará a la organización.</p></section>
    {(error || draftError) && <p role="alert" className="error">{error || draftError}</p>}
    {loading ? !(error || draftError) && <p role="status">Preparando la selección…</p> : !draft ? <div className="notice"><p>Primero prepara tu borrador.</p>
      <button onClick={()=>navigate(`registros/${recordId}/queja`)}>Preparar reporte</button></div> :
    draft.stale || !state.timeline_confirmed ? <div className="notice" role="alert"><p>Tu cronología cambió después de preparar el borrador. Confírmala y actualiza el borrador antes de compartir: así no se envía nada que hayas descartado.</p>
      <button onClick={()=>navigate(`registros/${recordId}/${state.timeline_confirmed ? 'queja' : 'cronologia'}`)}>{state.timeline_confirmed ? 'Actualizar borrador' : 'Revisar cronología'}</button></div> : <>
      <div className="share-grid">
        <section className="card" aria-labelledby="share-heading"><h2 id="share-heading">Se compartirá</h2>
          <fieldset disabled={busy||sending}><legend className="eyebrow">HECHOS</legend>
            {facts.map((fact,i)=><label key={fact.event_id} className="check-label"><input type="checkbox" checked={events.has(fact.event_id)} onChange={()=>toggle(events,fact.event_id,setEvents)} />Evento {i+1} · {factDate(fact)}</label>)}
          </fieldset>
          <fieldset disabled={busy||sending}><legend className="eyebrow">ARCHIVOS</legend>
            {files.length ? files.map(file=><label key={file.id} className="check-label"><input type="checkbox" checked={chosen.has(file.id)} onChange={()=>toggle(chosen,file.id,setChosen)} />{file.filename}</label>) : <p>No hay archivos.</p>}
          </fieldset>
          <p className="small">También se comparten las secciones I, II, III y VI de tu borrador.</p>
        </section>
        <section className="card private-card" aria-labelledby="private-heading"><h2 id="private-heading">Seguirá privado</h2>
          <ul className="private-list"><li>🔒 Relato personal y sus citas</li><li>🔒 Cronología completa y avisos de revisión</li>
            {facts.filter(f=>!events.has(f.event_id)).map(f=><li key={f.event_id}>🔒 Evento {facts.indexOf(f)+1}</li>)}
            {privateFiles.map(f=><li key={f.id}>🔒 {f.filename}</li>)}</ul>
          <p className="small">La organización no puede ver tu espacio privado ni saber que existe.</p>
        </section>
      </div>
      <section className="card"><label htmlFor="organization">Organización que recibirá el caso</label>
        <select id="organization" value={org} disabled={busy||sending} onChange={e=>{setOrg(e.target.value);setPreview(false)}}>{orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select>
        {!preview ? <div className="actions"><button disabled={busy || !shareFacts.length || !org} onClick={review}>Revisar lo que verá la organización</button>
          <button className="secondary" onClick={()=>navigate(`registros/${recordId}/queja`)}>Volver al borrador</button></div> :
        <div className="org-preview"><p className="eyebrow">ASÍ LO VERÁ {orgName?.toUpperCase()}</p>
          <p><strong>Persona afectada:</strong> {draft.fields.affected.name.value ?? MISSING}</p>
          <p><strong>Persona mencionada:</strong> {draft.fields.respondent.name.value ?? MISSING}</p>
          <ol>{shareFacts.map(f=><li key={f.event_id}><strong>{factDate(f)}</strong> — {f.description}</li>)}</ol>
          <p><strong>Evidencias:</strong> {shareFiles.length ? shareFiles.map(f=>f.filename).join(', ') : 'ninguna'}</p>
          <p><strong>Medidas solicitadas:</strong> {draft.fields.protection_measures.selected.length ? draft.fields.protection_measures.selected.map(c=>state.measure_options[c]).join('; ') : 'sin seleccionar'}</p>
          <div className="actions"><button disabled={sending} onClick={send}>{sending?'Enviando…':'Confirmar y enviar'}</button>
            <button className="secondary" disabled={sending} onClick={()=>setPreview(false)}>Cambiar selección</button></div>
        </div>}
      </section>
    </>}
  </div>
}
