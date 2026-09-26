const GUIDE = [
  ['Lo que guardaste', 'Revisa tus relatos, capturas, correos y documentos.'],
  ['Qué pasó y cuándo', 'Revisa y corrige la secuencia que propone VERA a partir de lo que guardaste.'],
  ['Tu borrador de reporte', 'Prepáralo y revísalo a tu ritmo.'],
  ['Decidir qué compartir', 'Revisa qué información enviarás antes de hacerlo.'],
]

export function Guide() {
  return <aside className="col-side card guide" aria-label="Cómo funciona">
    <h3>También puedes revisar</h3>
    {GUIDE.map(([title, detail]) => <div className="guide-option" key={title}><strong>{title}</strong><span>{detail}</span></div>)}
  </aside>
}
