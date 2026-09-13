import assert from 'node:assert/strict'
import { test } from 'node:test'
import { visionCarSchema } from './vision-car-schema'
import {
  CUSTOM_VISION_TEST_PROMPT_ID,
  DEFAULT_VISION_TEST_PROMPT,
  DEFAULT_VISION_TEST_PROMPT_ID,
  getVisionTestFileError,
  getVisionTestPromptError,
  getVisionTestPromptLabel,
  getVisionTestPromptPreset,
  isVisionTestMediaType,
  isVisionTestPromptId,
  isVisionTestProvider,
  PROMPT_1,
  resolveVisionTestPrompt,
  VISION_TEST_MAX_IMAGE_BYTES,
  VISION_TEST_MAX_PROMPT_CHARACTERS
} from './vision-test-contract'

test('vision test provider and media type guards accept only supported values', () => {
  assert.equal(isVisionTestProvider('configured'), true)
  assert.equal(isVisionTestProvider('cohere'), true)
  assert.equal(isVisionTestProvider('meta'), true)
  assert.equal(isVisionTestProvider('openai'), false)

  assert.equal(isVisionTestMediaType('image/jpeg'), true)
  assert.equal(isVisionTestMediaType('image/png'), true)
  assert.equal(isVisionTestMediaType('image/webp'), true)
  assert.equal(isVisionTestMediaType('image/svg+xml'), false)
})

test('vision test image validation rejects missing, empty, oversized, and unsupported files', () => {
  assert.equal(getVisionTestFileError(null), 'Choose an image to test.')
  assert.equal(getVisionTestFileError({ size: 0, type: 'image/png' }), 'The selected image is empty.')
  assert.equal(
    getVisionTestFileError({ size: VISION_TEST_MAX_IMAGE_BYTES + 1, type: 'image/png' }),
    'The image must be 10 MB or smaller.'
  )
  assert.equal(getVisionTestFileError({ size: 100, type: '' }), 'Use a JPEG, PNG, or WebP image.')
  assert.equal(getVisionTestFileError({ size: 100, type: 'image/svg+xml' }), 'Use a JPEG, PNG, or WebP image.')
  assert.equal(getVisionTestFileError({ size: 100, type: 'image/webp' }), undefined)
})

test('vision test prompt validation rejects blank and oversized prompts', () => {
  assert.equal(getVisionTestPromptError('   '), 'Enter a prompt for the vision model.')
  assert.match(getVisionTestPromptError('a'.repeat(VISION_TEST_MAX_PROMPT_CHARACTERS + 1)) ?? '', /under 4,000/)
  assert.equal(getVisionTestPromptError('Describe this image.'), undefined)
})

test('prompt 1 is the default preset and custom prompts resolve explicitly', () => {
  assert.equal(DEFAULT_VISION_TEST_PROMPT_ID, 'prompt-1')
  assert.equal(DEFAULT_VISION_TEST_PROMPT, PROMPT_1)
  assert.equal(getVisionTestPromptPreset(DEFAULT_VISION_TEST_PROMPT_ID).prompt, PROMPT_1)
  assert.equal(getVisionTestPromptLabel(DEFAULT_VISION_TEST_PROMPT_ID), 'Prompt 1')
  assert.equal(isVisionTestPromptId(DEFAULT_VISION_TEST_PROMPT_ID), true)
  assert.equal(isVisionTestPromptId(CUSTOM_VISION_TEST_PROMPT_ID), true)
  assert.equal(isVisionTestPromptId('prompt-2'), false)
  assert.equal(resolveVisionTestPrompt(DEFAULT_VISION_TEST_PROMPT_ID, 'ignored'), PROMPT_1)
  assert.equal(resolveVisionTestPrompt(CUSTOM_VISION_TEST_PROMPT_ID, '  Inspect damage.  '), 'Inspect damage.')
})

test('the shared car response schema accepts the requested JSON shape', () => {
  assert.deepEqual(
    visionCarSchema.parse({
      classification: 'car',
      make: 'Toyota',
      model: 'Raize',
      year: null,
      color: 'Gray',
      plate: 'NJE 2990',
      damages: [],
      misc: ['Rear view']
    }),
    {
      classification: 'car',
      make: 'Toyota',
      model: 'Raize',
      year: null,
      color: 'Gray',
      plate: 'NJE 2990',
      damages: [],
      misc: ['Rear view']
    }
  )
  assert.throws(() => visionCarSchema.parse({ classification: 'truck' }))
})
