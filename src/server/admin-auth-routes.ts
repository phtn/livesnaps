import { getFirebaseAdminAuth } from '@/lib/firebase-admin/admin'
import { getFirebaseCustomClaimsFromDecodedToken } from '@/lib/firebase-admin/custom-claims'
import { getVerifiedAdminSession } from '@/lib/firebase-admin/server-auth'
import {
  firebaseAdminSessionCookieName,
  firebaseSessionCookieMaxAgeMs,
  firebaseSessionCookieMaxAgeSeconds
} from '@/lib/firebase-admin/session'
import { getHostnameFromHostHeader, isAdminSubdomainHostname } from '@/lib/routing/admin-subdomain'

function json(body: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(body, {
    status,
    headers: {
      'cache-control': 'no-store',
      ...headers
    }
  })
}

function isAdminRequest(request: Request) {
  const hostname =
    getHostnameFromHostHeader(request.headers.get('x-forwarded-host') ?? request.headers.get('host')) ??
    new URL(request.url).hostname

  return isAdminSubdomainHostname(hostname)
}

function isSameOriginRequest(request: Request) {
  const origin = request.headers.get('origin')
  return origin === null || origin === new URL(request.url).origin
}

function serializeAdminSessionCookie(value: string, request: Request, maxAge: number) {
  const attributes = [
    `${firebaseAdminSessionCookieName}=${encodeURIComponent(value)}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Lax'
  ]

  if (new URL(request.url).protocol === 'https:') {
    attributes.push('Secure')
  }

  return attributes.join('; ')
}

export async function handleAdminSession(request: Request): Promise<Response> {
  if (!isAdminRequest(request)) return json({ error: 'Not found.' }, 404)

  if (request.method === 'GET') {
    const session = await getVerifiedAdminSession(request)

    if (!session) return json({ error: 'Administrator access is required.' }, 401)

    return json({
      email: typeof session.decodedToken.email === 'string' ? session.decodedToken.email : null,
      uid: session.decodedToken.uid
    })
  }

  if (request.method === 'DELETE') {
    return json({ ok: true }, 200, {
      'set-cookie': serializeAdminSessionCookie('', request, 0)
    })
  }

  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
  if (!isSameOriginRequest(request)) return json({ error: 'Invalid request origin.' }, 403)

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
    const customClaims = getFirebaseCustomClaimsFromDecodedToken(decodedToken)

    if (customClaims.admin !== true) {
      return json({ error: 'Administrator access is required.' }, 403)
    }

    const sessionCookie = await auth.createSessionCookie(idToken, {
      expiresIn: firebaseSessionCookieMaxAgeMs
    })

    return json({ ok: true }, 200, {
      'set-cookie': serializeAdminSessionCookie(sessionCookie, request, firebaseSessionCookieMaxAgeSeconds)
    })
  } catch {
    return json({ error: 'Your sign-in session is invalid or expired.' }, 401)
  }
}

/**
 * `POST /api/admin/session/token` - a Firebase custom token for the admin whose
 * session cookie this request already carries.
 *
 * Firebase auth state is per-origin, so the handoff's session cookie leaves the
 * client SDK signed out on the admin host: no display name, no photo, and no
 * custom claims for the UI to read. The caller exchanges this for a real client
 * session with `signInWithCustomToken`. It escalates nothing - the token is
 * minted for the uid the verified cookie names, and the resulting ID token
 * carries that user's own claims.
 */
export async function handleAdminSessionToken(request: Request): Promise<Response> {
  if (!isAdminRequest(request)) return json({ error: 'Not found.' }, 404)
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
  if (!isSameOriginRequest(request)) return json({ error: 'Invalid request origin.' }, 403)

  const session = await getVerifiedAdminSession(request)
  if (!session) return json({ error: 'Administrator access is required.' }, 401)

  const auth = getFirebaseAdminAuth()
  if (!auth) return json({ error: 'Firebase Admin credentials are not configured.' }, 503)

  try {
    return json({ customToken: await auth.createCustomToken(session.decodedToken.uid) })
  } catch {
    return json({ error: 'Could not issue a sign-in token.' }, 500)
  }
}
