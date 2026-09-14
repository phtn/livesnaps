import { v } from 'convex/values'
import { type MutationCtx, type QueryCtx, query } from '../_generated/server'
import schema from '../schema'

export const current = query({
  args: {},
  returns: v.union(schema.doc('users'), v.null()),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null
    return await getUserByTokenIdentifier(ctx, identity.tokenIdentifier)
  }
})

export async function getCurrentIdentity(ctx: QueryCtx | MutationCtx) {
  return await ctx.auth.getUserIdentity()
}

export async function getUserByTokenIdentifier(ctx: QueryCtx | MutationCtx, tokenIdentifier: string) {
  return await ctx.db
    .query('users')
    .withIndex('by_tokenIdentifier', (q) => q.eq('tokenIdentifier', tokenIdentifier))
    .unique()
}
