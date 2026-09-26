import { useCallback, useEffect, useRef, useState } from 'react'
import * as timeline from '../../api/timeline'
import type { EventInput } from '../../api/timeline'
import type { ReviewItem, TimelineEvent, TimelineState } from '../../types'
import { useToast } from '../../components/Toast'
import { useAction } from '../../hooks/useAction'
import { useFailure } from '../../hooks/useFailure'
import { useRecordContext } from '../../recordContext'

/** The private timeline of a record and every change the person can make to it. */
export function useTimeline(recordId: string) {
  const [data, setData] = useState<TimelineState | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [loadError, setLoadError] = useState('')
  const started = useRef(false)
  const action = useAction()
  const fail = useFailure()
  const { refresh } = useRecordContext()
  const { notify } = useToast()

  const analyze = useCallback(async (revision: number) => {
    setAnalyzing(true)
    const next = await action.run(() => timeline.analyzeTimeline(recordId, revision))
    if (next) { setData(next); refresh() }
    setAnalyzing(false)
  }, [recordId, action.run, refresh]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let active = true
    timeline.getTimeline(recordId).then(state => {
      if (!active) return
      setData(state)
      // First visit: VERA proposes the timeline right away.
      if (!state.processed_at && !started.current) { started.current = true; analyze(state.revision) }
    }).catch(e => { if (active) fail(e, setLoadError) })
    return () => { active = false }
  }, [recordId, analyze, fail])

  async function change(task: (revision: number) => Promise<TimelineState>, message?: string) {
    if (!data || action.busy) return false
    const next = await action.run(() => task(data.revision))
    if (!next) return false
    setData(next); refresh()
    if (message) notify(message)
    return true
  }
  return {
    data, analyzing, busy: action.busy, error: loadError || action.error,
    reanalyze: () => data && analyze(data.revision),
    review: (event: TimelineEvent, status: TimelineEvent['status'], content?: Partial<EventInput>, message?: string) =>
      change(revision => timeline.reviewEvent(recordId, revision, event, status, content), message),
    add: (input: EventInput) => change(revision => timeline.addEvent(recordId, revision, input), 'Hecho agregado. Es tuyo: VERA no lo propuso.'),
    remove: (event: TimelineEvent) => change(revision => timeline.deleteEvent(recordId, revision, event.id), 'Hecho eliminado.'),
    settle: (item: ReviewItem, status: ReviewItem['status'], message?: string) =>
      change(revision => timeline.settleReviewItem(recordId, revision, item, status), message),
  }
}
