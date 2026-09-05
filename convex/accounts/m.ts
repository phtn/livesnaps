import { ConvexError, v } from 'convex/values'
import {
  ACCOUNT_CLOSE_REASON_MAX_LENGTH,
  DEFAULT_ACCOUNT_PLAN,
  DEFAULT_ACCOUNT_STATUS
} from '../../src/lib/accounts/accounts'
import { internal } from '../_generated/api'
import { internalMutation, mutation } from '../_generated/server'
import { requireAccountAccess } from '../accountMembers/helpers'
import { trimOrNull } from '../utils'
import { accountDocumentSchema, createAccountSchema, updateAccountSchema } from './d'
import {
  getAccountBySlug,
  normalizeAccountName,
  normalizeAccountNotes,
  normalizeAccountSlug,
  normalizeOptionalAccountEmail,
  normalizeOrganization,
  normalizePrimaryContact,
  requireAdminIdentity,
  requireGodIdentity,
  requireTopgIdentity
} from './helpers'

export const create = mutation({
  args: createAccountSchema,
  returns: v.id('accounts'),
  handler: async (ctx, args) => {
    const identity = await requireGodIdentity(ctx)

    const name = normalizeAccountName(args.name)
    const slug = normalizeAccountSlug(args.slug, name)

    if (await getAccountBySlug(ctx, slug)) {
      throw new ConvexError(`An account with the slug "${slug}" already exists.`)
    }

    const now = Date.now()
    const { contact: primaryContact, userId: contactUserId } = await normalizePrimaryContact(ctx, args.primaryContact)

    const accountId = await ctx.db.insert('accounts', {
      slug,
      name,
      status: args.status ?? DEFAULT_ACCOUNT_STATUS,
      plan: args.plan ?? DEFAULT_ACCOUNT_PLAN,
      organization: normalizeOrganization(args.organization),
      primaryContact,
      billingEmail: normalizeOptionalAccountEmail(args.billingEmail, 'Billing email'),
      ownerTokenIdentifier: args.ownerTokenIdentifier ?? identity.tokenIdentifier,
      notes: normalizeAccountNotes(args.notes),
      closedAt: null,
      closedBy: null,
      closeReason: null,
      createdAt: now,
      createdBy: identity.tokenIdentifier,
      updatedAt: now,
      updatedBy: identity.tokenIdentifier
    })

    // The primary contact owns the account. They are active immediately if they
    // already have an identity, and hold a pending invite otherwise.
    await ctx.db.insert('accountMembers', {
      accountId,
      email: primaryContact.email,
      tokenIdentifier: primaryContact.tokenIdentifier,
      userId: contactUserId,
      name: primaryContact.name,
      title: primaryContact.title,
      role: 'owner',
      status: primaryContact.tokenIdentifier ? 'active' : 'invited',
      invitedAt: now,
      invitedBy: identity.tokenIdentifier,
      joinedAt: primaryContact.tokenIdentifier ? now : null,
      updatedAt: now,
      updatedBy: identity.tokenIdentifier
    })

    return accountId
  }
})

export const update = mutation({
  args: updateAccountSchema.extend({ id: v.id('accounts') }),
  returns: accountDocumentSchema,
  handler: async (ctx, { id, ...args }) => {
    const actor = await requireAccountAccess(ctx, id, 'admin')

    // Lifecycle, billing tier, and the public handle are ours to set, not the
    // customer's - an owner editing their own profile must not be able to move
    // themselves onto another plan or rename the account out from under a URL.
    if (!actor.isPlatformAdmin && (args.status !== undefined || args.plan !== undefined || args.slug !== undefined)) {
      throw new ConvexError('Account status, plan, and slug can only be changed by support.')
    }

    const existing = await ctx.db.get(id)

    if (!existing) {
      throw new ConvexError('Account not found.')
    }

    const name = args.name === undefined ? existing.name : normalizeAccountName(args.name)
    const patch: Record<string, unknown> = {
      updatedAt: Date.now(),
      updatedBy: actor.tokenIdentifier
    }

    if (args.name !== undefined) patch.name = name

    if (args.slug !== undefined) {
      const slug = normalizeAccountSlug(args.slug, name)
      const conflict = await getAccountBySlug(ctx, slug)

      if (conflict && conflict._id !== id) {
        throw new ConvexError(`An account with the slug "${slug}" already exists.`)
      }

      patch.slug = slug
    }

    if (args.status !== undefined) patch.status = args.status
    if (args.plan !== undefined) patch.plan = args.plan
    if (args.organization !== undefined) patch.organization = normalizeOrganization(args.organization)
    if (args.primaryContact !== undefined) {
      patch.primaryContact = (await normalizePrimaryContact(ctx, args.primaryContact)).contact
    }
    if (args.billingEmail !== undefined) {
      patch.billingEmail = normalizeOptionalAccountEmail(args.billingEmail, 'Billing email')
    }
    if (args.notes !== undefined) patch.notes = normalizeAccountNotes(args.notes)

    await ctx.db.patch(id, patch)

    const updated = await ctx.db.get(id)

    if (!updated) {
      throw new ConvexError('Account not found.')
    }

    return updated
  }
})

/**
 * Accounts are never deleted - closing is the terminal state, and it keeps the
 * record, its members, and everything referencing it intact. An account owner
 * can close their own account; only support can reopen one.
 */
export const close = mutation({
  args: { id: v.id('accounts'), reason: v.optional(v.union(v.string(), v.null())) },
  returns: accountDocumentSchema,
  handler: async (ctx, { id, reason }) => {
    const actor = await requireAccountAccess(ctx, id, 'owner')

    const existing = await ctx.db.get(id)

    if (!existing) {
      throw new ConvexError('Account not found.')
    }

    if (existing.status === 'closed') {
      return existing
    }

    const trimmedReason = trimOrNull(reason)

    if (trimmedReason && trimmedReason.length > ACCOUNT_CLOSE_REASON_MAX_LENGTH) {
      throw new ConvexError(`Closing reason must be ${ACCOUNT_CLOSE_REASON_MAX_LENGTH} characters or fewer.`)
    }

    const now = Date.now()

    await ctx.db.patch(id, {
      status: 'closed',
      closedAt: now,
      closedBy: actor.tokenIdentifier,
      closeReason: trimmedReason,
      updatedAt: now,
      updatedBy: actor.tokenIdentifier
    })

    const closed = await ctx.db.get(id)

    if (!closed) {
      throw new ConvexError('Account not found.')
    }

    return closed
  }
})

export const reopen = mutation({
  args: { id: v.id('accounts'), status: v.optional(v.union(v.literal('pending'), v.literal('active'))) },
  returns: accountDocumentSchema,
  handler: async (ctx, { id, status }) => {
    const identity = await requireAdminIdentity(ctx)

    const existing = await ctx.db.get(id)

    if (!existing) {
      throw new ConvexError('Account not found.')
    }

    if (existing.status !== 'closed') {
      throw new ConvexError('This account is not closed.')
    }

    const now = Date.now()

    await ctx.db.patch(id, {
      status: status ?? 'pending',
      closedAt: null,
      closedBy: null,
      closeReason: null,
      updatedAt: now,
      updatedBy: identity.tokenIdentifier
    })

    const reopened = await ctx.db.get(id)

    if (!reopened) {
      throw new ConvexError('Account not found.')
    }

    return reopened
  }
})

/**
 * Permanent deletion. Unlike `close`, nothing survives: the account row goes
 * and its memberships follow. Reserved for `topg`.
 */
export const remove = mutation({
  args: { id: v.id('accounts') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await requireTopgIdentity(ctx)

    const existing = await ctx.db.get(id)

    if (!existing) {
      throw new ConvexError('Account not found.')
    }

    await ctx.db.delete(id)
    await ctx.scheduler.runAfter(0, internal.accounts.m.purgeMembers, { accountId: id })

    return null
  }
})

const PURGE_BATCH_SIZE = 100

/**
 * Memberships are deleted in their own transactions so a large roster cannot
 * blow the calling mutation's write limit.
 */
export const purgeMembers = internalMutation({
  args: { accountId: v.id('accounts') },
  returns: v.null(),
  handler: async (ctx, { accountId }) => {
    const batch = await ctx.db
      .query('accountMembers')
      .withIndex('by_accountId_and_status', (q) => q.eq('accountId', accountId))
      .take(PURGE_BATCH_SIZE)

    for (const member of batch) {
      await ctx.db.delete(member._id)
    }

    if (batch.length === PURGE_BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.accounts.m.purgeMembers, { accountId })
    }

    return null
  }
})
