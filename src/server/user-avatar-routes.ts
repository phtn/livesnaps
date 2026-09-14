import { getR2Object, type R2Config, R2ConfigurationError } from '@/lib/r2/server'
import { buildUserAvatarObjectKey, isUserAvatarId } from '@/lib/r2/user-avatars'

const notFound = () => new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } })

/**
 * Serves a user's 40x40 R2 avatar. Public on purpose: `<img>` can't send a
 * bearer token, and the photo is the same one the provider already serves
 * without auth. Callers fall back to `imageUrl` on a 404.
 */
export async function handleUserAvatarRequest(request: Request, userId: string, r2?: Partial<R2Config>) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return Response.json({ error: 'Method not allowed.' }, { status: 405 })
  }
  if (!isUserAvatarId(userId)) return notFound()

  try {
    const avatar = await getR2Object(buildUserAvatarObjectKey(userId), r2)
    if (avatar.status === 404) return notFound()
    if (!avatar.ok || !avatar.body) throw new Error(`R2 avatar fetch failed with status ${avatar.status}.`)

    // A `?v=` URL names one generation of the avatar, so it never needs revalidating.
    const versioned = new URL(request.url).searchParams.has('v')
    const etag = avatar.headers.get('etag')
    const contentLength = avatar.headers.get('content-length')
    const headers = {
      'cache-control': versioned ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
      'content-type': 'image/webp',
      'x-content-type-options': 'nosniff',
      ...(contentLength ? { 'content-length': contentLength } : {}),
      ...(etag ? { etag } : {})
    }

    if (request.method === 'HEAD') {
      await avatar.body.cancel()
      return new Response(null, { headers })
    }
    return new Response(avatar.body, { headers })
  } catch (error) {
    const status = error instanceof R2ConfigurationError ? 503 : 502
    return new Response(null, { status, headers: { 'cache-control': 'no-store' } })
  }
}
