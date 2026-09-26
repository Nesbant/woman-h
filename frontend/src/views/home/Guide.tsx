const GUIDE = [
  ['Lo registrado', 'Tus relatos, capturas, correos y documentos siguen disponibles para revisar.'],
  ['Eventos', 'Revisa o corrige las propuestas de VERA vinculadas a sus fuentes.'],
  ['Borrador', 'Puedes preparar y revisar un reporte cuando lo necesites.'],
  ['Compartir', 'Solo lo que autorices pasa al espacio institucional.'],
]

export function Guide() {
  return <aside className="col-side card guide" aria-label="Cómo funciona">
    <h3>También puedes revisar</h3>
    {GUIDE.map(([title, detail]) => <div className="guide-option" key={title}><strong>{title}</strong><span>{detail}</span></div>)}
  </aside>
}
