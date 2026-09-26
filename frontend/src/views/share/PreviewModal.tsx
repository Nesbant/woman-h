import type { ReactNode } from 'react'
import { useState } from 'react'
import type { Attachment, DraftFields, DraftState, Fact } from '../../types'
import { dateLabel, shortSha } from '../../format'
import { Modal } from '../../components/Overlays'
import { useToast } from '../../components/Toast'

function parties(f: DraftFields) {
  const affected = [f.affected.name.value, [f.affected.position.value, f.affected.area.value].filter(Boolean).join(', ')].filter(Boolean).join(' · ')
  const mentioned = !f.respondent.name.value ? 'No informada'
    : f.respondent_confirmed ? [f.respondent.name.value, f.respondent.position.value].filter(Boolean).join(' · ') : null
  const reporter = f.reporter.same_as_affected ? f.affected.name.value : f.reporter.name.value
  return [['Persona afectada', affected || 'Pendiente de confirmar'], ['Persona mencionada', mentioned], ['Presenta el reporte', reporter || 'Pendiente de confirmar']] as const
}

function Section({ title, children, tone }: { title: string; children: ReactNode; tone?: string }) {
  return <div className="modal-section"><span className="overline" style={tone ? { color: tone } : undefined}>{title}</span>{children}</div>
}

type Props = { fields: DraftFields; options: DraftState['measure_options']; facts: Fact[]; files: Attachment[]; hidden: string[]
  organization: string; sending: boolean; onClose: () => void; onSubmit: () => void }

/** Exactly what the organization will receive. Sending needs an explicit acknowledgement. */
export function PreviewModal({ fields, options, facts, files, hidden, organization, sending, onClose, onSubmit }: Props) {
  const [ack, setAck] = useState(false)
  const { notify } = useToast()
  const measures = fields.protection_measures.selected.map(code => options.find(o => o.code === code)?.label ?? code)
  const submit = () => ack ? onSubmit() : notify('Marca la casilla para confirmar que revisaste la vista previa.')
  return <Modal labelledBy="preview-title" onClose={onClose}>
    <div className="modal-head">
      <div><span className="eyebrow inst" style={{ fontSize: 11 }}>Vista previa exacta · VERA Institutional</span><strong id="preview-title">Así recibirá el caso tu organización</strong></div>
      <button className="close" aria-label="Cerrar" onClick={onClose}>✕</button>
    </div>
    <div className="modal-body">
      <div className="modal-section parties">{parties(fields).map(([k, v]) => <div key={k}><span>{k}</span><span className={v ? '' : 'pending'}>{v ?? 'Sin confirmar · no se compartirá'}</span></div>)}</div>
      <Section title={`IV · Hechos (${facts.length})`}>
        {facts.map(fact => <div key={fact.event_id} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="small">{dateLabel(fact)}</span><strong style={{ fontSize: 14, fontWeight: 600 }}>{fact.title}</strong>
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{fact.description}</span></div>)}
        {!facts.length && <span className="hint">Ningún hecho seleccionado.</span>}
      </Section>
      <Section title={`V · Evidencias (${files.length})`}>
        {files.map(file => <div key={file.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', fontSize: 14 }}>
          <strong style={{ fontWeight: 600 }}>{file.filename}</strong><span className="mono">sha256 {shortSha(file.sha256)}</span></div>)}
        {!files.length && <span className="hint">Ningún archivo seleccionado.</span>}
      </Section>
      <Section title="VI · Medidas de protección"><span style={{ fontSize: 14, color: 'var(--text-2)' }}>{measures.length ? measures.join(' · ') : 'Sin seleccionar'}{fields.protection_measures.other ? ` · ${fields.protection_measures.other}` : ''}</span></Section>
      <Section title="No verá" tone="var(--brand-deep)"><span style={{ fontSize: 14, color: 'var(--text-2)' }}>{hidden.join(' · ')}</span></Section>
    </div>
    <div className="modal-foot">
      <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer' }}>
        <input type="checkbox" className="check" style={{ width: 20, height: 20 }} checked={ack} onChange={() => setAck(v => !v)} />
        <span style={{ fontSize: 14, lineHeight: '21px' }}>Entiendo que, al confirmar, {organization} recibirá únicamente los elementos mostrados y se creará un caso institucional.</span>
      </label>
      <div className="dialog-actions">
        <button className="btn btn-secondary" onClick={onClose}>Volver y editar</button>
        <button className="btn btn-primary" aria-disabled={!ack} disabled={sending} style={ack ? undefined : { background: '#B8A9C6', borderColor: '#B8A9C6', cursor: 'not-allowed' }}
          onClick={submit}>{sending ? 'Enviando…' : 'Confirmar y enviar'}</button>
      </div>
    </div>
  </Modal>
}
