import { useCallback, useState } from 'react'
import { saveNote } from '../../api/records'
import { navigate, recordPath } from '../../router'
import { ErrorAlert, Loading, PageTitle } from '../../components/PageTitle'
import { SourceDrawer } from '../../components/SourceDrawer'
import type { DrawerSource } from '../../components/SourceDrawer'
import { useFailure } from '../../hooks/useFailure'
import { useRecordContext } from '../../recordContext'
import { EvidenceList } from './EvidenceList'
import { NoteField, StoryField } from './Fields'
import { RegisterAside } from './RegisterAside'
import { useAutosave } from './useAutosave'
import { useEvidence } from './useEvidence'
import { useRegisterData } from './useRegisterData'
import { useStory } from './useStory'

export function Register({ recordId }: { recordId: string }) {
  const { refresh } = useRecordContext()
  const fail = useFailure()
  const [error, setError] = useState('')
  const [drawer, setDrawer] = useState<DrawerSource | null>(null)
  const onError = useCallback((e: unknown) => fail(e, setError), [fail])
  const story = useStory(recordId, refresh)
  const evidence = useEvidence(recordId, refresh)
  const autosave = useAutosave(onError)
  const data = useRegisterData(recordId, story.isNew, story.load, evidence.setFiles, onError)
  const saveStory = (text: string) => autosave.run(() => story.save(text))

  async function understand() {
    autosave.cancel()
    story.goTo('entender')
    if (story.isNew) { await saveStory(story.story); return }
    if (story.unsaved()) await saveStory(story.story)
    navigate(recordPath(recordId, 'entender'))
  }
  return <>
    <PageTitle eyebrow={`${data.title} · Paso 1 de 4`} title="Cuéntanos qué pasó o agrega lo que tengas"
      lead="No necesitas ordenar la información. Escribe de forma libre y añade evidencia cuando quieras." />
    <ErrorAlert message={error || evidence.error} />
    {!data.loaded ? !error && <Loading text="Cargando tu registro…" /> : <div className="two-col">
      <div className="col-main card xl raised" style={{ padding: 24, gap: 22 }}>
        <StoryField value={story.story}
          onChange={text => { story.setStory(text); if (!story.isNew) autosave.schedule('story', () => story.save(text)) }}
          onBlur={() => { if (story.isNew && story.story.trim()) saveStory(story.story) }} />
        <EvidenceList evidence={evidence} isNew={story.isNew} onView={setDrawer} />
        <NoteField value={data.note} disabled={story.isNew} onChange={text => { data.setNote(text); autosave.schedule('note', () => saveNote(recordId, text)) }} />
        <div className="form-foot">
          <span className="hint" role="status">{autosave.saving ? 'Guardando…' : 'Guardado automáticamente · solo en tu espacio'}</span>
          <button className="btn btn-primary" onClick={understand} disabled={story.isNew && !story.story.trim()}>Entender lo ocurrido →</button>
        </div>
      </div>
      <RegisterAside />
    </div>}
    {drawer && !story.isNew && <SourceDrawer recordId={recordId} source={drawer} events={[]} onClose={() => setDrawer(null)} />}
  </>
}
