import { useCallback, useState } from 'react'
import { listFiles } from '../../api/files'
import { navigate, recordPath } from '../../router'
import { LockIcon } from '../../components/icons'
import { ErrorAlert, Loading, PageTitle } from '../../components/PageTitle'
import { SourceDrawer } from '../../components/SourceDrawer'
import type { DrawerSource } from '../../components/SourceDrawer'
import { useToast } from '../../components/Toast'
import { useResource } from '../../hooks/useResource'
import { useRecordContext } from '../../recordContext'
import { EvidenceSection, evidenceRows, FactsSection, MeasuresSection } from './EvidenceSections'
import { DraftStatus } from './DraftStatus'
import { AffectedSection, ReporterSection, RespondentSection } from './PeopleSections'
import { useCurrentDraft } from './useCurrentDraft'
import { useDraftEditor } from './useDraftEditor'

export function Draft({ recordId }: { recordId: string }) {
  const { state, setState, error, setError } = useCurrentDraft(recordId)
  const { data: files } = useResource(useCallback(() => listFiles(recordId), [recordId]))
  const editor = useDraftEditor(recordId, state, setState, setError)
  const [drawer, setDrawer] = useState<DrawerSource | null>(null)
  const { overview, refresh } = useRecordContext()
  const { notify } = useToast()
  const draft = state?.draft
  const form = editor.form
  const goShare = async () => { await editor.flush(); refresh(); navigate(recordPath(recordId, 'compartir')) }
  const confirmPerson = async () => { if (await editor.confirmPerson()) { notify('Identidad confirmada por ti.'); refresh() } }
  const rows = form ? evidenceRows(form, files ?? []) : []
  const excluded = overview ? overview.timeline.total - overview.timeline.accepted : 0
  return <>
    <PageTitle eyebrow="Borrador estructurado · Paso 3 de 4" title="Preparar reporte" lead="Basado únicamente en información que revisaste. Todos los campos se pueden editar.">
      <button className="btn btn-primary" onClick={goShare} disabled={!draft}>Revisar y compartir →</button>
    </PageTitle>
    <div className="callout"><span className="icon"><LockIcon size={16} /></span>
      <span><strong>Este borrador sigue siendo privado.</strong> Prepararlo no crea un caso. Tu organización solo recibirá información después de tu confirmación explícita.</span></div>
    <ErrorAlert message={error} />
    {!form || !draft || !state ? !error && <Loading text="Preparando tu borrador…" /> : <div className="two-col">
      <div className="col-main">
        <AffectedSection form={form} change={editor.change} />
        <RespondentSection form={form} change={editor.change} onConfirm={confirmPerson} />
        <ReporterSection form={form} change={editor.change} />
        <FactsSection recordId={recordId} form={form} draft={draft} excluded={excluded} change={editor.change} onSource={setDrawer} />
        <EvidenceSection rows={rows} />
        <MeasuresSection form={form} options={state.measure_options} change={editor.change} />
      </div>
      <DraftStatus facts={form.facts.events.length} evidence={rows.length} measures={form.protection_measures.selected.length} saving={editor.saving} pending={draft.pending} />
    </div>}
    {drawer && <SourceDrawer recordId={recordId} source={drawer} events={[]} onClose={() => setDrawer(null)} />}
  </>
}
