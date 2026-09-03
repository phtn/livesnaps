import { getAllowedRootDomain } from '@/lib/subdomains/config'
import { isIpHostname } from './admin-subdomain'

export const godsSubdomainLabel = 'gods'

function normalizeHostname(hostname: string) {
  return hostname.trim().toLowerCase().replace(/\.$/, '')
}

export function isGodsSubdomainHostname(hostname: string) {
  return normalizeHostname(hostname).startsWith(`${godsSubdomainLabel}.`)
}

export function getGodsAppRootHostname(hostname: string) {
  const normalizedHostname = normalizeHostname(hostname)
  const appHostname = isGodsSubdomainHostname(normalizedHostname)
    ? normalizedHostname.slice(godsSubdomainLabel.length + 1)
    : normalizedHostname

  return getAllowedRootDomain(appHostname) ?? appHostname
}

export function supportsGodsSubdomain(hostname: string) {
  const normalizedHostname = normalizeHostname(hostname)
  return normalizedHostname.length > 0 && !isIpHostname(normalizedHostname)
}

export function buildGodsHandoffUrl(currentUrl: URL, idToken: string) {
  const appHostname = getGodsAppRootHostname(currentUrl.hostname)
  const handoffUrl = new URL(currentUrl)

  handoffUrl.hostname = supportsGodsSubdomain(appHostname) ? `${godsSubdomainLabel}.${appHostname}` : appHostname
  handoffUrl.pathname = '/citadel'
  handoffUrl.search = ''
  handoffUrl.hash = new URLSearchParams({ idToken }).toString()

  return handoffUrl
}
