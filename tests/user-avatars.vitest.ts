import { afterEach, describe, expect, test, vi } from 'vitest'
import { getUserAvatarUrl, resolveUserAvatar } from '../src/lib/r2/user-avatars'
import { handleUserAvatarRequest } from '../src/server/user-avatar-routes'

const r2 = { accountId: 'acct', accessKeyId: 'key', secretAccessKey: 'secret', bucket: 'livesnaps' }
const google = 'https://lh3.googleusercontent.com/a/photo=s96-c'

describe('resolveUserAvatar', () => {
  test('serves the R2 mirror with the provider photo as fallback', () => {
    const avatar = resolveUserAvatar({
      _id: 'j57user',
      avatarR2Key: 'users/j57user/1010.webp',
      avatarSourceUrl: google,
      imageUrl: google
    })
    expect(avatar.src).toMatch(/^\/api\/avatars\/j57user\?v=[a-z0-9]+$/)
    expect(avatar.fallbackSrc).toBe(google)
  })

  test('uses imageUrl until the mirror exists', () => {
    expect(resolveUserAvatar({ _id: 'j57user', imageUrl: google })).toEqual({ src: google, fallbackSrc: null })
    expect(resolveUserAvatar(null)).toEqual({ src: null, fallbackSrc: null })
  })

  test('changes the versioned URL when the source photo changes', () => {
    expect(getUserAvatarUrl('j57user', google)).not.toBe(getUserAvatarUrl('j57user', `${google}x`))
    expect(() => getUserAvatarUrl('../other')).toThrow(/Invalid user avatar path/)
  })
})

describe('handleUserAvatarRequest', () => {
  afterEach(() => vi.unstubAllGlobals())

  test('streams the R2 object as immutable WebP for versioned URLs', async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { etag: '"abc"' } }))
    vi.stubGlobal('fetch', fetchMock)

    const response = await handleUserAvatarRequest(
      new Request('https://app.test/api/avatars/j57user?v=1'),
      'j57user',
      r2
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/webp')
    expect(response.headers.get('cache-control')).toContain('immutable')
    expect(response.headers.get('etag')).toBe('"abc"')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe(
      'https://acct.r2.cloudflarestorage.com/livesnaps/users/j57user/1010.webp'
    )
  })

  test('returns an uncached 404 when the mirror is missing so the client falls back', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 404 }))
    )

    const response = await handleUserAvatarRequest(new Request('https://app.test/api/avatars/j57user'), 'j57user', r2)

    expect(response.status).toBe(404)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  test('rejects malformed ids and non-read methods without touching R2', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    expect((await handleUserAvatarRequest(new Request('https://app.test/x'), '..', r2)).status).toBe(404)
    expect(
      (await handleUserAvatarRequest(new Request('https://app.test/x', { method: 'POST' }), 'j57user', r2)).status
    ).toBe(405)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
