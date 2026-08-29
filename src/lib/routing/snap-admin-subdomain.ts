import { getAllowedRootDomain } from '@/lib/subdomains/config'
import { isIpHostname } from './admin-subdomain'

export const snapAdminRoutePrefix = '/l'
export const snapAdminSubdomainLabel = 'snaps'
export const snapAdminSubdomainHandoffPath = '/snap-admin-handoff'

export type SnapAdminSubdomainMode = 'auto' | 'force' | 'off'

function resolveSnapAdminSubdomainMode(): SnapAdminSubdomainMode {
  const raw =
    (typeof process !== 'undefined' && process.env
      ? process.env.SNAP_ADMIN_SUBDOMAIN_MODE ?? process.env.NEXT_PUBLIC_SNAP_ADMIN_SUBDOMAIN_MODE
      : undefined) ?? 'auto'

  if (raw === 'force') return 'force'
  if (raw === 'off') return 'off'
  return 'auto'
}

export const snapAdminSubdomainMode: SnapAdminSubdomainMode = resolveSnapAdminSubdomainMode()

function normalizeHostname(hostname: string) {
  return hostname.trim().toLowerCase().replace(/\.$/, '')
}

function isVercelHostname(hostname: string) {
  const normalizedHostname = normalizeHostname(hostname)
  return normalizedHostname.endsWith('.vercel.app') || normalizedHostname.endsWith('.vercel.dev')
}

export function isSnapAdminSubdomainHostname(hostname: string) {
  return normalizeHostname(hostname).startsWith(`${snapAdminSubdomainLabel}.`)
}

export function stripSnapAdminSubdomain(hostname: string) {
  const normalizedHostname = normalizeHostname(hostname)

  if (!isSnapAdminSubdomainHostname(normalizedHostname)) {
    return normalizedHostname
  }

  return normalizedHostname.slice(snapAdminSubdomainLabel.length + 1)
}

export function getSnapAppRootHostname(hostname: string) {
  const appHostname = stripSnapAdminSubdomain(hostname)
  return getAllowedRootDomain(appHostname) ?? appHostname
}

export function supportsSnapAdminSubdomain(hostname: string) {
  const normalizedHostname = normalizeHostname(hostname)

  if (normalizedHostname.length === 0 || isIpHostname(normalizedHostname)) {
    return false
  }

  if (snapAdminSubdomainMode === 'off') {
    return false
  }

  if (snapAdminSubdomainMode === 'force') {
    return true
  }

  return !isVercelHostname(normalizedHostname)
}

export function toSnapAdminSubdomainHostname(hostname: string) {
  const normalizedHostname = normalizeHostname(hostname)

  if (isSnapAdminSubdomainHostname(normalizedHostname)) {
    return normalizedHostname
  }

  const appHostname = getSnapAppRootHostname(normalizedHostname)

  if (!supportsSnapAdminSubdomain(appHostname)) {
    return appHostname
  }

  return `${snapAdminSubdomainLabel}.${appHostname}`
}

export function toSnapAdminExternalPath(pathname: string) {
  if (pathname === snapAdminRoutePrefix) {
    return '/'
  }

  if (pathname.startsWith(`${snapAdminRoutePrefix}/`)) {
    return pathname.slice(snapAdminRoutePrefix.length)
  }

  return pathname
}

export function toSnapAdminInternalPath(pathname: string) {
  if (pathname === '/' || pathname.length === 0) {
    return snapAdminRoutePrefix
  }

  if (pathname === snapAdminRoutePrefix || pathname.startsWith(`${snapAdminRoutePrefix}/`)) {
    return pathname
  }

  return `${snapAdminRoutePrefix}${pathname}`
}

export function isSnapAdminRoutePath(pathname: string) {
  return pathname === snapAdminRoutePrefix || pathname.startsWith(`${snapAdminRoutePrefix}/`)
}

export function isSnapAdminSubdomainPassthroughPath(pathname: string) {
  return (
    pathname === snapAdminSubdomainHandoffPath || pathname.startsWith(`${snapAdminSubdomainHandoffPath}/`)
  )
}

export function buildSnapAdminHandoffUrl(currentUrl: URL, idToken: string) {
  const appHostname = getSnapAppRootHostname(currentUrl.hostname)
  const useSnapAdminSubdomain = supportsSnapAdminSubdomain(appHostname)
  const handoffUrl = new URL(currentUrl)

  handoffUrl.hostname = useSnapAdminSubdomain ? toSnapAdminSubdomainHostname(appHostname) : appHostname
  handoffUrl.pathname = snapAdminSubdomainHandoffPath
  handoffUrl.search = ''
  handoffUrl.hash = new URLSearchParams({
    idToken,
    redirectTo: useSnapAdminSubdomain ? '/' : snapAdminRoutePrefix
  }).toString()

  return handoffUrl
}

export function buildSnapAdminExitUrl(currentUrl: URL) {
  const exitUrl = new URL(currentUrl)

  exitUrl.hostname = getSnapAppRootHostname(currentUrl.hostname)
  exitUrl.pathname = '/p'
  exitUrl.search = ''
  exitUrl.hash = ''

  return exitUrl
}
