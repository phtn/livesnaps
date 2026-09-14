import { describe, expect, test } from 'vitest'
import { getCaptureProgressCount } from '../src/components/captured-photo-state'

describe('capture photo progress', () => {
  test('does not count failed uploads as completed capture progress', () => {
    const photos = [
      { id: 'front', index: 1, uploadStatus: 'saved' as const },
      { id: 'back', index: 2, uploadStatus: 'saving' as const },
      { id: 'side-a', index: 3, uploadStatus: 'failed' as const }
    ]

    expect(getCaptureProgressCount(photos)).toBe(2)
  })
})
