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

export const SUBMISSION_LINK_COLORS = [
  { value: 'slate', label: 'Slate', hex: '#64748b' },
  { value: 'blue', label: 'Blue', hex: '#3b82f6' },
  { value: 'cyan', label: 'Cyan', hex: '#06b6d4' },
  { value: 'emerald', label: 'Emerald', hex: '#10b981' },
  { value: 'amber', label: 'Amber', hex: '#f59e0b' },
  { value: 'rose', label: 'Rose', hex: '#f43f5e' },
  { value: 'violet', label: 'Violet', hex: '#8b5cf6' }
] as const

export type SubmissionLinkColor = typeof SUBMISSION_LINK_COLORS[number]['value']
export const DEFAULT_SUBMISSION_LINK_LABEL = 'Group Name'
export const DEFAULT_SUBMISSION_LINK_COLOR: SubmissionLinkColor = 'blue'
export const isSubmissionLinkColor = (value: unknown): value is SubmissionLinkColor =>
  typeof value === 'string' && SUBMISSION_LINK_COLORS.some(option => option.value === value)
export const normalizeSubmissionLinkColor = (value: unknown): SubmissionLinkColor =>
  isSubmissionLinkColor(value) ? value : DEFAULT_SUBMISSION_LINK_COLOR
export const submissionLinkColorHex = (value: unknown) =>
  SUBMISSION_LINK_COLORS.find(option => option.value === normalizeSubmissionLinkColor(value))?.hex ?? '#3b82f6'
