import { get, send } from './http'
import type { Profile } from '../types'

export type ProfileInput = { institution_id: string | null; document: string | null; contact: string | null; position: string | null; area: string | null; relationship: string | null }

export const getProfile = () => get<Profile>('/profile')
export const updateProfile = (input: ProfileInput) => send<Profile>('PUT', '/profile', input)
export const listOrganizations = () => get<{ id: string; name: string }[]>('/organizations')
