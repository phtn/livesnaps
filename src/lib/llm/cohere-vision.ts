import { createCohere } from '@ai-sdk/cohere'
import { generateText, type LanguageModel, Output } from 'ai'
import { visionCarSchema } from './vision-car-schema'
import type { VisionCar, VisionTestMediaType } from './vision-test-contract'

export const DEFAULT_COHERE_VISION_MODEL = 'command-a-vision-07-2025'

export type CohereVisionTestInput = {
  abortSignal: AbortSignal
  apiKey?: string
  bytes: Uint8Array
  filename: string
  mediaType: VisionTestMediaType
  model?: string
  prompt: string
  systemPrompt: string
}

export type CohereVisionTestOutput = {
  car: VisionCar
  finishReason: string
  model: string
  text: string
  usage: {
    inputTokens: number | null
    outputTokens: number | null
    reasoningTokens: number | null
    totalTokens: number | null
  }
}

type CohereVisionDependencies = {
  model?: LanguageModel
}

export const getCohereVisionModel = (override?: string) => {
  const model = override?.trim() || process.env.COHERE_VISION_MODEL?.trim() || DEFAULT_COHERE_VISION_MODEL
  return model
}

export const isCohereConfigured = (apiKey = process.env.COHERE_API_KEY) => Boolean(apiKey?.trim())

export const runCohereVisionTest = async (
  input: CohereVisionTestInput,
  dependencies: CohereVisionDependencies = {}
): Promise<CohereVisionTestOutput> => {
  const modelId = getCohereVisionModel(input.model)
  const model = dependencies.model ?? createCohere({ apiKey: input.apiKey })(modelId)
  const result = await generateText({
    model,
    system: input.systemPrompt,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: input.prompt },
          {
            type: 'file',
            data: input.bytes,
            filename: input.filename,
            mediaType: input.mediaType,
            providerOptions: { cohere: { detail: 'auto' } }
          }
        ]
      }
    ],
    output: Output.object({
      schema: visionCarSchema,
      name: 'vision_car',
      description: 'Visible vehicle identity, plate, condition, damage, and miscellaneous observations.'
    }),
    maxOutputTokens: 1_536,
    abortSignal: input.abortSignal
  })

  const car = visionCarSchema.parse(result.output)

  return {
    car,
    finishReason: String(result.finishReason),
    model: result.response.modelId || modelId,
    text: JSON.stringify(car, null, 2),
    usage: {
      inputTokens: result.usage.inputTokens ?? null,
      outputTokens: result.usage.outputTokens ?? null,
      reasoningTokens: result.usage.outputTokenDetails.reasoningTokens ?? null,
      totalTokens: result.usage.totalTokens ?? null
    }
  }
}
