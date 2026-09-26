import { useCallback, useEffect, useState } from 'react'
import { listCases } from '../api/cases'
import { getOverview, listRecords } from '../api/records'
import type { Overview, RecordSummary, User } from '../types'
import { NEW_RECORD } from '../router'
import type { Route } from '../router'

function useLatestRecord(enabled: boolean, tick: number) {
  const [latest, setLatest] = useState<RecordSummary | null>(null)
  useEffect(() => {
    if (!enabled) return
    listRecords().then(items => setLatest([...items].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0] ?? null)).catch(() => {})
  }, [enabled, tick])
  return latest
}

function useOverview(recordId: string | undefined, enabled: boolean, tick: number, route: Route) {
  const [overview, setOverview] = useState<Overview | null>(null)
  useEffect(() => {
    if (!recordId || recordId === NEW_RECORD || !enabled) { setOverview(null); return }
    let active = true
    getOverview(recordId).then(value => { if (active) setOverview(value) }).catch(() => { if (active) setOverview(null) })
    return () => { active = false }
  }, [recordId, enabled, tick, route])
  return overview
}

function useCaseCount(institutionId: string | undefined, enabled: boolean, tick: number) {
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    if (!enabled || !institutionId) return
    listCases(institutionId).then(v => setCount(v.counts.received)).catch(() => {})
  }, [institutionId, enabled, tick])
  return count
}

export type ShellData = ReturnType<typeof useShellData>

/** What the sidebar and stepper show: the current (or latest) situation and, for members, the case count. */
export function useShellData(route: Route, user: User) {
  const [tick, setTick] = useState(0)
  const refresh = useCallback(() => setTick(v => v + 1), [])
  const institutional = route.name === 'institutional'
  const latest = useLatestRecord(!institutional, tick)
  const recordId = route.name === 'record' ? route.recordId
    : route.name === 'conversation' ? route.recordId ?? latest?.id : latest?.id
  const overview = useOverview(recordId, !institutional, tick, route)
  const caseCount = useCaseCount(user.memberships[0]?.institution_id, institutional, tick)
  return { institutional, recordId, overview, caseCount, refresh }
}
