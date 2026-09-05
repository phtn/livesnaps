import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  createCaptureIntegrityAnalysis,
  createUnavailableCaptureIntegrityAnalysis,
  getCaptureIntegrityDisposition,
  isCaptureIntegrityAnalysisPersistable,
  normalizeCaptureIntegrityModelOutput
} from './capture-integrity'

describe('proof capture integrity policy', () => {
  test('rejects only high-confidence display replays with corroborated evidence', () => {
    assert.equal(
      getCaptureIntegrityDisposition({
        confidence: 0.92,
        signals: ['screen_frame_or_bezel'],
        verdict: 'display_replay'
      }),
      'rejected'
    )
    assert.equal(
      getCaptureIntegrityDisposition({
        confidence: 0.97,
        signals: ['moire_pattern', 'pixel_or_subpixel_grid'],
        verdict: 'display_replay'
      }),
      'rejected'
    )
  })

  test('routes weak, contradictory, and low-confidence results to review', () => {
    assert.equal(
      getCaptureIntegrityDisposition({
        confidence: 0.99,
        signals: ['display_glare_or_reflection'],
        verdict: 'display_replay'
      }),
      'review'
    )
    assert.equal(
      getCaptureIntegrityDisposition({
        confidence: 0.91,
        signals: ['screen_frame_or_bezel'],
        verdict: 'display_replay'
      }),
      'review'
    )
    assert.equal(
      getCaptureIntegrityDisposition({
        confidence: 0.98,
        signals: ['moire_pattern'],
        verdict: 'physical_scene'
      }),
      'review'
    )
    assert.equal(getCaptureIntegrityDisposition({ confidence: 1, signals: [], verdict: 'uncertain' }), 'review')
  })

  test('accepts a sufficiently confident physical scene without display signals', () => {
    assert.equal(
      getCaptureIntegrityDisposition({ confidence: 0.75, signals: [], verdict: 'physical_scene' }),
      'accepted'
    )
  })

  test('fails malformed model output safely to an uncertain review result', () => {
    assert.deepEqual(
      normalizeCaptureIntegrityModelOutput({
        confidence: 4,
        signals: ['moire_pattern', 'moire_pattern', 'not-a-signal'],
        verdict: 'display_replay'
      }),
      {
        confidence: 0,
        signals: [],
        verdict: 'uncertain'
      }
    )
    assert.deepEqual(
      normalizeCaptureIntegrityModelOutput({
        confidence: 0.8,
        signals: ['moire_pattern'],
        verdict: 'display_replay'
      }),
      {
        confidence: 0.8,
        signals: ['moire_pattern'],
        verdict: 'display_replay'
      }
    )
    assert.deepEqual(normalizeCaptureIntegrityModelOutput(null), {
      confidence: 0,
      signals: [],
      verdict: 'uncertain'
    })
  })

  test('records deterministic completed and unavailable audit results', () => {
    assert.deepEqual(
      createCaptureIntegrityAnalysis(
        { confidence: 0.98, signals: ['browser_or_gallery_ui'], verdict: 'display_replay' },
        123
      ),
      {
        analyzed_at: 123,
        confidence: 0.98,
        disposition: 'rejected',
        model: 'command-a-vision-07-2025',
        signals: ['browser_or_gallery_ui'],
        status: 'completed',
        verdict: 'display_replay'
      }
    )
    assert.deepEqual(createUnavailableCaptureIntegrityAnalysis(456), {
      analyzed_at: 456,
      confidence: 0,
      disposition: 'review',
      model: 'command-a-vision-07-2025',
      signals: [],
      status: 'unavailable',
      verdict: 'uncertain'
    })
  })

  test('persists only fresh, internally consistent non-rejected analyses', () => {
    const accepted = createCaptureIntegrityAnalysis({ confidence: 0.9, signals: [], verdict: 'physical_scene' }, 1_100)
    const unavailable = createUnavailableCaptureIntegrityAnalysis(1_100)

    assert.equal(isCaptureIntegrityAnalysisPersistable(accepted, 1_000, 1_200), true)
    assert.equal(isCaptureIntegrityAnalysisPersistable(unavailable, 1_000, 1_200), true)
    assert.equal(
      isCaptureIntegrityAnalysisPersistable(
        createCaptureIntegrityAnalysis(
          { confidence: 0.99, signals: ['screen_frame_or_bezel'], verdict: 'display_replay' },
          1_100
        ),
        1_000,
        1_200
      ),
      false
    )
    assert.equal(isCaptureIntegrityAnalysisPersistable({ ...accepted, disposition: 'review' }, 1_000, 1_200), false)
    assert.equal(isCaptureIntegrityAnalysisPersistable({ ...accepted, analyzed_at: 999 }, 1_000, 1_200), false)
  })
})
