import 'server-only'

import { isIP } from 'node:net'
import { parseIpinfoConfig } from './config'
import { parseLiteData, type LiteData } from './type'

const IPINFO_API_URL = 'https://api.ipinfo.io'

export class IpinfoError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = 'IpinfoError'
  }
}

const normalizeIpAddress = (value: string | null): string | null => {
  const candidate = value?.trim()

  if (!candidate) {
    return null
  }

  if (isIP(candidate)) {
    return candidate
  }

  const bracketedIpv6 = candidate.match(/^\[([^\]]+)](?::\d+)?$/)?.[1]

  if (bracketedIpv6 && isIP(bracketedIpv6)) {
    return bracketedIpv6
  }

  const ipv4WithPort = candidate.match(/^(.+):(\d+)$/)?.[1]

  return ipv4WithPort && isIP(ipv4WithPort) === 4 ? ipv4WithPort : null
}

export const getClientIpAddress = (headers: Headers): string | null => {
  const candidates = [
    headers.get('cf-connecting-ip'),
    headers.get('x-real-ip'),
    headers.get('x-forwarded-for')?.split(',')[0] ?? null
  ]

  for (const candidate of candidates) {
    const ip = normalizeIpAddress(candidate)

    if (ip) {
      return ip
    }
  }

  return null
}

export const getIpinfoLiteData = async (ip: string): Promise<LiteData> => {
  const normalizedIp = normalizeIpAddress(ip)

  if (!normalizedIp) {
    throw new IpinfoError('Invalid IP address.', 400)
  }

  const token = parseIpinfoConfig(process.env.IPINFO_LITE_TOKEN).lite.token.trim()

  if (!token) {
    throw new IpinfoError('Access not configured for this user.', 500)
  }

  const endpoint = new URL(`/lite/${encodeURIComponent(normalizedIp)}`, IPINFO_API_URL)
  endpoint.searchParams.set('token', token)

  const response = await fetch(endpoint, { cache: 'no-store' })

  if (!response.ok) {
    throw new IpinfoError('Unable to verify IP details.', response.status)
  }

  const data = parseLiteData(await response.json().catch(() => null))

  if (!data) {
    throw new IpinfoError('IP verification is incomplete.', 502)
  }

  return data
}
