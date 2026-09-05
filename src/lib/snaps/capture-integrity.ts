export const CAPTURE_INTEGRITY_MODEL = 'command-a-vision-07-2025'
export const CAPTURE_INTEGRITY_REJECTION_CONFIDENCE = 0.92
export const CAPTURE_INTEGRITY_ACCEPTANCE_CONFIDENCE = 0.75

export const CAPTURE_INTEGRITY_VERDICTS = ['physical_scene', 'display_replay', 'uncertain'] as const
export const CAPTURE_INTEGRITY_SIGNALS = [
  'screen_frame_or_bezel',
  'browser_or_gallery_ui',
  'moire_pattern',
  'pixel_or_subpixel_grid',
  'scan_or_flicker_banding',
  'display_glare_or_reflection',
  'flat_reprojection'
] as const

export type CaptureIntegrityVerdict = (typeof CAPTURE_INTEGRITY_VERDICTS)[number]
export type CaptureIntegritySignal = (typeof CAPTURE_INTEGRITY_SIGNALS)[number]
export type CaptureIntegrityDisposition = 'accepted' | 'review' | 'rejected'
export type CaptureIntegrityStatus = 'completed' | 'unavailable'

export interface CaptureIntegrityModelOutput {
  confidence: number
  signals: CaptureIntegritySignal[]
  verdict: CaptureIntegrityVerdict
}

export interface CaptureIntegrityAnalysis extends CaptureIntegrityModelOutput {
  analyzed_at: number
  disposition: CaptureIntegrityDisposition
  model: typeof CAPTURE_INTEGRITY_MODEL
  status: CaptureIntegrityStatus
}

const verdicts = new Set<string>(CAPTURE_INTEGRITY_VERDICTS)
const allowedSignals = new Set<string>(CAPTURE_INTEGRITY_SIGNALS)
const directDisplaySignals = new Set<CaptureIntegritySignal>(['screen_frame_or_bezel', 'browser_or_gallery_ui'])
const displayArtifactSignals = new Set<CaptureIntegritySignal>([
  'moire_pattern',
  'pixel_or_subpixel_grid',
  'scan_or_flicker_banding'
])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export const normalizeCaptureIntegrityModelOutput = (value: unknown): CaptureIntegrityModelOutput => {
  if (!isRecord(value)) {
    return { confidence: 0, signals: [], verdict: 'uncertain' }
  }

  const isValidConfidence =
    typeof value.confidence === 'number' &&
    Number.isFinite(value.confidence) &&
    value.confidence >= 0 &&
    value.confidence <= 1
  const isValidVerdict = typeof value.verdict === 'string' && verdicts.has(value.verdict)
  const isValidSignals =
    Array.isArray(value.signals) &&
    value.signals.every((signal) => typeof signal === 'string' && allowedSignals.has(signal)) &&
    new Set(value.signals).size === value.signals.length

  if (!isValidConfidence || !isValidVerdict || !isValidSignals) {
    return { confidence: 0, signals: [], verdict: 'uncertain' }
  }

  return {
    confidence: value.confidence as number,
    signals: value.signals as CaptureIntegritySignal[],
    verdict: value.verdict as CaptureIntegrityVerdict
  }
}

export const getCaptureIntegrityDisposition = ({
  confidence,
  signals,
  verdict
}: CaptureIntegrityModelOutput): CaptureIntegrityDisposition => {
  const hasDirectDisplayEvidence = signals.some((signal) => directDisplaySignals.has(signal))
  const displayArtifactCount = signals.filter((signal) => displayArtifactSignals.has(signal)).length
  const hasCorroboratedDisplayEvidence = hasDirectDisplayEvidence || displayArtifactCount >= 2

  if (
    verdict === 'display_replay' &&
    confidence >= CAPTURE_INTEGRITY_REJECTION_CONFIDENCE &&
    hasCorroboratedDisplayEvidence
  ) {
    return 'rejected'
  }

  if (verdict === 'physical_scene' && confidence >= CAPTURE_INTEGRITY_ACCEPTANCE_CONFIDENCE && signals.length === 0) {
    return 'accepted'
  }

  return 'review'
}

export const createCaptureIntegrityAnalysis = (output: unknown, analyzedAt = Date.now()): CaptureIntegrityAnalysis => {
  const normalized = normalizeCaptureIntegrityModelOutput(output)

  return {
    ...normalized,
    analyzed_at: analyzedAt,
    disposition: getCaptureIntegrityDisposition(normalized),
    model: CAPTURE_INTEGRITY_MODEL,
    status: 'completed'
  }
}

export const createUnavailableCaptureIntegrityAnalysis = (analyzedAt = Date.now()): CaptureIntegrityAnalysis => ({
  analyzed_at: analyzedAt,
  confidence: 0,
  disposition: 'review',
  model: CAPTURE_INTEGRITY_MODEL,
  signals: [],
  status: 'unavailable',
  verdict: 'uncertain'
})

export const isCaptureIntegrityAnalysisPersistable = (
  analysis: CaptureIntegrityAnalysis,
  capturedAt: number,
  now = Date.now()
) => {
  const expectedDisposition = analysis.status === 'unavailable' ? 'review' : getCaptureIntegrityDisposition(analysis)
  const isUnavailableResultValid =
    analysis.status !== 'unavailable' ||
    (analysis.confidence === 0 &&
      analysis.disposition === 'review' &&
      analysis.signals.length === 0 &&
      analysis.verdict === 'uncertain')

  return (
    analysis.model === CAPTURE_INTEGRITY_MODEL &&
    Number.isFinite(analysis.confidence) &&
    analysis.confidence >= 0 &&
    analysis.confidence <= 1 &&
    Number.isSafeInteger(analysis.analyzed_at) &&
    analysis.analyzed_at >= capturedAt &&
    analysis.analyzed_at <= now + 5_000 &&
    new Set(analysis.signals).size === analysis.signals.length &&
    isUnavailableResultValid &&
    analysis.disposition === expectedDisposition &&
    expectedDisposition !== 'rejected'
  )
}
