import { createOpenAI } from '@ai-sdk/openai'

export const META_FILES_API_PURPOSE = 'user_data' as const

export type MetaConfigOverrides = {
  apiKey?: string
  baseURL?: string
  model?: string
}

export const getMetaConfig = (overrides: MetaConfigOverrides = {}) => ({
  apiKey: overrides.apiKey?.trim() || process.env.META_API_KEY?.trim() || '',
  baseURL: overrides.baseURL?.trim() || process.env.META_BASE_URL?.trim() || 'https://api.meta.ai/v1',
  model: overrides.model?.trim() || process.env.META_MODEL?.trim() || 'muse-spark-1.2-contributor'
})

export const isMetaConfigured = () => {
  const { apiKey, baseURL, model } = getMetaConfig()
  return Boolean(apiKey && baseURL && model)
}

export const createMetaProvider = () => {
  const { apiKey, baseURL } = getMetaConfig()

  if (!apiKey) {
    throw new Error('META_API_KEY is not configured')
  }

  if (!baseURL) {
    throw new Error('META_BASE_URL is not configured')
  }

  // OpenAI-compatible provider for Meta's Muse Spark
  return createOpenAI({
    apiKey,
    baseURL
  })
}

export const getMetaModel = (override?: string) => {
  const envModel = getMetaConfig().model
  const trimmedOverride = override?.trim()
  return trimmedOverride && trimmedOverride.length > 0 ? trimmedOverride : envModel
}

export const getMetaChatModel = (override?: string) => {
  const provider = createMetaProvider()
  const modelId = getMetaModel(override)
  return provider(modelId)
}

// Meta vision is same endpoint if model supports vision; fallback handled at call site
export const getMetaVisionModel = (override?: string) => getMetaChatModel(override)
