import { useCallback, useState } from 'react'
import { markReviewed, submitCase } from '../../api/complaint'
import { listFiles } from '../../api/files'
import { navigate, recordPath } from '../../router'
import { ErrorAlert, Loading, PageTitle } from '../../components/PageTitle'
import { useToast } from '../../components/Toast'
import { useAction } from '../../hooks/useAction'
import { useResource } from '../../hooks/useResource'
import { useRecordContext } from '../../recordContext'
import { useCurrentDraft } from '../draft/useCurrentDraft'
import { PreviewModal } from './PreviewModal'
import { OrgSummary, PrivatePanel, SharedPanel } from './SelectionPanels'
import { useDestination } from './useDestination'
import { useShareSelection } from './useShareSelection'

export function Share({ recordId }: { recordId: string }) {
  const { state, setState, error } = useCurrentDraft(recordId)
  const { data: files } = useResource(useCallback(() => listFiles(recordId), [recordId]))
  const destination = useDestination()
  const draft = state?.draft
  const selection = useShareSelection(draft, files)
  const [preview, setPreview] = useState(false)
  const action = useAction()
  const { overview, refresh } = useRecordContext()
  const { notify } = useToast()
  const sent = overview?.submissions[0]

  async function openPreview() {
    if (!draft) return
    const next = draft.reviewed ? state : await action.run(() => markReviewed(recordId, draft.revision))
    if (next) { setState(next); setPreview(true) }
  }
  async function submit() {
    if (!state?.draft || !destination) return
    const receipt = await action.run(() => submitCase(recordId, { draftRevision: state.draft!.revision, institutionId: destination.id,
      eventIds: selection.facts.map(f => f.event_id), fileIds: selection.files.map(f => f.id) }))
    if (!receipt) { setPreview(false); return }
    notify(`Caso ${receipt.case_id} creado · snapshot institucional v1`)
    refresh(); navigate(recordPath(recordId, 'enviado'))
  }
  const hidden = ['relato personal completo', 'nota privada', ...selection.kept.map(r => r.name)]
  return <>
    <PageTitle eyebrow="Autorización explícita · Paso 4 de 4" title="Decide exactamente qué compartir"
      lead="Tener información en VERA no significa haberla reportado. Solo lo que selecciones pasará a tu organización." />
    {sent && <div className="callout ok"><span><strong>Ya enviaste el caso {sent.case_id} (snapshot v1).</strong> Si envías otra vez, se creará un caso nuevo con lo que selecciones; el snapshot enviado no cambia.</span></div>}
    <ErrorAlert message={error || action.error} />
    {!draft || !files || !selection.ready ? !error && <Loading text="Preparando la selección…" /> : <div className="two-col">
      <div className="col-main">
        <SharedPanel rows={selection.shared} onToggle={selection.toggle} />
        <PrivatePanel rows={selection.kept} onToggle={selection.toggle} />
      </div>
      <OrgSummary events={selection.facts.length} files={selection.files.length} organization={destination?.name ?? null} onPreview={openPreview} />
    </div>}
    {preview && draft && destination && <PreviewModal fields={draft.fields} options={state!.measure_options} facts={selection.facts} files={selection.files}
      hidden={hidden} organization={destination.name} sending={action.busy} onClose={() => setPreview(false)} onSubmit={submit} />}
  </>
}
