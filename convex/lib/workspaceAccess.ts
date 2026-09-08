import { ConvexError } from 'convex/values'
import type { Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'
import { requireSubmissionAccountAccess } from './submissionAccess'

export async function workspaceAccess(ctx: QueryCtx | MutationCtx, accountId?: Id<'accounts'>) {
  if (accountId) return await requireSubmissionAccountAccess(ctx, accountId)
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new ConvexError('Unauthorized.')
  const memberships = await ctx.db.query('accountMembers')
    .withIndex('by_tokenIdentifier_and_status', q =>
      q.eq('tokenIdentifier', identity.tokenIdentifier).eq('status', 'active'))
    .take(2)
  if (memberships.length === 0) throw new ConvexError('Unauthorized.')
  if (memberships.length !== 1) throw new ConvexError('Select an Account to continue.')
  return await requireSubmissionAccountAccess(ctx, memberships[0].accountId)
}
