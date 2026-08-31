import { ConvexClient } from 'convex/browser'
import { onAuthStateChanged } from 'firebase/auth'
import type { api } from '../../convex/_generated/api'
import { auth } from '@/lib/firebase'

const url = import.meta.env.PUBLIC_CONVEX_URL
// Debug mode disables proof mutations at their call sites, but owner-scoped
// queries must still be available to show the signed-in user's submissions.
export const convexClient = url ? new ConvexClient(url) : null

const fetchAuthToken = async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
  const user = auth.currentUser
  return user ? user.getIdToken(forceRefreshToken) : null
}

if (convexClient) {
  onAuthStateChanged(auth, () => {
    // Reconfigure only on sign-in and sign-out. Convex owns token rotation;
    // re-registering on every Firebase token change can create refresh races.
    convexClient.setAuth(fetchAuthToken)
  })
}

export async function getMySubmissions() {
  if (!convexClient || !auth.currentUser) return []
  const listMineQuery = 'snaps/q:listMine' as unknown as typeof api.snaps.q.listMine
  return convexClient.query(listMineQuery, {})
}

export async function getMySubmission(snapId: string) {
  if (!convexClient || !auth.currentUser) return null
  const getMineByRouteIdQuery = 'snaps/q:getMineByRouteId' as unknown as typeof api.snaps.q.getMineByRouteId
  return convexClient.query(getMineByRouteIdQuery, { snapId })
}
