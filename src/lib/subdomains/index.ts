export {
  SUBDOMAIN_CONFIG,
  getAllowedRootDomain,
  getSubdomainRoute,
  isReservedSubdomain,
  isAllowedDomain
} from './config'
export type { SubdomainKey } from './config'

export { extractSubdomain, getSubdomainFromHeaders, buildSubdomainUrl } from './utils'
export type { SubdomainInfo } from './utils'

// Server-only exports are in ./server.ts - import directly:
// import { getSubdomain } from '@/lib/subdomains/server'
