export const LLM_PROVIDER_CONFIG_IDENTIFIER = 'llm_provider_config'

export const LLM_PROVIDERS = ['cohere', 'meta'] as const
export type LlmProvider = (typeof LLM_PROVIDERS)[number]

export const LLM_PROVIDER_STRATEGIES = ['primary-only', 'fallback'] as const
export type LlmProviderStrategy = (typeof LLM_PROVIDER_STRATEGIES)[number]

export interface LlmProviderConfig {
  primaryProvider: LlmProvider
  fallbackEnabled: boolean
  // Optional explicit model overrides; if not set, env defaults are used
  metaModel?: string
  cohereModel?: string
  visionProvider?: LlmProvider
  updatedAt?: number | null
}

export const DEFAULT_LLM_PROVIDER_CONFIG: LlmProviderConfig = {
  primaryProvider: 'cohere',
  fallbackEnabled: true,
  metaModel: undefined,
  cohereModel: undefined,
  visionProvider: 'cohere',
  updatedAt: null
}

const isLlmProvider = (v: unknown): v is LlmProvider =>
  typeof v === 'string' && (LLM_PROVIDERS as readonly string[]).includes(v)

const asString = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined

const asBoolean = (v: unknown): boolean | undefined =>
  typeof v === 'boolean' ? v : undefined

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

export const normalizeLlmProviderConfig = (value: unknown): LlmProviderConfig => {
  const record = isRecord(value) ? value : {}
  const primaryProvider = isLlmProvider(record.primaryProvider) ? record.primaryProvider : DEFAULT_LLM_PROVIDER_CONFIG.primaryProvider
  const fallbackEnabled = asBoolean(record.fallbackEnabled) ?? DEFAULT_LLM_PROVIDER_CONFIG.fallbackEnabled
  const metaModel = asString(record.metaModel)
  const cohereModel = asString(record.cohereModel)
  const visionProvider = isLlmProvider(record.visionProvider) ? record.visionProvider : DEFAULT_LLM_PROVIDER_CONFIG.visionProvider
  const updatedAt = typeof record.updatedAt === 'number' ? record.updatedAt : null

  return {
    primaryProvider,
    fallbackEnabled,
    metaModel,
    cohereModel,
    visionProvider,
    updatedAt
  }
}

export const getFallbackProvider = (primary: LlmProvider): LlmProvider | null => {
  if (primary === 'cohere') return 'meta'
  if (primary === 'meta') return 'cohere'
  return null
}

export const getProviderDisplayLabel = (provider: LlmProvider): string => {
  if (provider === 'cohere') return 'Cohere'
  if (provider === 'meta') return 'Meta (Muse Spark)'
  return provider
}

export const getMetaEnvDefaults = () => ({
  apiKey: process.env.META_API_KEY ?? '',
  baseURL: process.env.META_BASE_URL ?? 'https://api.meta.ai/v1',
  model: process.env.META_MODEL ?? 'muse-spark-1.2-contributor'
})
