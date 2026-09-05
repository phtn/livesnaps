import { ConvexError } from 'convex/values'
import {
  ACCOUNT_NAME_MAX_LENGTH,
  ACCOUNT_NOTES_MAX_LENGTH,
  ACCOUNT_PHONE_MAX_LENGTH,
  isAccountEmailAddress,
  isAccountSlug,
  toAccountSlug
} from '../../src/lib/accounts/accounts'
import type { MutationCtx, QueryCtx } from '../_generated/server'
import { isPlatformStaff } from '../lib/auth'
import { trimOrNull } from '../utils'

export const getAccountBySlug = async (ctx: QueryCtx | MutationCtx, slug: string) =>
  await ctx.db
    .query('accounts')
    .withIndex('by_slug', (q) => q.eq('slug', slug))
    .unique()

export const requireAdminIdentity = async (ctx: QueryCtx | MutationCtx) => {
  const identity = await ctx.auth.getUserIdentity()

  if (!identity || !isPlatformStaff(identity)) {
    throw new ConvexError('Unauthorized.')
  }

  return identity
}

/**
 * Provisioning an account is a Citadel action, so it requires the `god` claim
 * specifically - not the broader platform-staff check the read and edit paths
 * use.
 */
export const requireGodIdentity = async (ctx: QueryCtx | MutationCtx) => {
  const identity = await ctx.auth.getUserIdentity()

  if (!identity || identity.god !== true) {
    throw new ConvexError('Creating an account requires a god account.')
  }

  return identity
}

/**
 * Permanently deleting an account is reserved for `topg`, the same bar the
 * managed-claim rules use for irreversible privilege changes. Account holders
 * close their account instead; closing keeps the record, deleting does not.
 */
export const requireTopgIdentity = async (ctx: QueryCtx | MutationCtx) => {
  const identity = await ctx.auth.getUserIdentity()

  if (!identity || identity.topg !== true) {
    throw new ConvexError('Deleting an account requires a top-god account.')
  }

  return identity
}

export const normalizeAccountName = (name: string) => {
  const trimmed = trimOrNull(name)

  if (!trimmed) {
    throw new ConvexError('An account name is required.')
  }

  if (trimmed.length > ACCOUNT_NAME_MAX_LENGTH) {
    throw new ConvexError(`Account name must be ${ACCOUNT_NAME_MAX_LENGTH} characters or fewer.`)
  }

  return trimmed
}

export const normalizeAccountSlug = (slug: string | undefined, fallbackName: string) => {
  const candidate = trimOrNull(slug)?.toLowerCase() ?? toAccountSlug(fallbackName)

  if (!isAccountSlug(candidate)) {
    throw new ConvexError('Account slug must be lowercase letters, numbers, and single hyphens.')
  }

  return candidate
}

export const normalizeAccountEmail = (email: string, label: string) => {
  const trimmed = trimOrNull(email)?.toLowerCase()

  if (!trimmed || !isAccountEmailAddress(trimmed)) {
    throw new ConvexError(`${label} must be a valid email address.`)
  }

  return trimmed
}

export const normalizeOptionalAccountEmail = (email: string | null | undefined, label: string) => {
  const trimmed = trimOrNull(email)

  return trimmed === null ? null : normalizeAccountEmail(trimmed, label)
}

export const normalizeAccountNotes = (notes: string | null | undefined) => {
  const trimmed = trimOrNull(notes)

  if (trimmed && trimmed.length > ACCOUNT_NOTES_MAX_LENGTH) {
    throw new ConvexError(`Notes must be ${ACCOUNT_NOTES_MAX_LENGTH} characters or fewer.`)
  }

  return trimmed
}

export const normalizeAccountPhone = (phone: string | null | undefined) => {
  const trimmed = trimOrNull(phone)

  if (trimmed && trimmed.length > ACCOUNT_PHONE_MAX_LENGTH) {
    throw new ConvexError(`Phone number must be ${ACCOUNT_PHONE_MAX_LENGTH} characters or fewer.`)
  }

  return trimmed
}

type PrimaryContactInput = {
  name: string
  email: string
  phone?: string | null
  title?: string | null
  firebaseUid?: string | null
}

/**
 * Resolves the contact against the `users` table when a `firebaseUid` is given,
 * so an account created for someone who has already signed in is linked to
 * their real identity rather than left waiting on an invite.
 */
export const normalizePrimaryContact = async (ctx: QueryCtx | MutationCtx, contact: PrimaryContactInput) => {
  const name = trimOrNull(contact.name)

  if (!name) {
    throw new ConvexError('A primary contact name is required.')
  }

  const firebaseUid = trimOrNull(contact.firebaseUid)
  const user = firebaseUid
    ? await ctx.db
        .query('users')
        .withIndex('by_firebaseUid', (q) => q.eq('firebaseUid', firebaseUid))
        .unique()
    : null

  return {
    contact: {
      name,
      email: normalizeAccountEmail(contact.email, 'Primary contact email'),
      phone: normalizeAccountPhone(contact.phone),
      title: trimOrNull(contact.title),
      tokenIdentifier: user?.tokenIdentifier ?? null
    },
    userId: user?._id ?? null
  }
}

type OrganizationInput = {
  legalName?: string
  website?: string
  industry?: string
  size?: string
  taxId?: string
  address?: {
    line1?: string
    line2?: string
    city?: string
    region?: string
    postalCode?: string
    country?: string
  }
}

const compact = <T extends Record<string, string | undefined>>(value: T) =>
  Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) => {
      const trimmed = trimOrNull(entry)
      return trimmed === null ? [] : [[key, trimmed] as const]
    })
  ) as { [K in keyof T]?: string }

export const normalizeOrganization = (organization: OrganizationInput | undefined) => {
  if (!organization) {
    return {}
  }

  const { address, ...rest } = organization
  const normalizedAddress = address ? compact(address) : undefined

  return {
    ...compact(rest),
    ...(normalizedAddress && Object.keys(normalizedAddress).length > 0 ? { address: normalizedAddress } : {})
  }
}
