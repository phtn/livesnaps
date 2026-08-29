import { ConvexHttpClient } from 'convex/browser'
import { api } from '../../convex/_generated/api'
import { auth } from '@/lib/firebase'

const url = import.meta.env.PUBLIC_CONVEX_URL
export const convexClient = url ? new ConvexHttpClient(url) : null

if (convexClient) {
  convexClient.setAuth(async () => (auth.currentUser ? auth.currentUser.getIdToken() : null))
}

export async function getMySubmissions() {
  if (!convexClient || !auth.currentUser) return []
  return convexClient.query(api.snaps.q.listMine, {})
}
