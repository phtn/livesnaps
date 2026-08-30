import { ConvexClient } from 'convex/browser'
import { onIdTokenChanged } from 'firebase/auth'
import type { api } from '../../convex/_generated/api'
import { auth } from '@/lib/firebase'

const url = import.meta.env.PUBLIC_CONVEX_URL
export const convexClient = url ? new ConvexClient(url) : null

const fetchAuthToken = async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
  const user = auth.currentUser
  return user ? user.getIdToken(forceRefreshToken) : null
}

if (convexClient) {
  onIdTokenChanged(auth, () => {
    // Reconfigure on sign-in, token rotation, and sign-out. The fetcher returns
    // null after sign-out, which resets Convex's authenticated state.
    convexClient.setAuth(fetchAuthToken)
  })
}

export async function getMySubmissions() {
  if (!convexClient || !auth.currentUser) return []
  const listMineQuery = 'snaps/q:listMine' as unknown as typeof api.snaps.q.listMine
  return convexClient.query(listMineQuery, {})
}
