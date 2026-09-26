import { useCallback, useRef, useState } from 'react'
import { deleteRecord, getOverview, listRecords, renameRecord } from '../../api/records'
import type { Overview, User } from '../../types'
import { conversationPath, navigate, NEW_RECORD, recordPath } from '../../router'
import { firstName } from '../../format'
import { ErrorAlert, Loading } from '../../components/PageTitle'
import { AboutVera } from '../../components/AboutVera'
import { Modal } from '../../components/Overlays'
import { useToast } from '../../components/Toast'
import { useAction } from '../../hooks/useAction'
import { useResource } from '../../hooks/useResource'
import { useRecordContext } from '../../recordContext'
import { Guide } from './Guide'
import { PrivacyHero } from './PrivacyHero'
import { SituationCard } from './SituationCard'
import { DeleteDialog, RenameDialog } from './SituationDialogs'

async function loadSituations() {
  const records = await listRecords()
  return Promise.all([...records].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).map(r => getOverview(r.id)))
}

type Dialog = { kind: 'rename' | 'delete'; overview: Overview } | null

/** Rename and delete for the owner's situations. */
function useSituationActions(reload: () => void) {
  const [dialog, setDialog] = useState<Dialog>(null)
  const action = useAction()
  const { notify } = useToast()
  const { refresh } = useRecordContext()
  const done = (message: string) => { setDialog(null); notify(message); reload(); refresh() }
  const rename = async (title: string) => {
    if (dialog && await action.run(() => renameRecord(dialog.overview.record.id, title)) !== undefined) done('Nombre actualizado.')
  }
  const remove = async () => {
    if (!dialog) return
    const ok = await action.run(async () => { await deleteRecord(dialog.overview.record.id); return true })
    if (ok) done('Situación eliminada de tu espacio.')
  }
  const open = (kind: 'rename' | 'delete', overview: Overview) => { action.setError(''); setDialog({ kind, overview }) }
  return { dialog, close: () => setDialog(null), open, rename, remove, busy: action.busy, error: action.error }
}

export function Home({ user }: { user: User }) {
  const { data: situations, error, reload } = useResource(useCallback(loadSituations, []))
  const [aboutOpen, setAboutOpen] = useState(false)
  const aboutTrigger = useRef<HTMLButtonElement>(null)
  const closeAbout = () => { setAboutOpen(false); aboutTrigger.current?.focus() }
  const actions = useSituationActions(reload)
  const create = () => navigate(recordPath(NEW_RECORD, 'registrar'))
  return <>
    <section className="home-welcome" aria-labelledby="home-title">
      <div className="home-welcome-copy">
        <span className="home-welcome-eyebrow">Un espacio para ti</span>
        <h1 id="home-title">Hola, {firstName(user.name)}</h1>
        <h2 className="home-welcome-heading">No tienes que atravesarlo todo a solas.</h2>
        <p className="home-welcome-lead">Conversa con VERA o vuelve a tus situaciones cuando lo necesites. Guardar algo aquí no significa haberlo reportado.</p>
        <div className="home-welcome-actions">
          <button className="btn btn-primary" onClick={() => navigate(conversationPath())}>Conversar con VERA</button>
          <button className="btn btn-secondary" onClick={create}>Registrar algo nuevo</button>
        </div>
        <button ref={aboutTrigger} type="button" className="home-about-link" aria-haspopup="dialog" onClick={() => setAboutOpen(true)}>Conoce VERA</button>
      </div>
      <div className="home-welcome-art"><img src="/images/vera-companion-resting.jpeg" alt="Ilustración decorativa de VERA, un perrito lavanda recostado" /></div>
    </section>
    <PrivacyHero />
    <div className="two-col">
      <div className="col-main">
        <span className="eyebrow muted">Tus situaciones</span>
        <ErrorAlert message={error} />
        {!situations ? !error && <Loading text="Cargando tus situaciones…" /> : situations.map(item =>
          <SituationCard key={item.record.id} overview={item} onRename={() => actions.open('rename', item)} onDelete={() => actions.open('delete', item)} />)}
        <button className="add-new" onClick={create}><span className="plus" aria-hidden="true">+</span>
          <span><strong>Registrar algo nuevo</strong><span>Puedes empezar contando lo que pasó o añadiendo una captura o un documento. No necesitas tenerlo todo en orden.</span></span></button>
      </div>
      <Guide />
    </div>
    {actions.dialog?.kind === 'rename' && <RenameDialog overview={actions.dialog.overview} busy={actions.busy} error={actions.error} onSave={actions.rename} onCancel={actions.close} />}
    {actions.dialog?.kind === 'delete' && <DeleteDialog overview={actions.dialog.overview} busy={actions.busy} error={actions.error} onDelete={actions.remove} onCancel={actions.close} />}
    {aboutOpen && <Modal labelledBy="about-vera-dialog-title" onClose={closeAbout}>
      <div className="modal-head plain"><strong id="about-vera-dialog-title">Conoce VERA</strong>
        <button className="close" aria-label="Cerrar presentación" autoFocus onClick={closeAbout}>✕</button></div>
      <div className="about-vera-modal"><AboutVera /></div>
    </Modal>}
  </>
}
