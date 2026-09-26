import { LockIcon } from '../../components/icons'

export function RegisterAside() {
  return <aside className="col-side">
    <div className="callout"><span className="icon"><LockIcon size={16} /></span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><strong>Solo tú puedes ver esto.</strong><span style={{ fontSize: 13, lineHeight: '19px' }}>Añadir evidencia no la envía a tu organización.</span></div></div>
    <div className="card guide" style={{ padding: 18, gap: 14 }}>
      <h3 style={{ fontSize: 16, lineHeight: '22px' }}>No necesitas completar todo</h3>
      <div className="numbered warn"><span>≈</span><div><strong>Fechas aproximadas son válidas</strong><span>VERA puede usar “mediados de septiembre” hasta que confirmes algo más preciso.</span></div></div>
      <div className="numbered"><span>?</span><div><strong>Los vacíos quedan visibles</strong><span>VERA no inventará datos para completar un formulario.</span></div></div>
    </div>
  </aside>
}
