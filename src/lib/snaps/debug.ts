export interface SnapRuntimeMode {
  readonly debug: boolean
  readonly gpsRequired: boolean
  readonly mutationsEnabled: boolean
}

const DEBUG_MODE: SnapRuntimeMode = Object.freeze({
  debug: true,
  gpsRequired: false,
  mutationsEnabled: false
})

const LIVE_MODE: SnapRuntimeMode = Object.freeze({
  debug: false,
  gpsRequired: true,
  mutationsEnabled: true
})

export const getSnapRuntimeMode = (environment: string | undefined = process.env.NODE_ENV): SnapRuntimeMode =>
  environment === 'development' ? DEBUG_MODE : LIVE_MODE
