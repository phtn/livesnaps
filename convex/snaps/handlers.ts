import { ConvexError, v } from 'convex/values'
import { mutation, query } from '../_generated/server'
import { workspaceAccess } from '../lib/workspaceAccess'

export const options = query({
  args: {},
  returns: v.object({ canManage: v.boolean(), members: v.array(v.object({ id: v.id('accountMembers'), name: v.string(), email: v.string() })) }),
  handler: async ctx => {
    const { canManage, membership } = await workspaceAccess(ctx)
    if (!canManage || !membership) return { canManage: false, members: [] }
    const members = await ctx.db.query('accountMembers')
      .withIndex('by_accountId_and_status', q => q.eq('accountId', membership.accountId).eq('status', 'active'))
      .take(250)
    return { canManage, members: members.filter(m => m.role !== 'viewer').map(m => ({ id: m._id, name: m.name ?? m.email, email: m.email })) }
  }
})

export const setHandler = mutation({
  args: { uploadId: v.string(), memberId: v.union(v.id('accountMembers'), v.null()) },
  returns: v.null(),
  handler: async (ctx, { uploadId, memberId }) => {
    const { canManage, membership } = await workspaceAccess(ctx)
    if (!canManage || !membership) throw new ConvexError('Account administrator access is required.')
    const snap = await ctx.db.query('snaps').withIndex('by_metadata_upload_id', q => q.eq('metadata.upload_id', uploadId)).unique()
    if (!snap) throw new ConvexError('Snap not found.')
    let handler
    if (memberId !== null) {
      const member = await ctx.db.get('accountMembers', memberId)
      if (!member || member.accountId !== membership.accountId || member.status !== 'active' || member.role === 'viewer') {
        throw new ConvexError('Choose an active member of your account.')
      }
      const user = member.userId ? await ctx.db.get('users', member.userId) : null
      handler = { email: member.email, name: member.name ?? member.email, ...(user?.imageUrl ? { image_url: user.imageUrl } : {}) }
    }
    await ctx.db.patch('snaps', snap._id, { handler, updated_at: Date.now() })
    return null
  }
})
