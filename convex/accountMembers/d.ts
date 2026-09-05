import { v } from 'convex/values'
import { ACCOUNT_MEMBER_ROLE_VALUES, ACCOUNT_MEMBER_STATUS_VALUES } from '../../src/lib/accounts/members'

export const accountMemberRoleSchema = v.union(...ACCOUNT_MEMBER_ROLE_VALUES.map((role) => v.literal(role)))

export const accountMemberStatusSchema = v.union(...ACCOUNT_MEMBER_STATUS_VALUES.map((status) => v.literal(status)))

/**
 * One row per person per account. `email` is captured at invite time and is the
 * key an invite is claimed by; `tokenIdentifier` and `userId` stay null until
 * the invited person signs in and accepts.
 */
export const accountMemberSchema = v.object({
  accountId: v.id('accounts'),
  email: v.string(),
  tokenIdentifier: v.union(v.string(), v.null()),
  userId: v.union(v.id('users'), v.null()),
  name: v.union(v.string(), v.null()),
  title: v.union(v.string(), v.null()),
  role: accountMemberRoleSchema,
  status: accountMemberStatusSchema,
  invitedAt: v.number(),
  invitedBy: v.string(),
  joinedAt: v.union(v.number(), v.null()),
  updatedAt: v.number(),
  updatedBy: v.string()
})

export const accountMemberDocumentSchema = accountMemberSchema.extend({
  _id: v.id('accountMembers'),
  _creationTime: v.number()
})

export const inviteAccountMemberSchema = v.object({
  accountId: v.id('accounts'),
  email: v.string(),
  role: v.optional(accountMemberRoleSchema),
  name: v.optional(v.union(v.string(), v.null())),
  title: v.optional(v.union(v.string(), v.null()))
})

export type AccountMember = typeof accountMemberSchema.type
export type AccountMemberDocument = typeof accountMemberDocumentSchema.type
