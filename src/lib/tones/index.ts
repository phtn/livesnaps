export const CAPTURE_KEYS = ['error', 'invalid', 'good'] as const
export type CaptureToneKey = (typeof CAPTURE_KEYS)[number]

export const TONE_OSCILLATORS = ['sine', 'triangle', 'square', 'sawtooth'] as const
export type ToneOscillator = (typeof TONE_OSCILLATORS)[number]

export const TONE_SYNTH_TYPES = ['basic', 'glass'] as const
export type ToneSynthType = (typeof TONE_SYNTH_TYPES)[number]

export type ToneEventConfig = {
  enabled: boolean
  synthType: ToneSynthType
  waveform: ToneOscillator
  notes: string[]
  noteDurationMs: number
  gapMs: number
  volumeDb: number
}

export type ToneSetConfig<Key extends string> = {
  enabled: boolean
  tones: Record<Key, ToneEventConfig>
}

const DEFAULT_CAPTURE_EVENT_CONFIGS: Record<CaptureToneKey, ToneEventConfig> = {
  error: {
    enabled: true,
    synthType: 'basic',
    waveform: 'square',
    notes: ['A3', 'A3'],
    noteDurationMs: 110,
    gapMs: 70,
    volumeDb: -10
  },
  invalid: {
    enabled: true,
    synthType: 'basic',
    waveform: 'sawtooth',
    notes: ['E3', 'C3'],
    noteDurationMs: 160,
    gapMs: 50,
    volumeDb: -10
  },
  good: {
    enabled: true,
    synthType: 'basic',
    waveform: 'sine',
    notes: ['C5', 'E5', 'G5'],
    noteDurationMs: 100,
    gapMs: 45,
    volumeDb: -8
  }
}

export const DEFAULT_CAPTURE_EVENT_CONFIG: ToneSetConfig<CaptureToneKey> = {
  enabled: true,
  tones: DEFAULT_CAPTURE_EVENT_CONFIGS
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const mapToneKeys = <Key extends string, Value>(
  keys: readonly Key[],
  getValue: (key: Key) => Value
): Record<Key, Value> => Object.fromEntries(keys.map((key) => [key, getValue(key)])) as Record<Key, Value>

const clampNumber = (value: unknown, fallback: number, min: number, max: number) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

const normalizeNotes = (value: unknown, fallback: string[]) => {
  if (!Array.isArray(value)) return [...fallback]
  const notes = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)

  return notes.length > 0 ? notes : [...fallback]
}

export const parseNotesInput = (value: string) =>
  value
    .split(',')
    .map((note) => note.trim())
    .filter((note) => note.length > 0)

export const notesToInputValue = (notes: string[]) => notes.join(', ')

const normalizeToneEventConfig = (value: unknown, fallback: ToneEventConfig): ToneEventConfig => {
  const raw = isRecord(value) ? value : {}

  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : fallback.enabled,
    synthType: TONE_SYNTH_TYPES.includes(raw.synthType as ToneSynthType)
      ? (raw.synthType as ToneSynthType)
      : fallback.synthType,
    waveform: TONE_OSCILLATORS.includes(raw.waveform as ToneOscillator)
      ? (raw.waveform as ToneOscillator)
      : fallback.waveform,
    notes: normalizeNotes(raw.notes, fallback.notes),
    noteDurationMs: clampNumber(raw.noteDurationMs, fallback.noteDurationMs, 40, 1000),
    gapMs: clampNumber(raw.gapMs, fallback.gapMs, 0, 600),
    volumeDb: clampNumber(raw.volumeDb, fallback.volumeDb, -36, 0)
  }
}

type ToneKeyAliases<Key extends string> = Partial<Record<Key, readonly string[]>>

const getToneValue = <Key extends string>(values: Record<string, unknown>, key: Key, aliases: ToneKeyAliases<Key>) => {
  if (values[key] !== undefined) {
    return values[key]
  }

  for (const alias of aliases[key] ?? []) {
    if (values[alias] !== undefined) {
      return values[alias]
    }
  }

  return undefined
}

export const normalizeToneSetConfig = <Key extends string>(
  value: unknown,
  keys: readonly Key[],
  fallback: ToneSetConfig<Key>,
  aliases: ToneKeyAliases<Key> = {}
): ToneSetConfig<Key> => {
  const raw = isRecord(value) ? value : {}
  const rawTones = isRecord(raw.tones) ? raw.tones : raw

  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : fallback.enabled,
    tones: mapToneKeys(keys, (key) =>
      normalizeToneEventConfig(getToneValue(rawTones, key, aliases), fallback.tones[key])
    )
  }
}

export const serializeToneSetConfig = <Key extends string>(
  config: ToneSetConfig<Key>,
  keys: readonly Key[]
): ToneSetConfig<Key> => ({
  enabled: config.enabled,
  tones: mapToneKeys(keys, (key) => ({
    ...config.tones[key],
    notes: [...config.tones[key].notes]
  }))
})

export const normalizeCaptureTonesConfig = (value: unknown) =>
  normalizeToneSetConfig(value, CAPTURE_KEYS, DEFAULT_CAPTURE_EVENT_CONFIG)

export const serializeCaptureTonesConfig = (config: ToneSetConfig<CaptureToneKey>) =>
  serializeToneSetConfig(config, CAPTURE_KEYS)

export const serializeScanTicketTonesConfig = (config: ToneSetConfig<CaptureToneKey>) =>
  serializeToneSetConfig(config, CAPTURE_KEYS)

export const SHUTTER_TYPES = ['dslr', 'mirrorless', 'phone', 'burst'] as const
export type ShutterType = (typeof SHUTTER_TYPES)[number]

export type ShutterConfig = {
  enabled: boolean
  type: ShutterType
  volumeDb: number
}

export const DEFAULT_SHUTTER_CONFIG: ShutterConfig = {
  enabled: true,
  type: 'mirrorless',
  volumeDb: -6
}

export const normalizeShutterConfig = (value: unknown): ShutterConfig => {
  const raw = isRecord(value) ? value : {}
  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULT_SHUTTER_CONFIG.enabled,
    type: SHUTTER_TYPES.includes(raw.type as ShutterType) ? (raw.type as ShutterType) : DEFAULT_SHUTTER_CONFIG.type,
    volumeDb: clampNumber(raw.volumeDb, DEFAULT_SHUTTER_CONFIG.volumeDb, -36, 0)
  }
}

export const serializeShutterConfig = (config: ShutterConfig): ShutterConfig => ({ ...config })

// Product order tones (single "entry" tone, legacy alias "orders") — kept for bun:test compat
export const PRODUCT_ORDER_TONE_KEYS = ['entry'] as const
export type ProductOrderToneKey = (typeof PRODUCT_ORDER_TONE_KEYS)[number]

const DEFAULT_PRODUCT_ORDER_EVENT_CONFIGS: Record<ProductOrderToneKey, ToneEventConfig> = {
  entry: {
    enabled: true,
    synthType: 'basic',
    waveform: 'sine',
    notes: ['C5', 'E5', 'G5'],
    noteDurationMs: 100,
    gapMs: 45,
    volumeDb: -8
  }
}

export const DEFAULT_PRODUCT_ORDER_CONFIG: ToneSetConfig<ProductOrderToneKey> = {
  enabled: false,
  tones: DEFAULT_PRODUCT_ORDER_EVENT_CONFIGS
}

export const normalizeProductOrderTonesConfig = (value: unknown) =>
  normalizeToneSetConfig(value, PRODUCT_ORDER_TONE_KEYS, DEFAULT_PRODUCT_ORDER_CONFIG, {
    entry: ['orders']
  })

export const serializeProductOrderTonesConfig = (config: ToneSetConfig<ProductOrderToneKey>) =>
  serializeToneSetConfig(config, PRODUCT_ORDER_TONE_KEYS)

let toneModulePromise: Promise<typeof import('tone')> | null = null

const loadTone = () => {
  if (!toneModulePromise) {
    toneModulePromise = import('tone').catch((error: unknown) => {
      toneModulePromise = null
      throw error
    })
  }

  return toneModulePromise
}

export const preloadTonePlayback = async () => {
  await loadTone()
}

export const prepareTonePlayback = async () => {
  const Tone = await loadTone()
  await Tone.start()
}

export const playTone = async (config: ToneEventConfig) => {
  if (!config.enabled || config.notes.length === 0) return

  const Tone = await loadTone()
  await Tone.start()

  if (config.synthType === 'glass') {
    const synth = new Tone.FMSynth({
      harmonicity: 8,
      modulationIndex: 12,
      oscillator: { type: 'sine' },
      envelope: {
        attack: 0.001,
        decay: 0.15,
        sustain: 0,
        release: 0.2
      },
      modulation: { type: 'sine' },
      modulationEnvelope: {
        attack: 0.001,
        decay: 0.1,
        sustain: 0,
        release: 0.15
      }
    })
    const reverb = new Tone.Reverb({ decay: 1.2, wet: 0.5 }).toDestination()

    synth.volume.value = config.volumeDb
    synth.connect(reverb)

    const note = config.notes[0] ?? 'G6'
    const durationSeconds = Math.max(0.08, config.noteDurationMs / 1000)

    try {
      await reverb.ready
      synth.triggerAttackRelease(note, durationSeconds)
    } catch (error) {
      synth.dispose()
      reverb.dispose()
      throw error
    }

    globalThis.setTimeout(() => {
      synth.dispose()
      reverb.dispose()
    }, config.noteDurationMs + 1400)
    return
  }

  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: config.waveform },
    envelope: {
      attack: 0.01,
      decay: 0.12,
      sustain: 0.08,
      release: 0.18
    }
  }).toDestination()

  synth.volume.value = config.volumeDb

  const now = Tone.now()
  const durationSeconds = Math.max(0.04, config.noteDurationMs / 1000)
  const gapSeconds = Math.max(0, config.gapMs / 1000)

  try {
    config.notes.forEach((note, index) => {
      const time = now + index * (durationSeconds + gapSeconds)
      synth.triggerAttackRelease(note, durationSeconds, time)
    })
  } catch (error) {
    synth.dispose()
    throw error
  }

  const totalDurationMs =
    config.notes.length * config.noteDurationMs + Math.max(0, config.notes.length - 1) * config.gapMs

  globalThis.setTimeout(() => {
    synth.dispose()
  }, totalDurationMs + 250)
}

export const playToneSetEvent = async <Key extends string>(config: ToneSetConfig<Key>, key: Key) => {
  if (!config.enabled) return
  await playTone(config.tones[key])
}

interface ShutterEngine {
  playDSLR: () => void
  playMirrorless: () => void
  playPhone: () => void
  playBurst: (shots?: number, intervalSeconds?: number) => void
  dispose: () => void
}

let engineInstance: ShutterEngine | null = null

export async function createShutterEngine(): Promise<ShutterEngine> {
  const Tone = await loadTone()
  await Tone.start()

  if (engineInstance) return engineInstance

  await Tone.start()

  const filter = new Tone.Filter(4000, 'highpass').toDestination()

  const noiseSynth = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.02, sustain: 0 }
  }).connect(filter)

  const click = new Tone.NoiseSynth({
    noise: { type: 'pink' },
    envelope: { attack: 0.001, decay: 0.008, sustain: 0 }
  }).toDestination()

  const metal = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 0.04, release: 0.01 },
    harmonicity: 8,
    modulationIndex: 20,
    resonance: 3000,
    octaves: 1.2
  }).toDestination()
  metal.volume.value = -18

  const playDSLR = (): void => {
    const now: number = Tone.now()
    noiseSynth.triggerAttackRelease('16n', now)
    noiseSynth.triggerAttackRelease('32n', now + 0.055)
  }

  const playMirrorless = (): void => {
    click.triggerAttackRelease('16n', Tone.now())
  }

  const playPhone = (): void => {
    const now: number = Tone.now()
    metal.triggerAttackRelease('C3', '16n', now)
    noiseSynth.triggerAttackRelease('8n', now + 0.002)
  }

  const playBurst = (shots: number = 5, intervalSeconds: number = 0.12): void => {
    const now: number = Tone.now()
    for (let i = 0; i < shots; i += 1) {
      click.triggerAttackRelease('32n', now + i * intervalSeconds)
    }
  }

  const dispose = (): void => {
    filter.dispose()
    noiseSynth.dispose()
    click.dispose()
    metal.dispose()
    engineInstance = null
  }

  engineInstance = { playDSLR, playMirrorless, playPhone, playBurst, dispose }
  return engineInstance
}
