export interface ProofRuntimeMode {
  readonly debug: boolean
  readonly gpsRequired: boolean
  readonly mutationsEnabled: boolean
}

const DEBUG_MODE: ProofRuntimeMode = Object.freeze({
  debug: true,
  gpsRequired: false,
  mutationsEnabled: false
})

const LIVE_MODE: ProofRuntimeMode = Object.freeze({
  debug: false,
  gpsRequired: true,
  mutationsEnabled: true
})

export const getProofRuntimeMode = (
  environment: string | undefined = process.env.NODE_ENV
): ProofRuntimeMode => (environment === 'development' ? DEBUG_MODE : LIVE_MODE)
