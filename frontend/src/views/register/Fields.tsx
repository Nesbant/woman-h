const noteHint = { textTransform: 'none', letterSpacing: 0, fontWeight: 500, color: 'var(--text-3)' } as const

export function StoryField({ value, onChange, onBlur }: { value: string; onChange: (text: string) => void; onBlur: () => void }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    <label htmlFor="story" className="overline">Tu relato</label>
    <textarea id="story" className="textarea" rows={6} style={{ minHeight: 150 }} maxLength={10000} value={value}
      placeholder="Puedes empezar por lo que recuerdas, con tus propias palabras…" onChange={e => onChange(e.target.value)} onBlur={onBlur} />
    <span className="hint">Las fechas aproximadas son válidas. Puedes corregir el relato mientras siga en tu espacio privado.</span>
  </div>
}

export function NoteField({ value, disabled, onChange }: { value: string; disabled: boolean; onChange: (text: string) => void }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    <label htmlFor="note" className="overline">Nota privada <span style={noteHint}>· opcional, nunca forma parte del expediente</span></label>
    <textarea id="note" className="textarea" rows={2} style={{ fontSize: 14, lineHeight: '21px', padding: '12px 14px' }} maxLength={5000} value={value} disabled={disabled}
      onChange={e => onChange(e.target.value)} />
  </div>
}
