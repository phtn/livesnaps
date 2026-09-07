import { ConvexError } from 'convex/values'
import type { MutationCtx, QueryCtx } from '../_generated/server'

// Match the account selected by accounts.q.listMine({ limit: 1 }). The
// console's `admin` claim alone must never override an account member's role.
export async function workspaceAccess(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity()
  if (identity?.admin !== true) throw new ConvexError('Unauthorized.')
  const membership = await ctx.db.query('accountMembers')
    .withIndex('by_tokenIdentifier_and_status', q =>
      q.eq('tokenIdentifier', identity.tokenIdentifier).eq('status', 'active'))
    .first()
  return {
    identity,
    membership,
    canManage: membership?.role === 'admin' || membership?.role === 'owner'
  }
}
