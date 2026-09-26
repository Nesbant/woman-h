import { apiBlob } from './client'
import { get, send } from './http'
import type { CaseDetail, CaseListing, CaseStatus, StepStatus } from '../types'

const cases = (institutionId: string) => `/institutions/${institutionId}/cases`
const caseUrl = (institutionId: string, caseId: string) => `${cases(institutionId)}/${caseId}`

export const listCases = (institutionId: string) => get<CaseListing>(cases(institutionId))
export const getCase = (institutionId: string, caseId: string) => get<CaseDetail>(caseUrl(institutionId, caseId))
export const assignCase = (institutionId: string, caseId: string, assigneeId: string | null) => send<CaseDetail>('PUT', `${caseUrl(institutionId, caseId)}/assignee`, { assignee_id: assigneeId })
export const setCaseStatus = (institutionId: string, caseId: string, status: CaseStatus) => send<CaseDetail>('PUT', `${caseUrl(institutionId, caseId)}/status`, { status })
export const setStepStatus = (institutionId: string, caseId: string, step: string, status: StepStatus) => send<CaseDetail>('PUT', `${caseUrl(institutionId, caseId)}/procedure/${step}`, { status })
export const caseFile = (institutionId: string, caseId: string, fileId: string) => apiBlob(`${caseUrl(institutionId, caseId)}/files/${fileId}/content`)
