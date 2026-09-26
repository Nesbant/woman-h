import { useEffect, useState } from 'react'
import { listFiles } from '../../api/files'
import { getAccount, getOverview } from '../../api/records'
import type { Account } from '../../api/records'
import type { Attachment } from '../../types'

/** Loads title, note, relato and evidence of an existing situation; a new one starts empty. */
export function useRegisterData(recordId: string, isNew: boolean, onStory: (a: Account | null) => void,
  onFiles: (files: Attachment[]) => void, onError: (e: unknown) => void) {
  const [title, setTitle] = useState('Nueva situación')
  const [note, setNote] = useState('')
  const [loaded, setLoaded] = useState(isNew)
  useEffect(() => {
    if (isNew) return
    let active = true
    Promise.all([getOverview(recordId), listFiles(recordId)]).then(async ([overview, files]) => {
      if (!active) return
      setTitle(overview.record.title); setNote(overview.record.private_note ?? ''); onFiles(files)
      onStory(overview.story ? await getAccount(recordId, overview.story.account_id) : null)
      if (active) setLoaded(true)
    }).catch(onError)
    return () => { active = false }
  }, [recordId, isNew, onStory, onFiles, onError])
  return { title, note, setNote, loaded }
}
