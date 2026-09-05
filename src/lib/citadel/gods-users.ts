import type { FirebaseAdminUserSummary } from '@/lib/firebase-admin/admin-users'
import type { GodsUserClaimResponse, GodsUserListResponse } from '@/server/gods-user-routes'

// Type-only imports: the Firebase Admin modules behind these names never reach
// the client bundle.
export type GodUser = FirebaseAdminUserSummary
export type GodUserList = GodsUserListResponse

const GODS_USERS_ENDPOINT = '/api/gods/users'
const GODS_USER_CLAIMS_ENDPOINT = '/api/gods/users/claims'

async function readError(response: Response, fallback: string) {
  try {
    const body: unknown = await response.json()
    const error = typeof body === 'object' && body !== null ? (body as { error?: unknown }).error : undefined
    return typeof error === 'string' && error.length > 0 ? error : fallback
  } catch {
    return fallback
  }
}

async function requestJson<T>(input: string, init: RequestInit, fallback: string): Promise<T> {
  const response = await fetch(input, { credentials: 'same-origin', ...init })
  if (!response.ok) throw new Error(await readError(response, fallback))
  return (await response.json()) as T
}

export function fetchGodUsers(signal?: AbortSignal) {
  return requestJson<GodUserList>(GODS_USERS_ENDPOINT, { signal }, 'Could not load the god roster.')
}

export function searchUsers(query: string, signal?: AbortSignal) {
  const endpoint = `${GODS_USERS_ENDPOINT}?search=${encodeURIComponent(query)}`
  return requestJson<GodUserList>(endpoint, { signal }, 'Could not search the user directory.')
}

export async function setGodClaim(uid: string, enabled: boolean) {
  const body = await requestJson<GodsUserClaimResponse>(
    GODS_USER_CLAIMS_ENDPOINT,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ claim: 'god', enabled, uid })
    },
    'Could not update this account’s access.'
  )

  return body.user
}

export function getGodUserLabel(user: GodUser) {
  return user.displayName ?? user.email ?? user.uid
}
