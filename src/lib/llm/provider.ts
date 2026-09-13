import { cohere } from '@ai-sdk/cohere'
import type { LanguageModel } from 'ai'
import {
  getFallbackProvider,
  type LlmProvider,
  type LlmProviderConfig,
  normalizeLlmProviderConfig
} from '@/lib/admin/llm-provider-settings'
import { getMetaChatModel, getMetaConfig, isMetaConfigured } from './meta'

export type ProviderResolution = {
  primary: LlmProvider
  fallback: LlmProvider | null
  fallbackEnabled: boolean
  metaModel?: string
  cohereModel?: string
  visionProvider: LlmProvider
}

export const resolveProviderConfig = async (
  fetchConfig?: () => Promise<LlmProviderConfig | null>
): Promise<ProviderResolution> => {
  let raw: LlmProviderConfig | null = null

  if (fetchConfig) {
    try {
      raw = await fetchConfig()
    } catch {
      raw = null
    }
  }

  const normalized = normalizeLlmProviderConfig(raw ?? {})

  // If primary is meta but meta is not configured, fallback to cohere
  if (normalized.primaryProvider === 'meta' && !isMetaConfigured()) {
    return {
      primary: 'cohere',
      fallback: null,
      fallbackEnabled: false,
      metaModel: normalized.metaModel,
      cohereModel: normalized.cohereModel,
      visionProvider: 'cohere'
    }
  }

  // If primary is cohere but cohere key missing, try meta if configured
  if (normalized.primaryProvider === 'cohere' && !process.env.COHERE_API_KEY && isMetaConfigured()) {
    return {
      primary: 'meta',
      fallback: null,
      fallbackEnabled: false,
      metaModel: normalized.metaModel,
      cohereModel: normalized.cohereModel,
      visionProvider: isMetaConfigured() ? 'meta' : 'cohere'
    }
  }

  const fallback = normalized.fallbackEnabled ? getFallbackProvider(normalized.primaryProvider) : null

  // If fallback provider not configured, disable fallback
  const effectiveFallback = (() => {
    if (!fallback) return null
    if (fallback === 'meta' && !isMetaConfigured()) return null
    if (fallback === 'cohere' && !process.env.COHERE_API_KEY) return null
    return fallback
  })()

  return {
    primary: normalized.primaryProvider,
    fallback: effectiveFallback,
    fallbackEnabled: Boolean(effectiveFallback),
    metaModel: normalized.metaModel,
    cohereModel: normalized.cohereModel,
    visionProvider: normalized.visionProvider ?? normalized.primaryProvider
  }
}

export const getLanguageModel = (
  provider: LlmProvider,
  modelId: string,
  opts?: { metaModelOverride?: string }
): LanguageModel => {
  if (provider === 'meta') {
    const metaModel = opts?.metaModelOverride ?? getMetaConfig().model
    // modelId is ignored for Meta if it is a Cohere ID - use metaModel instead
    // If modelId itself looks like a Meta model (muse-spark), use it
    const isMetaModelId = modelId.includes('muse-spark') || modelId.includes('meta')
    const effectiveId = isMetaModelId ? modelId : metaModel
    return getMetaChatModel(effectiveId) as unknown as LanguageModel
  }

  // cohere
  return cohere(modelId) as unknown as LanguageModel
}

export const getVisionModel = (provider: LlmProvider): LanguageModel => {
  if (provider === 'meta') {
    // Use Meta for vision if configured
    return getMetaChatModel(getMetaConfig().model) as unknown as LanguageModel
  }
  // Default Cohere vision
  // VISION_CHAT_MODEL_ID is imported at call site to avoid cycle
  return cohere('command-a-vision-07-2025') as unknown as LanguageModel
}
