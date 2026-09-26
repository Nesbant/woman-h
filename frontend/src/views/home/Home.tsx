import { useCallback, useState } from 'react'
import { deleteRecord, getOverview, listRecords, renameRecord } from '../../api/records'
import type { Overview, User } from '../../types'
import { navigate, NEW_RECORD, recordPath } from '../../router'
import { firstName } from '../../format'
import { ErrorAlert, Loading, PageTitle } from '../../components/PageTitle'
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
  const actions = useSituationActions(reload)
  const create = () => navigate(recordPath(NEW_RECORD, 'registrar'))
  return <>
    <PageTitle eyebrow="Espacio privado" title={`Hola, ${firstName(user.name)}`} lead="Ordena lo que ocurrió a tu ritmo. Guardar algo aquí no significa haberlo reportado.">
      <button className="btn btn-primary" onClick={create}>+ Registrar una situación</button>
    </PageTitle>
    <PrivacyHero />
    <div className="two-col">
      <div className="col-main">
        <span className="eyebrow muted">Tus situaciones</span>
        <ErrorAlert message={error} />
        {!situations ? !error && <Loading text="Cargando tus situaciones…" /> : situations.map(item =>
          <SituationCard key={item.record.id} overview={item} onRename={() => actions.open('rename', item)} onDelete={() => actions.open('delete', item)} />)}
        <button className="add-new" onClick={create}><span className="plus" aria-hidden="true">+</span>
          <span><strong>Registrar algo nuevo</strong><span>Empieza con un relato, una captura o un documento. No necesitas tener la secuencia clara.</span></span></button>
      </div>
      <Guide />
    </div>
    {actions.dialog?.kind === 'rename' && <RenameDialog overview={actions.dialog.overview} busy={actions.busy} error={actions.error} onSave={actions.rename} onCancel={actions.close} />}
    {actions.dialog?.kind === 'delete' && <DeleteDialog overview={actions.dialog.overview} busy={actions.busy} error={actions.error} onDelete={actions.remove} onCancel={actions.close} />}
  </>
}
