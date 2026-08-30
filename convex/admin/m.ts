import { ConvexError, v } from 'convex/values'
import { LLM_PROVIDER_CONFIG_IDENTIFIER, normalizeLlmProviderConfig } from '../../src/lib/admin/llm-provider-settings'
import { mutation } from '../_generated/server'

const requireAdmin = async (ctx: { auth: { getUserIdentity: () => Promise<unknown | null> } }) => {
  const identity = (await ctx.auth.getUserIdentity()) as { admin?: boolean } | null
  if (!identity || identity.admin !== true) {
    throw new ConvexError('Unauthorized')
  }
  return identity
}

const getAdminDocumentByIdentifier = async (
  db: {
    query: (table: string) => {
      withIndex: (
        name: string,
        fn: (q: { eq: (field: string, value: string) => unknown }) => unknown
      ) => { first: () => Promise<{ _id: string; value: { updatedAt: number } } | null> }
    }
  },
  identifier: string
) => {
  // typed wrapper not needed - use ctx.db directly in handler
  return null as unknown as { _id: string } | null
}

export const upsertLlmProviderSettings = mutation({
  args: {
    primaryProvider: v.union(v.literal('cohere'), v.literal('meta')),
    fallbackEnabled: v.boolean(),
    metaModel: v.optional(v.string()),
    cohereModel: v.optional(v.string()),
    visionProvider: v.optional(v.union(v.literal('cohere'), v.literal('meta')))
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx)

    const normalized = normalizeLlmProviderConfig({
      primaryProvider: args.primaryProvider,
      fallbackEnabled: args.fallbackEnabled,
      metaModel: args.metaModel,
      cohereModel: args.cohereModel,
      visionProvider: args.visionProvider ?? args.primaryProvider
    })

    const existing = await ctx.db
      .query('admin')
      .withIndex('by_identifier', (q) => q.eq('identifier', LLM_PROVIDER_CONFIG_IDENTIFIER))
      .first()

    const now = Date.now()
    const value = {
      type: 'json',
      data: {
        key: LLM_PROVIDER_CONFIG_IDENTIFIER,
        value: JSON.stringify(normalized, null, 2)
      },
      updatedAt: now
    }

    if (existing) {
      await ctx.db.patch(existing._id, { value })
    } else {
      await ctx.db.insert('admin', {
        identifier: LLM_PROVIDER_CONFIG_IDENTIFIER,
        value
      })
    }

    return { updatedAt: now, config: normalized }
  }
})
