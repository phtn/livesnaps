import { ConvexClient } from 'convex/browser'
import { onAuthStateChanged } from 'firebase/auth'
import type { api } from '../../convex/_generated/api'
import { auth } from '@/lib/firebase'
import { getSnapRuntimeMode } from '@/lib/snaps/debug'

const url = import.meta.env.PUBLIC_CONVEX_URL
const isDebugRuntime = getSnapRuntimeMode().debug
export const convexClient = url && !isDebugRuntime ? new ConvexClient(url) : null

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
