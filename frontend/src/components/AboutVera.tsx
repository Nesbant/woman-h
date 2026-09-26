function InfoIcon({ kind }: { kind: 'time' | 'words' | 'choice' }) {
  const shared = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, 'aria-hidden': true as const }
  if (kind === 'time') return <svg {...shared}><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></svg>
  if (kind === 'words') return <svg {...shared}><path d="M5 5h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 3v-3a2 2 0 0 1-1-2V7a2 2 0 0 1 2-2Z" /><path d="M7 10h10M7 13h7" /></svg>
  return <svg {...shared}><circle cx="12" cy="12" r="8" /><path d="m8.5 12 2.5 2.5 4.5-5" /></svg>
}

const CARDS = [
  { title: 'A tu ritmo', text: 'Puedes tomarte el tiempo que necesites y decidir por dónde empezar.', icon: 'time' },
  { title: 'Tus palabras importan', text: 'No necesitas tenerlo todo ordenado para comenzar a contar lo que pasó.', icon: 'words' },
  { title: 'Tú decides', text: 'Guardar una situación no la reporta. Si llegas a compartirla, eliges qué enviar y debes confirmarlo.', icon: 'choice' },
] as const

/** Shared by the login page and the private-space information dialog. */
export function AboutVera() {
  return <div className="about-vera">
    <section className="about-intro" aria-labelledby="about-vera-heading">
      <div className="about-intro-copy">
        <h2 id="about-vera-heading">¿Qué es VERA?</h2>
        <p>A veces cuesta encontrar las palabras para contar lo que pasó. VERA es una herramienta que te ayuda a conversar, ordenar una situación y guardar lo que quieras recordar. Puedes empezar por donde te resulte más cómodo, a tu propio ritmo.</p>
      </div>
      <div className="about-card-grid">
        {CARDS.map(card => <article className="about-card" key={card.title}>
          <span className="about-card-icon"><InfoIcon kind={card.icon} /></span>
          <h3>{card.title}</h3><p>{card.text}</p>
        </article>)}
      </div>
    </section>
    <section className="about-companion" aria-labelledby="about-companion-heading">
      <div className="about-companion-art"><img src="/images/vera-companion-sitting.jpeg" alt="Ilustración del compañero VERA, un perrito lavanda con un corazón y candado" /></div>
      <div className="about-companion-copy">
        <h2 id="about-companion-heading">Conoce a tu compañero VERA</h2>
        <p className="about-companion-highlight">Un pequeño recordatorio: puedes ir a tu ritmo.</p>
        <p>Este pequeño compañero representa la cercanía y el cuidado que queremos transmitir en VERA. Su corazón con candado simboliza el respeto por lo que compartes. Está presente para recordarte que puedes tomarte tu tiempo y empezar con tus propias palabras.</p>
        <p className="about-virtual-note">VERA es un asistente virtual. En la conversación se muestra el modo de funcionamiento activo.</p>
      </div>
    </section>
  </div>
}
