import { ACCOUNT_MEMBER_ROLE_VALUES, type AccountMemberRole, type AccountMemberStatus } from '@/lib/accounts/members'
// Type-only import: the Convex and Firebase Admin modules behind this response
// never reach the client bundle.
import type { AdminAccountMemberListResponse } from '@/server/admin-member-routes'
import { accountEndpoint } from '@/hooks/use-workspace'

export type MemberWorkspace = AdminAccountMemberListResponse
export type MemberRow = AdminAccountMemberListResponse['members'][number]

export interface InviteMemberInput {
  email: string
  name?: string
  title?: string
  role: AccountMemberRole
}

const ACCOUNT_MEMBERS_ENDPOINT = '/api/admin/account-members'

async function readError(response: Response, fallback: string) {
  try {
    const body: unknown = await response.json()
    const error = typeof body === 'object' && body !== null ? (body as { error?: unknown }).error : undefined
    return typeof error === 'string' && error.length > 0 ? error : fallback
  } catch {
    return fallback
  }
}

async function requestJson<T>(input: string, init: RequestInit, fallback: string): Promise<T> {
  const response = await fetch(input, { credentials: 'same-origin', ...init })
  if (!response.ok) throw new Error(await readError(response, fallback))
  return (await response.json()) as T
}

export function fetchAccountMembers(signal?: AbortSignal, accountId = '') {
  return requestJson<MemberWorkspace>(accountEndpoint(ACCOUNT_MEMBERS_ENDPOINT, accountId), { signal }, 'Could not load the account members.')
}

/** Resolves with the roster the invitation was added to, already refreshed. */
export function inviteAccountMember(input: InviteMemberInput, accountId = '') {
  return requestJson<MemberWorkspace>(
    accountEndpoint(ACCOUNT_MEMBERS_ENDPOINT, accountId),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input)
    },
    'Could not invite this member.'
  )
}

export const ACCOUNT_MEMBER_ROLE_LABEL: Record<AccountMemberRole, string> = {
  viewer: 'Viewer',
  member: 'Member',
  admin: 'Admin',
  owner: 'Owner'
}

/** What each role may do, shown under the role chips so the pick is informed. */
export const ACCOUNT_MEMBER_ROLE_HINT: Record<AccountMemberRole, string> = {
  viewer: 'Reads the workspace. Changes nothing.',
  member: 'Works the day-to-day queue.',
  admin: 'Manages the workspace and its members.',
  owner: 'Full control, including billing. Only an owner can grant this.'
}

export const ACCOUNT_MEMBER_STATUS_LABEL: Record<AccountMemberStatus, string> = {
  invited: 'Invited',
  active: 'Active',
  suspended: 'Suspended'
}

export const ACCOUNT_MEMBER_STATUS_TONE: Record<AccountMemberStatus, string> = {
  invited: 'border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  active: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  suspended: 'border-destructive/25 bg-destructive/10 text-destructive'
}

export type MemberStatusFilter = 'all' | AccountMemberStatus

export const MEMBER_STATUS_FILTERS: MemberStatusFilter[] = ['all', 'active', 'invited', 'suspended']

export const MEMBER_STATUS_FILTER_LABEL: Record<MemberStatusFilter, string> = {
  all: 'All',
  ...ACCOUNT_MEMBER_STATUS_LABEL
}

export const MEMBER_ROLES = ACCOUNT_MEMBER_ROLE_VALUES

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

export const formatMemberDate = (value: number | null) => (value === null ? '—' : dateFormatter.format(value))

/** Initials from the member's name, falling back to the address they were invited on. */
export const getMemberInitials = (member: MemberRow) =>
  (member.name ?? member.email)
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

export function matchesMemberQuery(member: MemberRow, query: string) {
  const needle = query.trim().toLowerCase()
  if (!needle) return true

  return [member.name ?? '', member.email, member.title ?? '', member.role, member.status]
    .join(' ')
    .toLowerCase()
    .includes(needle)
}

export function countMembersByStatus(members: readonly MemberRow[]) {
  return members.reduce<Record<string, number>>((counts, member) => {
    counts[member.status] = (counts[member.status] ?? 0) + 1
    return counts
  }, {})
}
