import { v } from 'convex/values'
import { isAccountSlug } from '../../src/lib/accounts/accounts'
import { isPublicAccountSlug } from '../../src/lib/accounts/submission-links'
import { query } from '../_generated/server'
import { requireAccountAccess } from '../accountMembers/helpers'
import { accountDocumentSchema, accountStatusSchema } from './d'
import { getAccountBySlug, requireAdminIdentity, requireGodIdentity } from './helpers'

const DEFAULT_LIST_LIMIT = 100
const MAX_LIST_LIMIT = 250

const slugAvailabilityReason = v.union(
  v.literal('available'),
  v.literal('invalid'),
  v.literal('reserved'),
  v.literal('taken')
)

const normalizeListLimit = (limit: number | undefined) => {
  if (limit === undefined || !Number.isFinite(limit)) {
    return DEFAULT_LIST_LIMIT
  }

  return Math.min(Math.max(Math.floor(limit), 1), MAX_LIST_LIMIT)
}

export const listForAdmin = query({
  args: {
    limit: v.optional(v.number()),
    status: v.optional(accountStatusSchema)
  },
  returns: v.array(accountDocumentSchema),
  handler: async (ctx, { limit, status }) => {
    await requireAdminIdentity(ctx)

    const take = normalizeListLimit(limit)

    if (status) {
      return await ctx.db
        .query('accounts')
        .withIndex('by_status_and_createdAt', (q) => q.eq('status', status))
        .order('desc')
        .take(take)
    }

    return await ctx.db.query('accounts').withIndex('by_createdAt').order('desc').take(take)
  }
})

/** Authoritative preflight for Citadel's create-account slug field. */
export const checkSlugAvailability = query({
  args: { slug: v.string() },
  returns: v.object({
    slug: v.string(),
    available: v.boolean(),
    reason: slugAvailabilityReason
  }),
  handler: async (ctx, { slug }) => {
    await requireGodIdentity(ctx)

    const candidate = slug.trim().toLowerCase()
    if (!isAccountSlug(candidate)) return { slug: candidate, available: false, reason: 'invalid' as const }
    if (!isPublicAccountSlug(candidate)) return { slug: candidate, available: false, reason: 'reserved' as const }

    const reservation = await ctx.db
      .query('accountSlugReservations')
      .withIndex('by_slug', (q) => q.eq('slug', candidate))
      .unique()
    const account = reservation ? null : await getAccountBySlug(ctx, candidate)

    return {
      slug: candidate,
      available: reservation === null && account === null,
      reason: reservation || account ? ('taken' as const) : ('available' as const)
    }
  }
})

export const getBySlug = query({
  args: { slug: v.string() },
  returns: v.union(accountDocumentSchema, v.null()),
  handler: async (ctx, { slug }) => {
    const account = await getAccountBySlug(ctx, slug.trim().toLowerCase())

    if (!account) {
      return null
    }

    await requireAccountAccess(ctx, account._id, 'viewer')

    return account
  }
})

export const getById = query({
  args: { id: v.id('accounts') },
  returns: v.union(accountDocumentSchema, v.null()),
  handler: async (ctx, { id }) => {
    await requireAccountAccess(ctx, id, 'viewer')

    return await ctx.db.get(id)
  }
})

/** Accounts the signed-in caller is an active member of. */
export const listMine = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(accountDocumentSchema),
  handler: async (ctx, { limit }) => {
    const identity = await ctx.auth.getUserIdentity()

    if (!identity) {
      return []
    }

    const memberships = await ctx.db
      .query('accountMembers')
      .withIndex('by_tokenIdentifier_and_status', (q) =>
        q.eq('tokenIdentifier', identity.tokenIdentifier).eq('status', 'active')
      )
      .take(normalizeListLimit(limit))

    const accounts = await Promise.all(memberships.map((membership) => ctx.db.get(membership.accountId)))

    return accounts
      .filter((account): account is NonNullable<typeof account> => account !== null)
      .sort((a, b) => b.createdAt - a.createdAt)
  }
})
