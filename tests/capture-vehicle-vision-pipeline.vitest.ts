import type { ConvexHttpClient } from 'convex/browser'
import { beforeEach, expect, test, vi } from 'vitest'
import { runCohereVisionTest } from '../src/lib/llm/cohere-vision'
import { runMetaVisionTest } from '../src/lib/llm/meta-vision-files'
import { resolveProviderConfig } from '../src/lib/llm/provider'
import { DEFAULT_VISION_TEST_PROMPT, VISION_SYSTEM_PROMPT } from '../src/lib/llm/vision-test-contract'
import { getR2Object } from '../src/lib/r2/server'
import { runCaptureVehicleVisionPipeline } from '../src/server/capture-vehicle-vision'

vi.mock('../src/lib/llm/cohere-vision', () => ({
  getCohereVisionModel: () => 'cohere-vision',
  runCohereVisionTest: vi.fn()
}))
vi.mock('../src/lib/llm/meta-vision-files', () => ({ runMetaVisionTest: vi.fn() }))
vi.mock('../src/lib/llm/provider', () => ({ resolveProviderConfig: vi.fn() }))
vi.mock('../src/lib/r2/server', () => ({ getR2Object: vi.fn() }))

beforeEach(() => vi.resetAllMocks())

test.each(['cohere', 'meta'] as const)('capture uses bench prompts and preserves full %s vehicle JSON for both views', async (provider) => {
  vi.mocked(resolveProviderConfig).mockResolvedValue({
    primary: provider, fallback: null, fallbackEnabled: false, visionProvider: provider
  })
  vi.mocked(getR2Object).mockImplementation(async () => new Response(new Uint8Array([1, 2, 3])))
  const car = {
    classification: 'car' as const, make: 'Toyota', model: 'Corolla', year: null,
    color: 'white', plate: null, damages: ['Scratched bumper'], misc: ['Visible dealer sticker']
  }
  const output = {
    car, text: JSON.stringify(car, null, 2), model: 'vision-model', finishReason: 'completed',
    usage: { inputTokens: 10, outputTokens: 20, reasoningTokens: null, totalTokens: 30 }
  }
  const runner = vi.mocked(provider === 'meta' ? runMetaVisionTest : runCohereVisionTest)
  runner.mockResolvedValue(output)
  const mutation = vi.fn()
    .mockResolvedValueOnce({ r2_key: 'front.webp', slot: 1, log_id: 'front-log' })
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ r2_key: 'back.webp', slot: 2, log_id: 'back-log' })
    .mockResolvedValueOnce(null)
  const client = { mutation, query: vi.fn() } as unknown as ConvexHttpClient

  await runCaptureVehicleVisionPipeline(client, 'upload-id', {
    cohereApiKey: 'test-cohere-key', metaApiKey: 'test-meta-key'
  })

  expect(runner).toHaveBeenCalledTimes(2)
  for (const [index, view] of ['front', 'back'].entries()) {
    expect(runner.mock.calls[index][0]).toMatchObject({
      prompt: DEFAULT_VISION_TEST_PROMPT,
      systemPrompt: VISION_SYSTEM_PROMPT,
      filename: `capture-${view}.webp`,
      mediaType: 'image/webp'
    })
    expect(mutation.mock.calls[index * 2 + 1][1]).toEqual({
      log_id: `${view}-log`, status: 'completed', rawOutput: output.text,
      vehicle: { make: 'Toyota', model: 'Corolla', plate_number: '' }
    })
  }
  expect(provider === 'meta' ? runCohereVisionTest : runMetaVisionTest).not.toHaveBeenCalled()
})
