import { useCallback, useEffect, useRef, useState } from 'react'
import { getCaseState, getConversation, sendMessage, startConversation } from '../../api/chat'
import { deleteFile, uploadFile } from '../../api/files'
import { getTimeline, reviewEvent } from '../../api/timeline'
import type { EventInput } from '../../api/timeline'
import type { CaseEvent, CaseState, ChatMessage, ChatTurn, SuggestedAction } from '../../types'
import { navigate, conversationPath, recordPath } from '../../router'
import { PageTitle } from '../../components/PageTitle'
import { useFailure } from '../../hooks/useFailure'
import { useRecordContext } from '../../recordContext'
import { Composer } from './Composer'
import type { ComposerAttachment } from './AttachmentChips'
import { UnderstandingPanel } from './UnderstandingPanel'
import { SuggestedActions } from './SuggestedActions'

type Pending = { id: string; text: string; attachmentIds: string[]; status: 'sending' | 'failed' }

function addTurn(messages: ChatMessage[], turn: ChatTurn, clientId: string) {
  const withoutOptimistic = messages.filter(message => message.client_message_id !== clientId)
  return [turn.user_message, turn.assistant_message].reduce<ChatMessage[]>((current, message) =>
    current.some(item => item.id === message.id) ? current : [...current, message], withoutOptimistic)
}

export function ConversationView({ recordId }: { recordId?: string }) {
  const { overview, refresh } = useRecordContext()
  const fail = useFailure()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(!!recordId)
  const [loadError, setLoadError] = useState('')
  const [sendError, setSendError] = useState('')
  const [pending, setPending] = useState<Pending | null>(null)
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([])
  const [caseState, setCaseState] = useState<CaseState | null>(null)
  const [changedIds, setChangedIds] = useState<string[]>([])
  const [lastActions, setLastActions] = useState<SuggestedAction[]>([])
  const [reviewBusyId, setReviewBusyId] = useState<string | null>(null)
  const [reviewError, setReviewError] = useState('')
  const [reviewNotice, setReviewNotice] = useState('')
  const [configuredMode, setConfiguredMode] = useState<string | null>(null)
  const reviewing = useRef<string | null>(null)
  const inFlight = useRef<string | null>(null)
  const createdId = useRef<string | undefined>(undefined)
  const creating = useRef<Promise<string> | null>(null)
  const skipLoadId = useRef<string | undefined>(undefined)
  const generation = useRef(0)
  const end = useRef<HTMLDivElement>(null)

  const loadConversation = useCallback((id: string, current: number) => {
    setLoadError('')
    setLoading(true)
    getConversation(id).then(view => {
      if (generation.current === current) { setMessages(view.messages); setCaseState(view.case_state) }
    }).catch(error => { if (generation.current === current) fail(error, setLoadError) })
      .finally(() => { if (generation.current === current) setLoading(false) })
  }, [fail])

  useEffect(() => {
    const current = ++generation.current
    if (recordId && skipLoadId.current === recordId) { skipLoadId.current = undefined; return }
    createdId.current = undefined
    creating.current = null
    inFlight.current = null
    reviewing.current = null
    setDraft('')
    setMessages([])
    setAttachments([])
    setCaseState(null)
    setChangedIds([])
    setLastActions([])
    setReviewBusyId(null)
    setReviewError('')
    setReviewNotice('')
    setPending(null)
    setLoadError('')
    setSendError('')
    if (recordId) loadConversation(recordId, current)
    else setLoading(false)
  }, [recordId, loadConversation])

  useEffect(() => { end.current?.scrollIntoView?.({ block: 'end' }) }, [messages, pending, loading])

  useEffect(() => {
    if (import.meta.env.VITE_CHAT_MOCK === '1') { setConfiguredMode('fixture'); return }
    const id = recordId ?? overview?.record.id
    if (!id) { setConfiguredMode(null); return }
    let active = true
    setConfiguredMode(null)
    Promise.resolve().then(() => getTimeline(id)).then(timeline => {
      if (active) setConfiguredMode(timeline.configured_mode)
    }).catch(() => { if (active) setConfiguredMode(null) })
    return () => { active = false }
  }, [recordId, overview?.record.id])

  async function reloadCaseState(id: string, current = generation.current) {
    try {
      const state = await getCaseState(id)
      if (generation.current === current) { setCaseState(state); setReviewError('') }
      return true
    } catch (error) {
      if (generation.current === current) fail(error, setReviewError)
      return false
    }
  }

  async function reviewCandidate(event: CaseEvent, status: 'accepted' | 'discarded', content?: Partial<EventInput>) {
    if (!recordId || reviewing.current) return false
    reviewing.current = event.id
    const current = generation.current
    setReviewBusyId(event.id)
    setReviewError('')
    setReviewNotice('')
    try {
      const timeline = await getTimeline(recordId)
      const item = timeline.events.find(value => value.id === event.id)
      if (!item) throw new Error('Este hecho aún no está disponible en la cronología. Intenta nuevamente más tarde.')
      await reviewEvent(recordId, timeline.revision, item, status, content)
      refresh()
      if (generation.current !== current) return false
      if (!await reloadCaseState(recordId, current)) return false
      setReviewNotice(status === 'discarded' ? 'Hecho descartado.' : content ? 'Corrección guardada.' : 'Hecho confirmado.')
      return true
    } catch (error) {
      if (generation.current === current) fail(error, setReviewError)
      return false
    } finally {
      if (reviewing.current === event.id) { reviewing.current = null; setReviewBusyId(null) }
    }
  }

  async function ensureRecord() {
    if (recordId) return recordId
    if (createdId.current) return createdId.current
    if (!creating.current) creating.current = startConversation().then(({ case_id }) => {
      createdId.current = case_id
      return case_id
    }).finally(() => { creating.current = null })
    return creating.current
  }

  async function upload(file: File, description: string) {
    const key = crypto.randomUUID()
    const current = generation.current
    setAttachments(items => [...items, { key, name: file.name, status: 'uploading' }])
    try {
      const id = await ensureRecord()
      const saved = await uploadFile(id, file, description)
      if (generation.current !== current) return
      setAttachments(items => items.map(item => item.key === key ? { ...item, status: 'ready', id: saved.id } : item))
      if (!recordId) {
        skipLoadId.current = id
        navigate(conversationPath(id))
      }
      refresh()
      if (recordId) void reloadCaseState(id, current)
    } catch (error) {
      if (generation.current === current) fail(error, message => setAttachments(items => items.map(item => item.key === key
        ? { ...item, status: 'error', error: message } : item)))
    }
  }

  async function removeAttachment(file: ComposerAttachment) {
    if (!file.id) { setAttachments(items => items.filter(item => item.key !== file.key)); return }
    const current = generation.current
    const id = recordId ?? createdId.current
    if (!id) return
    setAttachments(items => items.map(item => item.key === file.key ? { ...item, status: 'removing' } : item))
    try {
      await deleteFile(id, file.id)
      if (generation.current === current) {
        setAttachments(items => items.filter(item => item.key !== file.key))
        refresh()
      }
    } catch (error) {
      if (generation.current === current) fail(error, message => setAttachments(items => items.map(item => item.key === file.key
        ? { ...item, status: 'error', error: message } : item)))
    }
  }

  async function deliver(message: Pending) {
    if (inFlight.current) return
    inFlight.current = message.id
    const current = generation.current
    setPending({ ...message, status: 'sending' })
    setSendError('')
    try {
      const id = await ensureRecord()
      if (generation.current !== current) return
      const turn = await sendMessage(id, message.text, message.id, message.attachmentIds)
      if (generation.current !== current) return
      setMessages(items => addTurn(items, turn, message.id))
      setCaseState(turn.case_state)
      setChangedIds((turn as ChatTurn & { changed_event_ids?: string[] }).changed_event_ids ?? turn.touched_event_ids)
      setLastActions(turn.suggested_actions)
      setAttachments(items => items.filter(item => !item.id || !message.attachmentIds.includes(item.id)))
      setPending(null)
      if (!recordId) {
        skipLoadId.current = id
        navigate(conversationPath(id))
        refresh()
      }
    } catch (error) {
      if (generation.current === current) {
        setPending({ ...message, status: 'failed' })
        fail(error, setSendError)
      }
    } finally { if (inFlight.current === message.id) inFlight.current = null }
  }

  function submit() {
    const text = draft.trim()
    if (!text || inFlight.current || pending || loading || loadError || attachments.some(file => file.status !== 'ready')) return
    const attachmentIds = attachments.map(file => file.id!).filter(Boolean)
    const id = crypto.randomUUID()
    const optimistic: ChatMessage = {
      id, role: 'user', text, created_at: new Date().toISOString(), client_message_id: id,
      intent: null, attachment_ids: attachmentIds, event_ids: [],
    }
    setMessages(items => [...items, optimistic])
    setDraft('')
    void deliver({ id, text, attachmentIds, status: 'sending' })
  }

  const title = recordId ? overview?.record.id === recordId ? overview.record.title : 'Esta situación' : 'Conversa con VERA'
  return <>
    <PageTitle eyebrow="Conversación" title={title} lead={recordId
      ? 'Este espacio está vinculado a esta situación. Puedes volver a revisar lo registrado cuando quieras.'
      : 'Este es tu espacio privado para conversar con VERA a tu ritmo.'} />
    <div className="conversation-layout"><section className="card conversation" aria-label="Espacio de conversación">
      <div className="conversation-mode" role="note" aria-label="Modo de conversación">
        {configuredMode === 'ai' ? 'IA conectada: tus mensajes se procesan con el proveedor configurado'
          : configuredMode === 'fixture' || configuredMode === 'demo' ? 'Modo demostración'
            : configuredMode === 'extractive' ? 'Modo sin IA conectada' : 'Verificando el modo de conversación…'}
      </div>
      {loading && <p role="status" className="loading">Cargando conversación…</p>}
      {loadError && <div role="alert" className="error">{loadError} <button className="btn btn-secondary btn-sm" onClick={() => { if (recordId) loadConversation(recordId, generation.current) }}>Reintentar</button></div>}
      <div className="conversation-log" role="log" aria-label="Mensajes de la conversación" aria-live="polite" aria-relevant="additions text">
        {!loading && !loadError && messages.length === 0 && <div className="conversation-empty">
          <h2>¿Qué pasó? Puedes empezar por donde quieras.</h2>
          <p>Lo que cuentes queda en tu espacio privado. Tú decides si quieres compartir algo más adelante.</p>
        </div>}
        {messages.map(message => <article className={`chat-message ${message.role}`} key={message.id}>
          <strong>{message.role === 'user' ? 'Tú' : 'VERA'}</strong>
          <p>{message.text}</p>
          {message.attachment_ids.length > 0 && <span className="small">{message.attachment_ids.length} {message.attachment_ids.length === 1 ? 'archivo adjunto' : 'archivos adjuntos'}</span>}
          {pending?.id === message.client_message_id && <span className="small">{pending.status === 'sending' ? 'Enviando…' : 'No se envió'}</span>}
        </article>)}
        <div ref={end} />
      </div>
      <SuggestedActions actions={lastActions} recordId={recordId} state={caseState} busy={!!reviewBusyId}
        onConfirm={event => void reviewCandidate(event, 'accepted')} onKeepTalking={() => document.getElementById('chat-text')?.focus()} />
      {sendError && <div role="alert" className="error">{sendError} <button className="btn btn-secondary btn-sm" onClick={() => { if (pending?.status === 'failed') void deliver(pending) }}>Reintentar</button></div>}
      <Composer text={draft} onTextChange={setDraft} onSend={submit} onUpload={upload} onRemove={file => void removeAttachment(file)}
        files={attachments} disabled={loading || !!loadError} sending={!!pending} />
    </section>
      <UnderstandingPanel state={caseState} changedIds={changedIds} busyId={reviewBusyId} error={reviewError} notice={reviewNotice}
        onReview={reviewCandidate} onRetry={() => { if (recordId) void reloadCaseState(recordId) }}
        onOpenTimeline={() => { if (recordId) navigate(recordPath(recordId, 'entender')) }} />
    </div>
  </>
}
