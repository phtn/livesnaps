import type { ConvexHttpClient } from 'convex/browser'
import { api } from '../../convex/_generated/api'
import { getCohereVisionModel, runCohereVisionTest } from '../lib/llm/cohere-vision'
import { getMetaConfig } from '../lib/llm/meta'
import { runMetaVisionTest } from '../lib/llm/meta-vision-files'
import { resolveProviderConfig } from '../lib/llm/provider'
import {
  DEFAULT_VISION_TEST_PROMPT,
  type ResolvedVisionTestProvider,
  VISION_SYSTEM_PROMPT
} from '../lib/llm/vision-test-contract'
import { getR2Object, type R2Config } from '../lib/r2/server'
import { getSnapImageContentType, getSnapImageExtension, type SnapImageContentType } from '../lib/r2/snap-images'
import type { VehicleDetails } from '../lib/snaps/vehicle-details'

const CAPTURE_VEHICLE_VISION_TIMEOUT_MS = 25_000

export interface CaptureVehicleVisionEnvironment {
  cohereApiKey?: string
  cohereVisionModel?: string
  metaApiKey?: string
  metaBaseURL?: string
  metaModel?: string
  r2AccountId?: string
  r2AccessKeyId?: string
  r2Bucket?: string
  r2SecretAccessKey?: string
}

type CaptureVehicleVisionRuntime = {
  apiKey: string
  baseURL?: string
  model: string
  provider: ResolvedVisionTestProvider
}

const resolveCaptureVehicleVisionRuntime = async (
  client: ConvexHttpClient,
  environment: CaptureVehicleVisionEnvironment
): Promise<CaptureVehicleVisionRuntime | null> => {
  const cohereApiKey = environment.cohereApiKey?.trim() || process.env.COHERE_API_KEY?.trim() || ''
  const configuredMeta = getMetaConfig({
    apiKey: environment.metaApiKey,
    baseURL: environment.metaBaseURL
  })
  const resolution = await resolveProviderConfig(() => client.query(api.admin.q.getLlmProviderConfigPublic, {}), {
    cohere: Boolean(cohereApiKey),
    meta: Boolean(configuredMeta.apiKey)
  })
  const cohereModel = getCohereVisionModel(resolution.cohereModel ?? environment.cohereVisionModel)
  const meta = getMetaConfig({
    ...configuredMeta,
    model: resolution.metaModel ?? environment.metaModel
  })
  const preferred = resolution.visionProvider

  if (preferred === 'meta' && meta.apiKey) {
    return { apiKey: meta.apiKey, baseURL: meta.baseURL, model: meta.model, provider: 'meta' }
  }

  if (preferred === 'cohere' && cohereApiKey) {
    return { apiKey: cohereApiKey, model: cohereModel, provider: 'cohere' }
  }

  if (cohereApiKey) return { apiKey: cohereApiKey, model: cohereModel, provider: 'cohere' }
  if (meta.apiKey) return { apiKey: meta.apiKey, baseURL: meta.baseURL, model: meta.model, provider: 'meta' }
  return null
}

const toVehicleDetails = (car: {
  make: string | null
  model: string | null
  plate: string | null
}): VehicleDetails => ({
  make: car.make ?? '',
  model: car.model ?? '',
  plate_number: car.plate ?? ''
})

const getVisionErrorMessage = (error: unknown) =>
  error instanceof Error && error.message.trim() ? error.message : 'The vehicle Vision request failed.'

const getR2Config = (environment: CaptureVehicleVisionEnvironment): Partial<R2Config> => ({
  accessKeyId: environment.r2AccessKeyId,
  accountId: environment.r2AccountId,
  bucket: environment.r2Bucket,
  secretAccessKey: environment.r2SecretAccessKey
})

const analyzeVehicleImage = async (
  bytes: Uint8Array,
  slot: 1 | 2,
  mediaType: SnapImageContentType,
  runtime: CaptureVehicleVisionRuntime
) => {
  const input = {
    abortSignal: AbortSignal.timeout(CAPTURE_VEHICLE_VISION_TIMEOUT_MS),
    bytes,
    filename: `capture-${slot === 1 ? 'front' : 'back'}.${getSnapImageExtension(mediaType)}`,
    mediaType,
    model: runtime.model,
    prompt: DEFAULT_VISION_TEST_PROMPT,
    systemPrompt: VISION_SYSTEM_PROMPT
  }

  if (runtime.provider === 'meta') {
    const result = await runMetaVisionTest({
      ...input,
      apiKey: runtime.apiKey,
      baseURL: runtime.baseURL
    })
    return { rawOutput: result.text, vehicle: toVehicleDetails(result.car) }
  }

  const result = await runCohereVisionTest({ ...input, apiKey: runtime.apiKey })
  return { rawOutput: result.text, vehicle: toVehicleDetails(result.car) }
}

/**
 * Runs outside the upload response. Convex owns the atomic front/back claim so
 * concurrent upload requests cannot analyze the rear before the front settles.
 */
export async function runCaptureVehicleVisionPipeline(
  client: ConvexHttpClient,
  uploadId: string,
  environment: CaptureVehicleVisionEnvironment
) {
  const runtime = await resolveCaptureVehicleVisionRuntime(client, environment)
  if (!runtime) return

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const job = await client.mutation(api.vision_logs.m.claimCaptureVehicleVision, {
      model: runtime.model,
      provider: runtime.provider,
      upload_id: uploadId
    })
    if (!job) return

    try {
      const response = await getR2Object(job.r2_key, getR2Config(environment))
      if (!response.ok) throw new Error(`Unable to load the ${job.slot === 1 ? 'front' : 'back'} image.`)

      const mediaType = getSnapImageContentType(job.r2_key)
      if (!mediaType) throw new Error('The captured image format is unsupported.')
      const result = await analyzeVehicleImage(
        new Uint8Array(await response.arrayBuffer()),
        job.slot,
        mediaType,
        runtime
      )
      await client.mutation(api.vision_logs.m.completeCaptureVehicleVision, {
        log_id: job.log_id,
        rawOutput: result.rawOutput,
        status: 'completed',
        vehicle: result.vehicle
      })
    } catch (error) {
      await client.mutation(api.vision_logs.m.completeCaptureVehicleVision, {
        errorMessage: getVisionErrorMessage(error),
        log_id: job.log_id,
        status: 'unavailable'
      })
    }
  }
}
