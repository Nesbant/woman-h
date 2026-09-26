import type { Attachment, DraftFields, DraftState, Fact } from '../../types'
import { navigate, recordPath } from '../../router'
import { dateLabel, glyph, plural, shortSha } from '../../format'
import type { DrawerSource } from '../../components/SourceDrawer'
import { DraftField, Section, typed } from './DraftField'

type Change = (update: (fields: DraftFields) => DraftFields) => void
const docName = (s: Fact['sources'][number]) => s.kind === 'file' ? s.label.replace(/ · tu descripción$/, '') : s.kind === 'person' ? 'Agregado por ti' : 'Relato personal'

function FactRow({ fact, n, onSource }: { fact: Fact; n: number; onSource: (s: DrawerSource) => void }) {
  return <div className="fact">
    <span>Evento {n}</span>
    <div><span className={`date${fact.date_kind !== 'exact' ? ' approx' : ''}`}>{dateLabel(fact)}</span><strong>{fact.title}</strong><p>{fact.description}</p>
      {[...new Map(fact.sources.map(s => [s.source_id, s])).values()].map(s => <button key={s.source_id} className="src-link"
        onClick={() => onSource({ kind: s.kind, source_id: s.source_id, label: s.label, quote: s.kind === 'person' ? fact.description : undefined })}>← {docName(s)}</button>)}</div>
  </div>
}

export function FactsSection({ recordId, form, draft, excluded, change, onSource }: { recordId: string; form: DraftFields; draft: NonNullable<DraftState['draft']>
  excluded: number; change: Change; onSource: (s: DrawerSource) => void }) {
  const facts = form.facts.events
  const gaps = draft.pending.filter(p => p.key === 'place' || p.key.startsWith('date.'))
  const back = <button className="btn btn-link btn-sm" onClick={() => navigate(recordPath(recordId, 'entender'))}>Volver a eventos</button>
  return <Section id="s4" roman="IV" title="Detalle de los hechos" aside={back} footer="Fuente · Eventos confirmados en Entender">
    <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {facts.map((fact, i) => <FactRow key={fact.event_id} fact={fact} n={i + 1} onSource={onSource} />)}
      {!facts.length && <span className="empty">Aún no hay eventos confirmados. Revisa la cronología para incluirlos.</span>}
      {gaps.length > 0 && <div className="gaps">{gaps.map(gap => <div key={gap.key}><span><strong>{gap.title}</strong> · {gap.detail}</span>
        <em>{gap.key === 'place' ? 'Pendiente de confirmar' : 'Aproximada'}</em></div>)}</div>}
      {excluded > 0 && <span className="hint">{plural(excluded, 'evento no se incluye', 'eventos no se incluyen')} (pendiente o descartado).</span>}
      <DraftField id="consequences" label="Consecuencias que quieras describir · opcional" field={form.facts.consequences}
        onChange={v => change(f => ({ ...f, facts: { ...f.facts, consequences: typed(v) } }))} />
    </div>
  </Section>
}

/** Files supporting the included facts, in the order of the events they support. */
export function evidenceRows(form: DraftFields, files: Attachment[]) {
  const facts = form.facts.events
  const byId = new Map(files.map(f => [f.id, f]))
  const firstUse = (id: string) => facts.findIndex(f => f.sources.some(s => s.source_id === id))
  return [...form.evidence.file_ids].sort((a, b) => firstUse(a) - firstUse(b)).map(id => ({ id, file: byId.get(id),
    supports: facts.map((f, i) => f.sources.some(s => s.source_id === id) ? `Evento ${i + 1}` : null).filter(Boolean).join(', ') }))
}

export function EvidenceSection({ rows }: { rows: ReturnType<typeof evidenceRows> }) {
  return <Section id="s5" roman="V" title="Medios probatorios" footer="Fuente · Evidencias vinculadas a eventos confirmados">
    <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map(({ id, file, supports }) => <div className="evidence-row" key={id}>
        <span className="glyph sm">{file ? glyph(file.media_type) : 'DOC'}</span>
        <div className="file-name"><strong>{file?.filename ?? 'Archivo eliminado'}</strong><span>Respalda {supports}</span></div>
        {file && <span className="mono" title={file.sha256}>sha256 {shortSha(file.sha256)}</span>}
      </div>)}
      {!rows.length && <span className="hint">Ninguna evidencia vinculada a eventos confirmados.</span>}
    </div>
  </Section>
}

export function MeasuresSection({ form, options, change }: { form: DraftFields; options: DraftState['measure_options']; change: Change }) {
  const selected = form.protection_measures.selected
  const toggle = (code: string) => change(f => ({ ...f, protection_measures: { ...f.protection_measures,
    selected: f.protection_measures.selected.includes(code) ? f.protection_measures.selected.filter(c => c !== code) : [...f.protection_measures.selected, code] } }))
  return <Section id="s6" roman="VI" title="Medidas de protección que deseas solicitar" aside={<span className="small">Opcional</span>}>
    <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {options.map(option => <label key={option.code} className={`measure${selected.includes(option.code) ? ' on' : ''}`}>
        <input type="checkbox" className="check" checked={selected.includes(option.code)} onChange={() => toggle(option.code)} />
        <span><strong>{option.label}</strong><small>{option.help}</small></span></label>)}
      {selected.includes('other') && <label className="field"><span>Describe la medida con tus palabras</span>
        <input className="input" maxLength={1000} value={form.protection_measures.other ?? ''}
          onChange={e => { const v = e.target.value; change(f => ({ ...f, protection_measures: { ...f.protection_measures, other: v } })) }} /></label>}
      <span className="hint">VERA explica cada opción en lenguaje sencillo, pero no decide qué medida corresponde.</span>
    </div>
  </Section>
}
