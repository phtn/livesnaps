import type { UserIdentity } from 'convex/server'
import type { MutationCtx, QueryCtx } from '../_generated/server'

type DatabaseReader = QueryCtx['db'] | MutationCtx['db']

export async function getUserByTokenIdentifier(db: DatabaseReader, tokenIdentifier: string) {
  return await db
    .query('users')
    .withIndex('by_tokenIdentifier', (q) => q.eq('tokenIdentifier', tokenIdentifier))
    .unique()
}

export async function requireCurrentUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error('Unauthenticated')

  const user = await getUserByTokenIdentifier(ctx.db, identity.tokenIdentifier)
  if (!user) throw new Error('User profile has not been initialized')
  return user
}

/**
 * The Citadel console gates on the `god` claim while the older admin surfaces
 * gate on `admin`, and both are staff operating on behalf of the platform.
 * Account-scoped code asks this rather than picking one claim and locking the
 * other console out.
 */
export function isPlatformStaff(identity: UserIdentity) {
  return identity.admin === true || identity.god === true
}
