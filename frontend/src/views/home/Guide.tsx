const GUIDE = [
  ['Agrega lo que tengas', 'Relatos, capturas, correos o documentos.'],
  ['VERA propone una estructura', 'Eventos y relaciones, siempre vinculados a sus fuentes.'],
  ['Tú revisas', 'Confirma, corrige o descarta antes de usar la información.'],
  ['Tú decides qué compartir', 'Solo lo autorizado pasa al espacio institucional.'],
]

export function Guide() {
  return <aside className="col-side card guide" aria-label="Cómo funciona">
    <h3>Cómo funciona</h3>
    {GUIDE.map(([title, detail], i) => <div className="numbered" key={title}><span>{i + 1}</span><div><strong>{title}</strong><span>{detail}</span></div></div>)}
  </aside>
}
