import {useEffect, useState} from 'react'
import {api, apiBlob, ApiError} from './api'
import {Preview} from './Files'
import type {Attachment} from './Files'
import {navigate} from './Home'

type Content = {description:string; date_kind:'exact'|'approximate'|'unknown'; event_date:string|null; approximate_date:string|null}
type Source = {id:string; kind:'account'|'record'|'file'; source_id:string; label:string; quote:string; page:number|null}
type Event = Content & {id:string; status:'proposed'|'accepted'|'discarded'; edited:boolean; reviewed:boolean; mode:string; original:Content; source:Source; sources?:Source[]; support_quotes?:string[]}
export type ReviewItem = {id:string; kind:'date_inconsistency'|'possible_relation'|'unlinked_evidence'; message:string; source_ids:string[]; file_id:string|null; status:'open'|'resolved'|'dismissed'}
type State = {revision:number; confirmed:boolean; mode:string; configured_mode:string; events:Event[]; warnings:string[]; review_items?:ReviewItem[]; processed_at:string|null}
const sourcesOf = (event:Event) => event.sources?.length ? event.sources : [event.source]
const itemTitles = {date_inconsistency:'⚠ Fecha inconsistente', possible_relation:'🔗 Posible relación', unlinked_evidence:'📎 Evidencia no vinculada'}
type Props = {recordId:string; onExpired:()=>void}
const dateLabel = (e:Content) => e.date_kind === 'exact' ? `Fecha exacta · ${e.event_date?.split('-').reverse().join('/')}` : e.date_kind === 'approximate' ? `Fecha aproximada · ${e.approximate_date}` : 'Fecha desconocida'

function SourceView({recordId, event, sourceRef, onExpired, onClose}:Props & {event:Event; sourceRef:Source; onClose:()=>void}) {
  const [data, setData] = useState<(Source & {current_text:string|null; changed:boolean})|null>(null)
  const [file, setFile] = useState<Attachment|null>(null)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    setError(''); setData(null); setFile(null)
    api<Source & {current_text:string|null; changed:boolean}>(`/records/${recordId}/timeline/events/${event.id}/source?source=${encodeURIComponent(sourceRef.id)}`).then(async source => {
      if (!active) return
      setData(source)
      if (source.kind === 'file') {
        const metadata = await api<Attachment>(`/records/${recordId}/files/${source.source_id}`)
        if (active) setFile(metadata)
      }
    }).catch(e => {
      if (!active) return
      if (e instanceof ApiError && e.status === 401) onExpired()
      else setError('No pudimos abrir la fuente. Puede haberse quitado o no estar disponible ahora.')
    })
    return () => {active = false}
  }, [recordId,event.id,sourceRef.id,onExpired,attempt])
  async function download() {
    if (!file) return
    setDownloading(true)
    try {
      const blob = await apiBlob(`/records/${recordId}/files/${file.id}/content`)
      const url = URL.createObjectURL(blob), link = document.createElement('a')
      link.href = url; link.download = file.filename; link.click()
      setTimeout(() => URL.revokeObjectURL(url),1000)
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onExpired()
      else setError('No pudimos descargar el original. Intenta nuevamente.')
    } finally {setDownloading(false)}
  }
  return <section className="source-panel" aria-label="Fuente del evento">
    <div className="record-heading"><h3>Fuente: {sourceRef.label}{sourceRef.page ? ` · página ${sourceRef.page}` : ''}</h3><button className="secondary" onClick={onClose}>Cerrar fuente</button></div>
    {error ? <><p role="alert" className="error">{error}</p><button onClick={() => setAttempt(v => v+1)}>Reintentar fuente</button></> : !data ? <p role="status">Cargando fuente…</p> : <>
      <p className="eyebrow">FRAGMENTO ORIGINAL UTILIZADO</p><blockquote>{data.quote}</blockquote>
      {!!event.support_quotes?.length && <><p className="eyebrow">CITAS QUE RESPALDAN EL EVENTO</p><ul className="quotes">{event.support_quotes.map((quote,i)=><li key={i}>«{quote}»</li>)}</ul></>}
      {data.changed && <p className="notice">Esta fuente cambió después de la propuesta. Compara el fragmento con el relato actual.</p>}
      {data.current_text && data.kind !== 'file' && <details><summary>Leer el relato actual completo</summary><p className="record-description">{data.current_text}</p></details>}
      {file && <><p>La vista previa muestra la primera página. Descarga el PDF para consultar la página citada.</p>
        <button className="secondary" disabled={downloading} onClick={download}>{downloading ? 'Descargando…' : 'Descargar fuente original'}</button>
        <Preview recordId={recordId} file={file} onExpired={onExpired} onClose={onClose} /></>}
    </>}
  </section>
}

function Editor({event, busy, onSave, onCancel}: {event:Event; busy:boolean; onSave:(content:Content)=>void; onCancel:()=>void}) {
  const [description,setDescription] = useState(event.description)
  const [kind,setKind] = useState(event.date_kind)
  const [exact,setExact] = useState(event.event_date ?? '')
  const [approx,setApprox] = useState(event.approximate_date ?? '')
  return <form onSubmit={e => {e.preventDefault(); if(description.trim()) onSave({description,date_kind:kind,event_date:kind==='exact'?exact:null,approximate_date:kind==='approximate'?approx:null})}}>
    <fieldset disabled={busy}><label htmlFor="event-description">Descripción del evento</label>
      <textarea id="event-description" required maxLength={10000} rows={4} value={description} onChange={e => setDescription(e.target.value)} />
      <label htmlFor="event-date-kind">Precisión de la fecha</label><select id="event-date-kind" value={kind} onChange={e => setKind(e.target.value as Content['date_kind'])}>
        <option value="exact">Fecha exacta</option><option value="approximate">Fecha aproximada</option><option value="unknown">Fecha desconocida</option></select>
      {kind==='exact' && <><label htmlFor="event-date">Fecha del evento</label><input id="event-date" type="date" required value={exact} onChange={e => setExact(e.target.value)} /></>}
      {kind==='approximate' && <><label htmlFor="event-approx">Referencia aproximada</label><input id="event-approx" required maxLength={200} value={approx} onChange={e => setApprox(e.target.value)} /></>}
      <p className="small">Esta será tu corrección. La propuesta original y su fuente se conservan para compararlas.</p>
      <div className="actions"><button>Guardar corrección</button><button type="button" className="secondary" onClick={onCancel}>Cancelar corrección</button></div>
    </fieldset>
  </form>
}

export function Timeline({recordId,onExpired}:Props) {
  const [data,setData] = useState<State|null>(null)
  const [error,setError] = useState('')
  const [attempt,setAttempt] = useState(0)
  const [busy,setBusy] = useState('')
  const [editing,setEditing] = useState<string|null>(null)
  const [source,setSource] = useState<{event:string; source:string}|null>(null)
  const [confirm,setConfirm] = useState(false)
  useEffect(() => {
    let active = true
    setError(''); setData(null)
    api<State>(`/records/${recordId}/timeline`).then(value => {if(active)setData(value)}).catch(e => {
      if(!active)return
      if(e instanceof ApiError && e.status===401)onExpired()
      else setError(e.message)
    })
    return () => {active=false}
  },[recordId,onExpired,attempt])
  async function mutate(path:string, body:object, method='POST') {
    if(busy || !data)return
    setBusy(path);setError('');setConfirm(false)
    try {
      const next = await api<State>(`/records/${recordId}/timeline${path}`,{method,body:JSON.stringify({revision:data.revision,...body})})
      setData(next);setEditing(null)
      if(path==='/analyze')setSource(null)
    } catch(e) {
      if(e instanceof ApiError && e.status===401)onExpired()
      else setError((e as Error).message)
    } finally {setBusy('')}
  }
  function review(event:Event,status:Event['status'],content:Content=event) {
    return mutate(`/events/${event.id}`,{status,description:content.description,date_kind:content.date_kind,event_date:content.event_date,approximate_date:content.approximate_date},'PUT')
  }
  const events = data?.events ?? []
  const items = (data?.review_items ?? []).filter(item=>item.status==='open')
  async function settle(item:ReviewItem, status:ReviewItem['status']) {
    if(busy || !data)return
    setBusy(`item-${item.id}`);setError('')
    try { setData(await api<State>(`/records/${recordId}/timeline/review-items/${item.id}`,{method:'PUT',body:JSON.stringify({revision:data.revision,status})})) }
    catch(e) { if(e instanceof ApiError && e.status===401)onExpired(); else setError((e as Error).message) }
    finally {setBusy('')}
  }
  function inspect(item:ReviewItem) {
    if(item.kind==='unlinked_evidence'){navigate(`registros/${recordId}/archivos`);return}
    const target = events.find(event=>sourcesOf(event).some(s=>item.source_ids.includes(s.id)))
    if(target)setSource({event:target.id, source:sourcesOf(target).find(s=>item.source_ids.includes(s.id))!.id})
  }
  const accepted = events.filter(e=>e.status==='accepted').length
  const pending = events.some(e=>e.status==='proposed')
  const sorted = [...events].sort((a,b) => {
    const rank = (e:Event) => e.status==='discarded'?3:e.date_kind==='exact'?0:e.date_kind==='approximate'?1:2
    return rank(a)-rank(b) || (a.date_kind==='exact'&&b.date_kind==='exact'?(a.event_date??'').localeCompare(b.event_date??''):0)
  })
  return <div className="home-page timeline-page">
    <section className="home-intro"><p className="eyebrow">TU CRONOLOGÍA PRIVADA</p><h1>Así organicé lo que me contaste</h1>
      <p>Es una propuesta. Revisa las fuentes y decide qué conservar.</p></section>
    {error && <div className="notice"><p className="error" role="alert">{error}</p><button className="secondary" disabled={!!busy} onClick={()=>{setEditing(null);setAttempt(v=>v+1)}}>Recargar cronología</button></div>}
    {!data ? !error && <p role="status">Cargando cronología…</p> : <>
      <p className="notice">{data.configured_mode==='ai' ? 'IA configurada · Al generar la propuesta, se enviarán fragmentos de tus relatos, descripciones y PDF compatibles al proveedor configurado. No se envían originales.' : 'Modo demostración · Sin proveedor de IA externo. Nada sale de VERA.'} Cada evento cita sus fuentes; nada se confirma sin tu revisión.</p>
      <div className="actions"><button disabled={!!busy || !!editing} onClick={()=>mutate('/analyze',{})}>{busy==='/analyze'?'Organizando…':data.processed_at?'Volver a procesar':'Proponer cronología'}</button>
        <button className="secondary" disabled={!!busy || !!editing} onClick={()=>navigate(`registros/${recordId}`)}>Ver mi registro</button>
        <button className="secondary" disabled={!!busy || !!editing} onClick={()=>navigate(`registros/${recordId}/archivos`)}>Volver a archivos</button></div>
      <p className="small">Volver a procesar conserva tus correcciones, aceptaciones y descartes. No se evalúa culpabilidad, credibilidad ni sanciones. Nada se envía a la institución.</p>
      {busy==='/analyze' && <p role="status" className="notice">Procesando relatos y archivos compatibles. Tus revisiones anteriores siguen guardadas.</p>}
      {!!data.warnings.length && <details className="notice" open><summary>Fuentes y límites del análisis</summary><ul>{data.warnings.map((warning,i)=><li key={i}>{warning}</li>)}</ul></details>}
      {items.length>0 && <section className="review-items" aria-label="Avisos de revisión">{items.map(item=><article key={item.id} className={`review-item ${item.kind}`}>
        <h3>{itemTitles[item.kind]}</h3><p>{item.message}</p>
        <div className="actions">{item.kind==='possible_relation' ? <><button className="secondary" disabled={!!busy} onClick={()=>inspect(item)}>Revisar</button><button disabled={!!busy} onClick={()=>settle(item,'resolved')}>Relacionar</button></> :
          <button className="secondary" disabled={!!busy} onClick={()=>inspect(item)}>Revisar</button>}
          <button className="secondary" disabled={!!busy} onClick={()=>settle(item,'dismissed')}>Ignorar</button></div>
      </article>)}</section>}
      {data.processed_at && events.length===0 && <div className="home-empty"><h2>No hay eventos propuestos</h2><p>Puedes completar tus relatos o continuar en tu registro. No necesitas analizar todos los archivos.</p></div>}
      {events.length>0 && <>
        <p className="timeline-order">Fechas exactas en orden cronológico. Las aproximadas y desconocidas se muestran aparte, sin asignarles un día.</p>
        <ol className="timeline-list">{sorted.map(event=><li className={`timeline-event ${event.status}`} key={event.id}>
          <span className={`badge date-${event.date_kind}`}>{dateLabel(event)}</span>
          <p className="event-origin">{event.edited?'Corregido por ti':'Propuesto por VERA'} · {event.status==='accepted'?'Aceptado por ti':event.status==='discarded'?'Descartado por ti':'Pendiente de revisión'}</p>
          {editing===event.id?<Editor event={event} busy={!!busy} onCancel={()=>setEditing(null)} onSave={content=>review(event,'proposed',content)} />:<>
            <p className="record-description">{event.description}</p>
            <p className="source-label">Fuente{new Set(sourcesOf(event).map(s=>s.source_id)).size>1?'s':''}: {[...new Set(sourcesOf(event).map(s=>`${s.label}${s.page?` · página ${s.page}`:''}`))].join(' · ')}</p>
            <div className="actions">{sourcesOf(event).map((s,i)=><button key={s.id} className="secondary" onClick={()=>setSource(source?.source===s.id&&source.event===event.id?null:{event:event.id,source:s.id})}>{sourcesOf(event).length>1?`Ver fuente ${i+1}`:'Ver fuente'}</button>)}
              <button className="secondary" disabled={!!busy||!!editing} onClick={()=>setEditing(event.id)}>Corregir evento</button>
              {event.status!=='accepted' && <button disabled={!!busy||!!editing} onClick={()=>review(event,'accepted')}>Aceptar evento</button>}
              {event.status!=='discarded' && <button className="secondary" disabled={!!busy||!!editing} onClick={()=>review(event,'discarded')}>Descartar evento</button>}</div>
          </>}
          {event.edited && <details><summary>Comparar con la propuesta original</summary><p>{event.original.description}</p><p>{dateLabel(event.original)}</p></details>}
          {source?.event===event.id && sourcesOf(event).some(s=>s.id===source.source) && <SourceView recordId={recordId} event={event} sourceRef={sourcesOf(event).find(s=>s.id===source.source)!} onExpired={onExpired} onClose={()=>setSource(null)} />}
        </li>)}</ol>
        <section className="card timeline-confirm"><h2>Tu revisión</h2>
          {data.confirmed?<><p role="status">Cronología confirmada por ti · Versión {data.revision}. Sigue siendo privada.</p>
            <button onClick={()=>navigate(`registros/${recordId}/queja`)}>Preparar reporte</button></>:<>
            <p>{accepted} evento(s) aceptado(s). {pending?'Acepta o descarta cada propuesta antes de confirmar.':'Puedes confirmar esta versión cuando termines de revisarla.'}</p>
            <label className="check-label"><input type="checkbox" checked={confirm} disabled={!!busy||!!editing||pending||!accepted} onChange={e=>setConfirm(e.target.checked)} />He revisado los eventos y sus fuentes.</label>
            <button disabled={!confirm||pending||!accepted||!!busy||!!editing} onClick={()=>mutate('/confirm',{})}>Confirmar cronología revisada</button>
          </>}
          <p className="small">Confirmar refleja tu revisión, no verifica que los hechos hayan ocurrido.</p>
        </section>
      </>}
    </>}
  </div>
}
