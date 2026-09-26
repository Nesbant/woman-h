import { useCallback, useEffect, useState } from 'react'
import * as cases from '../../api/cases'
import type { CaseDetail, CaseListing, CaseStatus, StepStatus } from '../../types'
import { useToast } from '../../components/Toast'
import { useAction } from '../../hooks/useAction'
import { useFailure } from '../../hooks/useFailure'

/** The institution's queue, the selected case and the tracking changes a member can make. Never touches private data. */
export function useCases(institutionId: string) {
  const [listing, setListing] = useState<CaseListing | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<CaseDetail | null>(null)
  const [loadError, setLoadError] = useState('')
  const action = useAction()
  const fail = useFailure()
  const { notify } = useToast()
  const load = useCallback(() => cases.listCases(institutionId).then(value => {
    setListing(value); setSelected(current => current ?? value.items[0]?.case_id ?? null)
  }).catch(e => fail(e, setLoadError)), [institutionId, fail])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!selected) { setDetail(null); return }
    let active = true
    cases.getCase(institutionId, selected).then(value => { if (active) setDetail(value) }).catch(e => { if (active) fail(e, setLoadError) })
    return () => { active = false }
  }, [institutionId, selected, fail])

  async function change(task: (caseId: string) => Promise<CaseDetail>, message?: string) {
    if (!detail || action.busy) return
    const next = await action.run(() => task(detail.case_id))
    if (!next) return
    setDetail(next); load()
    if (message) notify(message)
  }
  return {
    listing, detail, selected, select: setSelected, busy: action.busy, error: loadError || action.error,
    assign: (userId: string) => change(id => cases.assignCase(institutionId, id, userId), 'Responsable actualizado.'),
    setStatus: (status: CaseStatus) => change(id => cases.setCaseStatus(institutionId, id, status)),
    setStep: (step: string, status: StepStatus) => change(id => cases.setStepStatus(institutionId, id, step, status)),
    download: async (file: CaseDetail['files'][number]) => {
      if (!detail) return
      const blob = await action.run(() => cases.caseFile(institutionId, detail.case_id, file.id))
      if (!blob) return
      const url = URL.createObjectURL(blob), link = document.createElement('a')
      link.href = url; link.download = file.filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    },
  }
}
