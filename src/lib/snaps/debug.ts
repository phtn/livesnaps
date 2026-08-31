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

export const isLocalDevelopmentHostname = (hostname: string | undefined): boolean =>
  hostname === 'localhost' ||
  hostname?.endsWith('.localhost') === true ||
  hostname === '127.0.0.1' ||
  hostname === '::1' ||
  hostname === '[::1]'

export const getSnapRuntimeMode = (environment?: string): SnapRuntimeMode => {
  const resolvedEnvironment = environment ?? (typeof process === 'undefined' ? undefined : process.env.NODE_ENV)
  const hostname = typeof window === 'undefined' ? undefined : window.location.hostname

  return resolvedEnvironment === 'development' || isLocalDevelopmentHostname(hostname) ? DEBUG_MODE : LIVE_MODE
}
