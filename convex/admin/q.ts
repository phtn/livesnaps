import { ConvexError, v } from 'convex/values'
import {
  CRYPTO_PRIVATE_CREDENTIALS_IDENTIFIER,
  CRYPTO_WALLET_ADDRESSES_IDENTIFIER,
  CRYPTO_WALLET_DESTINATION_IDENTIFIER,
  normalizeCryptoPrivateCredentialsSetting,
  normalizeCryptoWalletAddressesSetting,
  normalizeCryptoWalletDestinationSetting,
  parseStoredAdminValue
} from '../../src/lib/admin/crypto-wallet-settings'
import {
  DEFAULT_LLM_PROVIDER_CONFIG,
  LLM_PROVIDER_CONFIG_IDENTIFIER,
  normalizeLlmProviderConfig
} from '../../src/lib/admin/llm-provider-settings'
import { type MutationCtx, type QueryCtx, mutation, query } from '../_generated/server'

type AdminCtx = MutationCtx | QueryCtx
type AdminDb = MutationCtx['db'] | QueryCtx['db']

const requireAdmin = async (ctx: AdminCtx) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity || identity.admin !== true) {
    throw new ConvexError('Unauthorized')
  }

  return identity
}

const getAdminDocumentByIdentifier = async (db: AdminDb, identifier: string) => {
  return await db
    .query('admin')
    .withIndex('by_identifier', (q) => q.eq('identifier', identifier))
    .first()
}

const getParsedAdminValue = (setting: { value: { data: { value: string } } } | null) => {
  if (!setting) {
    return { error: 'NOT_FOUND', status: 404 }
  }

  return parseStoredAdminValue(setting.value.data.value)
}

export const getAdminByIdentStrict = query({
  args: { identifier: v.string() },
  handler: async ({ db }, { identifier }) => {
    const setting = await getAdminDocumentByIdentifier(db, identifier)

    if (!setting) {
      return { error: `NOT_FOUND`, status: 404, message: identifier }
    }

    return getParsedAdminValue(setting)
  }
})

export const getCryptoWalletSettings = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx)

    const [walletAddressesSetting, walletDestinationSetting, privateCredentialsSetting] = await Promise.all([
      getAdminDocumentByIdentifier(ctx.db, CRYPTO_WALLET_ADDRESSES_IDENTIFIER),
      getAdminDocumentByIdentifier(ctx.db, CRYPTO_WALLET_DESTINATION_IDENTIFIER),
      getAdminDocumentByIdentifier(ctx.db, CRYPTO_PRIVATE_CREDENTIALS_IDENTIFIER)
    ])

    return {
      privateCredentials: normalizeCryptoPrivateCredentialsSetting(getParsedAdminValue(privateCredentialsSetting)),
      updatedAtByIdentifier: {
        crypto_private_credentials: privateCredentialsSetting?.value.updatedAt ?? null,
        crypto_wallet_addresses: walletAddressesSetting?.value.updatedAt ?? null,
        crypto_wallet_destination: walletDestinationSetting?.value.updatedAt ?? null
      },
      walletAddresses: normalizeCryptoWalletAddressesSetting(getParsedAdminValue(walletAddressesSetting)),
      walletDestination: normalizeCryptoWalletDestinationSetting(getParsedAdminValue(walletDestinationSetting))
    }
  }
})

const walletAddressEntryValidator = v.object({
  active: v.boolean(),
  address: v.string()
})

const walletDestinationValidator = v.object({
  bitcoin: v.string(),
  ethereum: v.string(),
  polygon: v.string(),
  sepolia: v.string(),
  amoy: v.string()
})

const evmRelayEntryValidator = v.object({
  enabled: v.boolean(),
  evmNative: v.string(),
  evmPrivate: v.string()
})

const bitcoinRelayEntryValidator = v.object({
  enabled: v.boolean(),
  btcApiUrl: v.string(),
  btcNative: v.string(),
  btcPrivate: v.string()
})

const upsertAdminValue = async (ctx: MutationCtx, identifier: string, payload: unknown) => {
  const existing = await getAdminDocumentByIdentifier(ctx.db, identifier)
  const now = Date.now()
  const value = {
    type: 'json',
    data: {
      key: identifier,
      value: JSON.stringify(payload, null, 2)
    },
    updatedAt: now
  }

  if (existing) {
    await ctx.db.patch(existing._id, { value })
    return now
  }

  await ctx.db.insert('admin', {
    identifier,
    value
  })
  return now
}

export const getLlmProviderSettings = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx)

    const doc = await getAdminDocumentByIdentifier(ctx.db, LLM_PROVIDER_CONFIG_IDENTIFIER)
    const parsed = doc ? parseStoredAdminValue(doc.value.data.value) : {}
    const normalized = normalizeLlmProviderConfig(parsed)

    return {
      ...normalized,
      updatedAt: doc?.value.updatedAt ?? null
    }
  }
})

export const getLlmProviderConfigPublic = query({
  args: {},
  handler: async (ctx) => {
    const doc = await ctx.db
      .query('admin')
      .withIndex('by_identifier', (q) => q.eq('identifier', LLM_PROVIDER_CONFIG_IDENTIFIER))
      .first()

    if (!doc) {
      return { ...DEFAULT_LLM_PROVIDER_CONFIG, updatedAt: null }
    }

    const parsed = parseStoredAdminValue(doc.value.data.value)
    return {
      ...normalizeLlmProviderConfig(parsed),
      updatedAt: doc.value.updatedAt ?? null
    }
  }
})

export const upsertCryptoWalletSettings = mutation({
  args: {
    privateCredentials: v.object({
      enabled: v.boolean(),
      ethereum: evmRelayEntryValidator,
      polygon: evmRelayEntryValidator,
      sepolia: evmRelayEntryValidator,
      amoy: evmRelayEntryValidator,
      bitcoin: bitcoinRelayEntryValidator
    }),
    walletAddresses: v.object({
      bitcoin: walletAddressEntryValidator,
      ethereum: walletAddressEntryValidator,
      polygon: walletAddressEntryValidator,
      sepolia: walletAddressEntryValidator,
      amoy: walletAddressEntryValidator
    }),
    walletDestination: walletDestinationValidator
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx)

    const now = Date.now()
    const privateCredentials = {
      enabled: args.privateCredentials.enabled,
      bitcoin: args.privateCredentials.bitcoin,
      ethereum: args.privateCredentials.ethereum,
      polygon: args.privateCredentials.polygon,
      sepolia: args.privateCredentials.sepolia,
      amoy: args.privateCredentials.amoy
    }

    await upsertAdminValue(ctx, CRYPTO_WALLET_ADDRESSES_IDENTIFIER, args.walletAddresses)
    await upsertAdminValue(ctx, CRYPTO_WALLET_DESTINATION_IDENTIFIER, args.walletDestination)
    await upsertAdminValue(ctx, CRYPTO_PRIVATE_CREDENTIALS_IDENTIFIER, privateCredentials)

    return { updatedAt: now }
  }
})
