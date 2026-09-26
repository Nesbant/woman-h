import type { Attachment } from '../../types'
import type { DrawerSource } from '../../components/SourceDrawer'
import { useToast } from '../../components/Toast'
import { EvidenceRow } from './EvidenceRow'
import { UploadForm } from './UploadForm'
import type { useEvidence } from './useEvidence'

export function EvidenceList({ evidence, isNew, onView }: { evidence: ReturnType<typeof useEvidence>; isNew: boolean; onView: (source: DrawerSource) => void }) {
  const { notify } = useToast()
  const tell = (message: string) => (ok: boolean) => { if (ok) notify(message); return ok }
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
      <span className="overline">Evidencias</span><span className="hint">Agrégalas aunque no sepas a qué momento corresponden.</span>
    </div>
    {evidence.files.map((file: Attachment) => <EvidenceRow key={file.id} file={file} busy={evidence.busy}
      onView={() => onView({ kind: 'file', source_id: file.id, label: file.filename })}
      onDescribe={text => evidence.describe(file, text).then(tell('Descripción actualizada.'))}
      onDelete={() => evidence.remove(file).then(tell('Evidencia eliminada de tu espacio.'))} />)}
    <UploadForm disabled={isNew} busy={evidence.busy} onPick={evidence.clearError}
      onUpload={(file, description) => evidence.upload(file, description).then(tell('Evidencia guardada en tu espacio privado.'))} />
    {isNew && <span className="small">Escribe tu relato para empezar; luego podrás adjuntar evidencia.</span>}
  </div>
}
