import { useState } from 'react'
import { deleteFile, describeFile, uploadFile } from '../../api/files'
import type { Attachment } from '../../types'
import { useAction } from '../../hooks/useAction'

/** Evidence of one situation: upload, describe again and delete. */
export function useEvidence(recordId: string, onChanged: () => void) {
  const [files, setFiles] = useState<Attachment[]>([])
  const action = useAction()
  const replace = (next: Attachment) => setFiles(list => list.map(f => f.id === next.id ? next : f))
  const upload = async (file: File, description: string) => {
    const saved = await action.run(() => uploadFile(recordId, file, description))
    if (saved) { setFiles(list => [...list, saved]); onChanged() }
    return !!saved
  }
  const describe = async (file: Attachment, description: string) => {
    const saved = await action.run(() => describeFile(recordId, file, description))
    if (saved) { replace(saved); onChanged() }
    return !!saved
  }
  const remove = async (file: Attachment) => {
    const ok = await action.run(async () => { await deleteFile(recordId, file.id); return true })
    if (ok) { setFiles(list => list.filter(f => f.id !== file.id)); onChanged() }
    return !!ok
  }
  return { files, setFiles, upload, describe, remove, busy: action.busy, error: action.error, clearError: () => action.setError('') }
}
