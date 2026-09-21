import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { getMetaConfig, META_FILES_API_PURPOSE } from './meta'
import { visionCarSchema } from './vision-car-schema'
import type { VisionCar, VisionTestMediaType } from './vision-test-contract'

const META_FILE_DELETE_TIMEOUT_MS = 5_000

// Meta can return model_not_found transiently for a model still in its catalog.
// The SDK does not retry 404s; retry this specific inference failure once.
const withMetaModelRetry = async <T>(input: MetaVisionTestInput, request: () => Promise<T>): Promise<T> => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await request()
    } catch (error) {
      if (!(error instanceof OpenAI.APIError) || error.status !== 404 || error.code !== 'model_not_found') {
        throw error
      }
      input.abortSignal.throwIfAborted()
      if (attempt === 0) continue

      const requestId = error.requestID
      throw new Error(
        `Meta could not serve model "${input.model}" on /v1/responses after two attempts. ` +
          `The model may be temporarily unavailable or inaccessible to this API key. ` +
          `Provider error: ${error.message}${requestId ? ` Request ID: ${requestId}.` : ''}`,
        { cause: error }
      )
    }
  }
}

export type MetaVisionClient = {
  files: Pick<OpenAI['files'], 'create' | 'delete'>
  responses: Pick<OpenAI['responses'], 'parse'>
}

export type MetaVisionFileInput = {
  apiKey?: string
  abortSignal: AbortSignal
  baseURL?: string
  bytes: Uint8Array
  filename: string
  mediaType: VisionTestMediaType
}

export type MetaVisionFileReference = {
  client: MetaVisionClient
  fileId: string
}

export type MetaVisionTestInput = MetaVisionFileInput & {
  model: string
  prompt: string
  systemPrompt: string
}

export type MetaVisionTestOutput = {
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

type MetaVisionFileDependencies = {
  client?: MetaVisionClient
  onCleanupError?: (error: unknown) => void
}

const createMetaVisionClient = (input: MetaVisionFileInput): MetaVisionClient => {
  const { apiKey, baseURL } = getMetaConfig(input)

  return new OpenAI({
    apiKey,
    baseURL,
    maxRetries: 1
  })
}

export const withMetaVisionFile = async <T>(
  input: MetaVisionFileInput,
  callback: (reference: MetaVisionFileReference) => Promise<T>,
  dependencies: MetaVisionFileDependencies = {}
): Promise<T> => {
  const client = dependencies.client ?? createMetaVisionClient(input)
  let providerFileId: string | null = null

  try {
    const uploadedFile = await client.files.create(
      {
        purpose: META_FILES_API_PURPOSE,
        // Expire temporary images even if the worker exits before finally can delete them.
        expires_after: { anchor: 'created_at', seconds: 3_600 },
        file: new File([input.bytes as unknown as BlobPart], input.filename, { type: input.mediaType })
      },
      { signal: input.abortSignal }
    )

    providerFileId = uploadedFile.id

    if (!providerFileId) {
      throw new Error('Meta Files API returned an upload without a file ID.')
    }

    return await callback({ client, fileId: providerFileId })
  } finally {
    if (providerFileId) {
      try {
        await client.files.delete(providerFileId, {
          signal: AbortSignal.timeout(META_FILE_DELETE_TIMEOUT_MS)
        })
      } catch (error) {
        dependencies.onCleanupError?.(error)
      }
    }
  }
}

export const runMetaVisionTest = async (
  input: MetaVisionTestInput,
  dependencies: MetaVisionFileDependencies = {}
): Promise<MetaVisionTestOutput> =>
  withMetaVisionFile(
    input,
    async ({ client, fileId }) => {
      const response = await withMetaModelRetry(input, () =>
        client.responses.parse(
          {
            input: [
              {
                role: 'system',
                content: input.systemPrompt
              },
              {
                role: 'user',
                content: [
                  { type: 'input_text', text: input.prompt },
                  {
                    type: 'input_image',
                    file_id: fileId,
                    detail: 'auto'
                  }
                ]
              }
            ],
            max_output_tokens: 1_536,
            model: input.model,
            reasoning: { effort: 'low' },
            store: false,
            text: {
              format: zodTextFormat(visionCarSchema, 'vision_car', {
                description: 'Visible vehicle identity, plate, condition, damage, and miscellaneous observations.'
              })
            }
          },
          { signal: input.abortSignal }
        )
      )

      if (response.error) {
        throw new Error(response.error.message || 'Meta returned an unsuccessful vision response.')
      }

      const car = visionCarSchema.parse(response.output_parsed ?? JSON.parse(response.output_text))

      return {
        car,
        finishReason: response.incomplete_details?.reason ?? response.status ?? 'completed',
        model: String(response.model || input.model),
        text: JSON.stringify(car, null, 2),
        usage: {
          inputTokens: response.usage?.input_tokens ?? null,
          outputTokens: response.usage?.output_tokens ?? null,
          reasoningTokens: response.usage?.output_tokens_details?.reasoning_tokens ?? null,
          totalTokens: response.usage?.total_tokens ?? null
        }
      }
    },
    dependencies
  )
