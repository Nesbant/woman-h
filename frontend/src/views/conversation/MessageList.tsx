import { memo } from 'react'
import type { RefObject } from 'react'
import type { ChatMessage } from '../../types'

type Props = {
  messages: ChatMessage[]
  showEmpty: boolean
  pendingId?: string
  pendingStatus?: 'sending' | 'failed'
  endRef: RefObject<HTMLDivElement | null>
}

/** Kept as its own memoized component so typing in the composer (state that lives there now) never re-renders the message log. */
function MessageListImpl({ messages, showEmpty, pendingId, pendingStatus, endRef }: Props) {
  return <div className="conversation-log" role="log" aria-label="Mensajes de la conversación" aria-live="polite" aria-relevant="additions text">
    {showEmpty && <div className="conversation-empty">
      <h2>¿Qué pasó? Puedes empezar por donde quieras.</h2>
      <p>Lo que cuentes queda en tu espacio privado. Tú decides si quieres compartir algo más adelante.</p>
    </div>}
    {messages.map(message => <article className={`chat-message ${message.role}`} key={message.id}>
      <strong>{message.role === 'user' ? 'Tú' : 'VERA'}</strong>
      <p>{message.text}</p>
      {message.attachment_ids.length > 0 && <span className="small">{message.attachment_ids.length} {message.attachment_ids.length === 1 ? 'archivo adjunto' : 'archivos adjuntos'}</span>}
      {pendingId === message.client_message_id && <span className="small">{pendingStatus === 'sending' ? 'Enviando…' : 'No se envió'}</span>}
    </article>)}
    <div ref={endRef} />
  </div>
}

export const MessageList = memo(MessageListImpl)
