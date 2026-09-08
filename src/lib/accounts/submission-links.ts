import { isAccountSlug } from './accounts'

/** Top-level application routes cannot also be public Account handles. */
export const RESERVED_ACCOUNT_SLUGS = new Set([
  'account',
  'accounts',
  'admin',
  'admin-handoff',
  'admin-overview',
  'admin-snaps',
  'admin-snaps-lab',
  'admin-workspace',
  'admin-settings',
  'api',
  'assets',
  'auth',
  'citadel',
  'favicon',
  'invite',
  'legal',
  'login',
  'logout',
  'pending',
  'robots',
  'settings',
  'signin',
  'signout',
  'signup',
  'snap',
  'snaps',
  'sitemap',
  'static'
])

export const isPublicAccountSlug = (slug: string) => isAccountSlug(slug) && !RESERVED_ACCOUNT_SLUGS.has(slug)
export const isSubmissionLinkSlug = (slug: string) => isAccountSlug(slug)
export const submissionLinkPath = (accountSlug: string, linkSlug = '') =>
  `/${encodeURIComponent(accountSlug)}${linkSlug ? `/${encodeURIComponent(linkSlug)}` : ''}`

export const MAX_ACCOUNT_SUBMISSION_LINKS = 100
export const SUBMISSION_LINK_LABEL_MAX_LENGTH = 100
export const MAX_SUBMISSION_ANALYTICS_DAYS = 90
