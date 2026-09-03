import { getFirebaseAdminAuth } from '@/lib/firebase-admin/admin'
import { getFirebaseCustomClaimsFromDecodedToken, hasFirebaseGodAccess } from '@/lib/firebase-admin/custom-claims'
import { firebaseGodsSessionCookieName, firebaseSessionCookieMaxAgeMs, firebaseSessionCookieMaxAgeSeconds } from '@/lib/firebase-admin/session'
import { getVerifiedGodSession } from '@/lib/firebase-admin/server-auth'
import { getHostnameFromHostHeader } from '@/lib/routing/admin-subdomain'
import { isGodsSubdomainHostname } from '@/lib/routing/gods-subdomain'

function json(body: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store', ...headers }
  })
}

function isGodsRequest(request: Request) {
  const hostname =
    getHostnameFromHostHeader(request.headers.get('x-forwarded-host') ?? request.headers.get('host')) ??
    new URL(request.url).hostname

  return isGodsSubdomainHostname(hostname)
}

function serializeGodsSessionCookie(value: string, request: Request, maxAge: number) {
  const attributes = [
    `${firebaseGodsSessionCookieName}=${encodeURIComponent(value)}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Lax'
  ]

  if (new URL(request.url).protocol === 'https:') attributes.push('Secure')

  return attributes.join('; ')
}

export async function handleGodsSession(request: Request): Promise<Response> {
  if (!isGodsRequest(request)) return json({ error: 'Not found.' }, 404)

  if (request.method === 'GET') {
    const session = await getVerifiedGodSession(request)
    if (!session) return json({ error: 'God access is required.' }, 401)

    return json({
      email: typeof session.decodedToken.email === 'string' ? session.decodedToken.email : null,
      uid: session.decodedToken.uid
    })
  }

  if (request.method === 'DELETE') {
    return json({ ok: true }, 200, {
      'set-cookie': serializeGodsSessionCookie('', request, 0)
    })
  }

  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
  if (request.headers.get('origin') !== null && request.headers.get('origin') !== new URL(request.url).origin) {
    return json({ error: 'Invalid request origin.' }, 403)
  }

  let idToken: unknown
  try {
    const body: unknown = await request.json()
    idToken = typeof body === 'object' && body !== null ? (body as { idToken?: unknown }).idToken : undefined
  } catch {
    return json({ error: 'A valid JSON request body is required.' }, 400)
  }

  if (typeof idToken !== 'string' || idToken.trim().length === 0) {
    return json({ error: 'A Firebase ID token is required.' }, 400)
  }

  const auth = getFirebaseAdminAuth()
  if (!auth) return json({ error: 'Firebase Admin credentials are not configured.' }, 503)

  try {
    const decodedToken = await auth.verifyIdToken(idToken, true)
    if (!hasFirebaseGodAccess(getFirebaseCustomClaimsFromDecodedToken(decodedToken))) {
      return json({ error: 'God access is required.' }, 403)
    }

    const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn: firebaseSessionCookieMaxAgeMs })
    return json({ ok: true }, 200, {
      'set-cookie': serializeGodsSessionCookie(sessionCookie, request, firebaseSessionCookieMaxAgeSeconds)
    })
  } catch {
    return json({ error: 'Your sign-in session is invalid or expired.' }, 401)
  }
}
