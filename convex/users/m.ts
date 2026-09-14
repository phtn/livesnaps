import type { UserIdentity } from 'convex/server'
import { ConvexError, v } from 'convex/values'
import { buildUserAvatarObjectKey } from '../../src/lib/r2/user-avatars'
import { internal } from '../_generated/api'
import type { Doc, Id } from '../_generated/dataModel'
import { internalMutation, type MutationCtx, mutation } from '../_generated/server'
import { trimOrNull } from '../utils'
import { getCurrentIdentity, getUserByTokenIdentifier } from './q'

function identityToUserData(identity: UserIdentity, now: number) {
  const trimOrUndefined = (value: string | undefined) => trimOrNull(value) ?? undefined

  return {
    tokenIdentifier: identity.tokenIdentifier,
    firebaseUid: identity.subject,
    subject: identity.subject,
    issuer: identity.issuer,
    name: trimOrUndefined(identity.name),
    nickname: trimOrNull(identity.nickname),
    preferredUsername: trimOrNull(identity.preferredUsername),
    imageUrl: trimOrUndefined(identity.pictureUrl),
    email: trimOrUndefined(identity.email),
    phone: trimOrNull(identity.phoneNumber),
    emailVerified: identity.emailVerified ?? null,
    createdAt: now,
    updatedAt: now
  }
}
// `ensureCurrent` runs on every authenticated Worker request, so an in-flight
// or failing avatar sync must not be re-queued each time.
const AVATAR_SYNC_RETRY_MS = 10 * 60 * 1000

/** The image URL to mirror into R2, or null when the stored avatar is current or a sync was queued recently. */
function pendingAvatarSource(existingUser: Doc<'users'> | null, imageUrl: string | undefined, now: number) {
  if (!imageUrl || imageUrl === existingUser?.avatarSourceUrl) return null
  const requestedAt = existingUser?.avatarSyncRequestedAt
  if (requestedAt !== undefined && now - requestedAt < AVATAR_SYNC_RETRY_MS) return null
  return imageUrl
}

async function upsertCurrentUser(ctx: MutationCtx) {
  const identity = await getCurrentIdentity(ctx)
  if (!identity) {
    throw new ConvexError('Unauthenticated.')
  }

  const existingUser = await getUserByTokenIdentifier(ctx, identity.tokenIdentifier)
  const now = Date.now()
  const userData = identityToUserData(identity, now)
  const avatarSourceUrl = pendingAvatarSource(existingUser, userData.imageUrl, now)
  const avatarPatch = avatarSourceUrl ? { avatarSyncRequestedAt: now } : {}

  let userId: Id<'users'>
  if (existingUser) {
    await ctx.db.patch(existingUser._id, {
      ...userData,
      ...avatarPatch,
      createdAt: existingUser.createdAt ?? 0
    })
    userId = existingUser._id
  } else {
    userId = await ctx.db.insert('users', { ...userData, ...avatarPatch })
  }

  if (avatarSourceUrl) {
    await ctx.scheduler.runAfter(0, internal.users.avatar.sync, { userId, sourceUrl: avatarSourceUrl })
  }

  return userId
}

/** Creates or refreshes the signed-in user's row from their verified identity. */
export const ensureCurrent = mutation({
  args: {},
  returns: v.id('users'),
  handler: async (ctx) => {
    return await upsertCurrentUser(ctx)
  }
})

/** Records a finished avatar upload from `users/avatar:sync`. */
export const setAvatar = internalMutation({
  args: { userId: v.id('users'), sourceUrl: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId, sourceUrl }) => {
    const user = await ctx.db.get(userId)
    if (!user) return null

    // If imageUrl moved on while this ran, avatarSourceUrl still differs from it
    // and the next ensureCurrent queues a fresh sync.
    await ctx.db.patch(userId, {
      avatarR2Key: buildUserAvatarObjectKey(userId),
      avatarSourceUrl: sourceUrl,
      avatarSyncRequestedAt: undefined
    })
    return null
  }
})
