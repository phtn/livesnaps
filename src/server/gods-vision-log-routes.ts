import { api } from '../../convex/_generated/api'
import { getVerifiedGodSession } from '@/lib/firebase-admin/server-auth'
import { mintAdminIdToken } from '@/lib/firebase-admin/admin-id-token'
import { getHostnameFromHostHeader } from '@/lib/routing/admin-subdomain'
import { isGodsSubdomainHostname } from '@/lib/routing/gods-subdomain'
import { createConvexClient } from './convex'

export async function handleGodsVisionLogs(request: Request, environment: { convexUrl?: string }) {
  const json = (body: unknown, status = 200) =>
    Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
  const host = getHostnameFromHostHeader(request.headers.get('x-forwarded-host') ?? request.headers.get('host')) ?? new URL(request.url).hostname
  if (!isGodsSubdomainHostname(host)) return json({ error: 'Not found.' }, 404)
  if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405)
  const session = await getVerifiedGodSession(request)
  if (!session) return json({ error: 'God access is required.' }, 401)

  try {
    const client = createConvexClient(await mintAdminIdToken(session.decodedToken.uid), environment.convexUrl)
    return json(await client.query(api.vision_logs.q.listForGod, {}))
  } catch {
    return json({ error: 'Unable to load vision logs. Please try again.' }, 500)
  }
}
