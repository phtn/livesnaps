/**
 * Roles are ordered least to most privileged; `accountMemberRoleRank` turns the
 * order into a comparison so callers can require "at least admin" without
 * enumerating every role that qualifies.
 */
export const ACCOUNT_MEMBER_ROLE_VALUES = ['viewer', 'member', 'admin', 'owner'] as const

export type AccountMemberRole = (typeof ACCOUNT_MEMBER_ROLE_VALUES)[number]

export const DEFAULT_ACCOUNT_MEMBER_ROLE: AccountMemberRole = 'member'

export const accountMemberRoleRank = (role: AccountMemberRole) => ACCOUNT_MEMBER_ROLE_VALUES.indexOf(role)

export const hasAccountMemberRole = (role: AccountMemberRole, minimum: AccountMemberRole) =>
  accountMemberRoleRank(role) >= accountMemberRoleRank(minimum)

export const ACCOUNT_MEMBER_STATUS_VALUES = ['invited', 'active', 'suspended'] as const

export type AccountMemberStatus = (typeof ACCOUNT_MEMBER_STATUS_VALUES)[number]

/** Statuses that may act on the account. `invited` has no access until accepted. */
export const ACTIVE_ACCOUNT_MEMBER_STATUS: AccountMemberStatus = 'active'

export const ACCOUNT_MEMBER_NAME_MAX_LENGTH = 160
export const ACCOUNT_MEMBER_TITLE_MAX_LENGTH = 120
