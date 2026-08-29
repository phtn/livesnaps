export const IPINFO_IDENTIFIER = 'ipinfo'

export const IPINFO_SERVICES = ['lite', 'core', 'plus', 'max'] as const

export type IpinfoService = (typeof IPINFO_SERVICES)[number]

export type IpinfoServiceConfig = {
  token: string
}

export type IpinfoConfig = Record<IpinfoService, IpinfoServiceConfig> & {
  enabledService: IpinfoService
}

export const EMPTY_IPINFO_CONFIG: IpinfoConfig = {
  enabledService: 'lite',
  lite: { token: '' },
  core: { token: '' },
  plus: { token: '' },
  max: { token: '' }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const readToken = (value: Record<string, unknown>, key: IpinfoService): string => {
  const candidate = value[key]

  if (typeof candidate === 'string') {
    return candidate
  }

  if (isRecord(candidate) && typeof candidate.token === 'string') {
    return candidate.token
  }

  const flatKey = `${key}Token`
  return typeof value[flatKey] === 'string' ? String(value[flatKey]) : ''
}

const normalizeEnabledService = (value: unknown, config: Omit<IpinfoConfig, 'enabledService'>): IpinfoService => {
  if (typeof value === 'string' && IPINFO_SERVICES.includes(value as IpinfoService)) {
    return value as IpinfoService
  }

  const firstConfiguredService = IPINFO_SERVICES.find((service) => config[service].token.trim().length > 0)

  return firstConfiguredService ?? EMPTY_IPINFO_CONFIG.enabledService
}

export function parseIpinfoConfig(value: unknown): IpinfoConfig {
  if (typeof value === 'string') {
    return {
      ...EMPTY_IPINFO_CONFIG,
      lite: { token: value }
    }
  }

  if (!isRecord(value) || 'error' in value) {
    return EMPTY_IPINFO_CONFIG
  }

  const legacyLiteToken = typeof value.id === 'string' ? value.id : typeof value.token === 'string' ? value.token : ''

  const configWithoutEnabledService: Omit<IpinfoConfig, 'enabledService'> = {
    lite: { token: readToken(value, 'lite') || legacyLiteToken },
    core: { token: readToken(value, 'core') },
    plus: { token: readToken(value, 'plus') },
    max: { token: readToken(value, 'max') }
  }

  return {
    ...configWithoutEnabledService,
    enabledService: normalizeEnabledService(value.enabledService, configWithoutEnabledService)
  }
}
