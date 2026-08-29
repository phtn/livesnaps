import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { savePhoto, savePhotoWithCaptureIntegrity } from './m'

interface ExportedMutationArgs {
  value: {
    photo: {
      fieldType: {
        value: {
          capture_integrity: {
            optional: boolean
          }
        }
      }
    }
  }
}

const isCaptureIntegrityOptional = (mutation: unknown) => {
  if (!((typeof mutation === 'object' && mutation !== null) || typeof mutation === 'function')) {
    throw new TypeError('Expected a registered Convex mutation.')
  }

  const exportArgs = Reflect.get(mutation, 'exportArgs') as unknown
  if (typeof exportArgs !== 'function') {
    throw new TypeError('Expected the mutation to export its argument validator.')
  }

  const exportedArgs = exportArgs.call(mutation) as unknown
  if (typeof exportedArgs !== 'string') {
    throw new TypeError('Expected a serialized Convex argument validator.')
  }

  const args = JSON.parse(exportedArgs) as ExportedMutationArgs

  return args.value.photo.fieldType.value.capture_integrity.optional
}

describe('proof photo mutation rollout contracts', () => {
  test('keeps the legacy writer compatible while deployed clients rotate', () => {
    assert.equal(isCaptureIntegrityOptional(savePhoto), true)
  })

  test('requires capture integrity on the current server upload path', () => {
    assert.equal(isCaptureIntegrityOptional(savePhotoWithCaptureIntegrity), false)
  })
})
