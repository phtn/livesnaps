'use node'

import { v } from 'convex/values'
import sharp from 'sharp'
import { buildUserAvatarObjectKey, USER_AVATAR_SIZE } from '../../src/lib/r2/user-avatars'
import { internal } from '../_generated/api'
import { internalAction } from '../_generated/server'
import { putR2Object } from '../lib/r2'

const SOURCE_MAX_BYTES = 5 * 1024 * 1024
const SOURCE_TIMEOUT_MS = 10_000

/**
 * Mirrors the sign-in provider's profile photo into R2 as a 40x40 WebP at
 * `users/<userId>/1010.webp`. Scheduled by `ensureCurrent`; a failure just
 * leaves the source unmarked so a later sign-in retries it.
 */
export const sync = internalAction({
  args: { userId: v.id('users'), sourceUrl: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId, sourceUrl }) => {
    const url = new URL(sourceUrl)
    if (url.protocol !== 'https:') {
      throw new Error('Profile image URL must use https.')
    }

    const response = await fetch(url, { signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS) })
    if (!response.ok) {
      throw new Error(`Profile image fetch failed (${response.status}).`)
    }
    if (Number(response.headers.get('content-length') ?? 0) > SOURCE_MAX_BYTES) {
      throw new Error('Profile image is too large.')
    }
    const source = new Uint8Array(await response.arrayBuffer())
    if (source.byteLength > SOURCE_MAX_BYTES) {
      throw new Error('Profile image is too large.')
    }

    const avatar = await sharp(source)
      .resize(USER_AVATAR_SIZE, USER_AVATAR_SIZE, { fit: 'cover' })
      .webp({ quality: 85 })
      .toBuffer()

    await putR2Object(buildUserAvatarObjectKey(userId), avatar, 'image/webp')
    await ctx.runMutation(internal.users.m.setAvatar, { userId, sourceUrl })
    return null
  }
})
