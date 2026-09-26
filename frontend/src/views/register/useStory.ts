import { useCallback, useRef, useState } from 'react'
import { createAccount, startRecord, updateAccount } from '../../api/records'
import type { Account } from '../../api/records'
import { navigate, NEW_RECORD, recordPath } from '../../router'

export type Destination = 'registrar' | 'entender'

/** The relato: creates the situation on first save (once, even if blur and click race) and autosaves edits. */
export function useStory(recordId: string, onSaved: () => void) {
  const [story, setStory] = useState('')
  const account = useRef<Account | null>(null)
  const entry = useRef(crypto.randomUUID())
  const creating = useRef<Promise<string> | null>(null)
  const destination = useRef<Destination>('registrar')
  const isNew = recordId === NEW_RECORD

  function create(text: string) {
    creating.current ??= startRecord(entry.current, text).then(created => created.record_id)
      .catch(error => { creating.current = null; throw error })
    return creating.current
  }
  async function save(text: string) {
    if (!text.trim()) return
    if (isNew) {
      const id = await create(text)
      // Read the destination after creating: a click on "Entender" during the save must win over the blur.
      onSaved(); navigate(recordPath(id, destination.current))
      return
    }
    account.current = account.current ? await updateAccount(recordId, account.current, text) : await createAccount(recordId, text)
    onSaved()
  }
  const load = useCallback((value: Account | null) => { account.current = value; setStory(value?.description ?? '') }, [])
  const goTo = (target: Destination) => { destination.current = target }
  const unsaved = () => story.trim() !== '' && story !== account.current?.description
  return { story, setStory, save, load, goTo, unsaved, isNew }
}
