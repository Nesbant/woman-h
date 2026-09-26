import { useCallback } from 'react'
import { getProfile, listOrganizations } from '../../api/profile'
import { useResource } from '../../hooks/useResource'

/** Where the case goes: the organization in the person's profile, or the first one available. */
export function useDestination() {
  const { data } = useResource(useCallback(async () => {
    const [profile, organizations] = await Promise.all([getProfile(), listOrganizations()])
    return profile.institution ?? organizations[0] ?? null
  }, []))
  return data ?? null
}
