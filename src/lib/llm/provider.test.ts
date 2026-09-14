import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { resolveProviderConfig } from './provider'

describe('LLM provider resolution', () => {
  test('honors the stored Vision provider and model overrides when both providers are available', async () => {
    const result = await resolveProviderConfig(
      async () => ({
        cohereModel: 'cohere-capture-model',
        fallbackEnabled: true,
        metaModel: 'meta-capture-model',
        primaryProvider: 'cohere',
        visionProvider: 'meta'
      }),
      { cohere: true, meta: true }
    )

    assert.equal(result.visionProvider, 'meta')
    assert.equal(result.cohereModel, 'cohere-capture-model')
    assert.equal(result.metaModel, 'meta-capture-model')
  })

  test('falls back when the configured primary provider is unavailable', async () => {
    const result = await resolveProviderConfig(
      async () => ({
        fallbackEnabled: true,
        primaryProvider: 'meta',
        visionProvider: 'meta'
      }),
      { cohere: true, meta: false }
    )

    assert.equal(result.primary, 'cohere')
    assert.equal(result.visionProvider, 'cohere')
  })
})
