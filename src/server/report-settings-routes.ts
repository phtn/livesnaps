import { api } from '../../convex/_generated/api'
import { getVerifiedGodSession } from '@/lib/firebase-admin/server-auth'
import { mintAdminIdToken } from '@/lib/firebase-admin/admin-id-token'
import { createConvexClient } from './convex'
import { REPORT_FIELD_KEYS } from '@/lib/snaps/report-settings'
import { getHostnameFromHostHeader } from '@/lib/routing/admin-subdomain'
import { isGodsSubdomainHostname } from '@/lib/routing/gods-subdomain'

export async function handleReportSettings(request: Request, environment: { convexUrl?: string }) {
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
  const host = getHostnameFromHostHeader(request.headers.get('x-forwarded-host') ?? request.headers.get('host')) ?? new URL(request.url).hostname
  if (!isGodsSubdomainHostname(host)) return json({ error: 'Not found.' }, 404)
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) return json({ error: 'Invalid request origin.' }, 403)
  const session = await getVerifiedGodSession(request)
  if (!session) return json({ error: 'God access is required.' }, 401)
  const body: unknown = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || !('key' in body) || typeof body.key !== 'string' || !REPORT_FIELD_KEYS.has(body.key) || !('included' in body) || typeof body.included !== 'boolean')
    return json({ error: 'A valid report field and inclusion value are required.' }, 400)
  try {
    const client = createConvexClient(await mintAdminIdToken(session.decodedToken.uid), environment.convexUrl)
    return json(await client.mutation(api.snapSettings.m.updateReportField, { key: body.key, included: body.included }))
  } catch {
    return json({ error: 'Could not save report settings. Please try again.' }, 500)
  }
}
