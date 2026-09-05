import type { UserIdentity } from 'convex/server'
import { ConvexError, v } from 'convex/values'
import { type MutationCtx, mutation } from '../_generated/server'
import { trimOrNull } from '../utils'
import { getCurrentIdentity, getUserByTokenIdentifier } from './q'
import { userUpsertSchema, userValidator } from './v'

export const create = mutation({
  args: userValidator,
  handler: async ({ db }, args) => {
    const user = await db.insert('users', { ...args })
    return user
  }
})

export const update = mutation({
  args: { id: v.id('users'), payload: userValidator },
  handler: async ({ db }, { id, payload }) => {
    const user = await db.get(id)
    if (!user) return null
    return await db.patch(id, { ...payload })
  }
})

export const upsertByTokenIdentifier = mutation({
  args: userUpsertSchema,
  handler: async ({ db }, args) => {
    const existingUser = await db
      .query('users')
      .withIndex('by_tokenIdentifier', (q) => q.eq('tokenIdentifier', args.tokenIdentifier))
      .unique()

    const now = Date.now()

    if (existingUser) {
      await db.patch(existingUser._id, {
        ...args,
        updatedAt: now
      })

      return existingUser._id
    }

    return await db.insert('users', {
      ...args,
      createdAt: now,
      updatedAt: now
    })
  }
})
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
async function upsertCurrentUser(ctx: MutationCtx) {
  const identity = await getCurrentIdentity(ctx)
  if (!identity) {
    throw new ConvexError('Unauthenticated.')
  }

  const existingUser = await getUserByTokenIdentifier(ctx, identity.tokenIdentifier)
  const now = Date.now()
  const userData = identityToUserData(identity, now)

  if (existingUser) {
    await ctx.db.patch(existingUser._id, {
      ...userData,
      createdAt: existingUser.createdAt ?? 0
    })
    return existingUser._id
  }

  return await ctx.db.insert('users', userData)
}

export const syncCurrentUser = mutation({
  args: {},
  returns: v.id('users'),
  handler: async (ctx) => {
    return await upsertCurrentUser(ctx)
  }
})

export const ensureCurrent = mutation({
  args: {},
  returns: v.id('users'),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Unauthenticated')

    const existing = await getUserByTokenIdentifier(ctx, identity.tokenIdentifier)
    const now = Date.now()

    if (!existing) {
      return await ctx.db.insert('users', {
        tokenIdentifier: identity.tokenIdentifier,
        firebaseUid: identity.subject,
        ...(identity.name ? { name: identity.name } : {}),
        ...(identity.email ? { email: identity.email } : {}),
        ...(identity.pictureUrl ? { imageUrl: identity.pictureUrl } : {}),
        subject: identity.subject,
        issuer: identity.issuer,
        nickname: identity.nickname ?? null,
        preferredUsername: identity.preferredUsername ?? null,
        profileUrl: identity.profileUrl,
        phone: String(identity.phone) ?? null,
        emailVerified: identity.emailVerified ?? null,
        createdAt: now,
        updatedAt: now
      })
    }

    const profileChanged =
      existing.firebaseUid !== identity.subject ||
      (identity.name !== undefined && existing.name !== identity.name) ||
      (identity.email !== undefined && existing.email !== identity.email) ||
      (identity.pictureUrl !== undefined && existing.imageUrl !== identity.pictureUrl)

    if (profileChanged) {
      await ctx.db.patch('users', existing._id, {
        firebaseUid: identity.subject,
        ...(identity.name ? { name: identity.name } : {}),
        ...(identity.email ? { email: identity.email } : {}),
        ...(identity.pictureUrl ? { imageUrl: identity.pictureUrl } : {}),
        updatedAt: now
      })
    }

    return existing._id
  }
})
