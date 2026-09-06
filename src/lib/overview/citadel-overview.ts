import { ACCOUNT_PLAN_VALUES, ACCOUNT_STATUS_VALUES } from '@/lib/accounts/accounts'
import { ACCOUNT_PLAN_LABEL, ACCOUNT_STATUS_LABEL, type AccountRow } from '@/lib/citadel/accounts'
import type { GodUser } from '@/lib/citadel/gods-users'
import {
  countBy,
  type DayBucket,
  ratio,
  type Segment,
  toCumulativeSeries,
  toSegments,
  toTimestamp,
  windowTotals
} from '@/lib/overview/metrics'

/**
 * The Citadel's readings: the book of accounts, and who holds the keys to it.
 *
 * Both come from endpoints the Citadel already exposes, so this file only
 * shapes what the roster and accounts panels also show.
 */

export const GROWTH_DAYS = 90
export const COMPARISON_DAYS = 30

/**
 * Account status wears the same vocabulary the operations overview uses:
 * a colour means the same thing on both pages.
 */
const STATUS_TONE: Record<(typeof ACCOUNT_STATUS_VALUES)[number], string> = {
  active: 'bg-chart-good',
  pending: 'bg-chart-info',
  suspended: 'bg-chart-critical',
  closed: 'bg-chart-idle'
}

/**
 * Reading order for the standing bar, which is also its safety order.
 *
 * Schema order would seat green beside red — the pair red/green colour
 * blindness collapses first. Leading with `active` separates them and reads
 * better besides: the healthy share of the book comes first.
 */
const STATUS_ORDER = ['active', 'pending', 'suspended', 'closed'] as const satisfies ReadonlyArray<
  (typeof ACCOUNT_STATUS_VALUES)[number]
>

/**
 * Plans are an ordered scale, not a set of identities, so they take an ordinal
 * ramp of one hue — light to dark as the tier rises — rather than four
 * unrelated colours that would imply the tiers are unranked.
 */
const PLAN_TONE: Record<(typeof ACCOUNT_PLAN_VALUES)[number], string> = {
  trial: 'bg-tier-1',
  starter: 'bg-tier-2',
  pro: 'bg-tier-3',
  enterprise: 'bg-tier-4'
}

/** Tiers a paying relationship starts at. */
const PAID_PLANS: ReadonlySet<string> = new Set(['starter', 'pro', 'enterprise'])

export interface PortfolioReadings {
  total: number
  active: number
  activeRate: number
  /** Accounts on a plan someone is billed for. */
  paid: number
  paidRate: number
  /** Accounts whose primary contact has actually signed in. */
  linkedContacts: number
  linkedRate: number
  industries: number
  totals: { current: number; previous: number }
  growth: DayBucket[]
  statusSegments: Segment[]
  planSegments: Segment[]
}

export function readPortfolio(accounts: readonly AccountRow[], now = Date.now()): PortfolioReadings {
  const createdAt = accounts.map((account) => account.createdAt)
  const statusCounts = countBy(accounts, ACCOUNT_STATUS_VALUES, (account) => account.status)
  const planCounts = countBy(accounts, ACCOUNT_PLAN_VALUES, (account) => account.plan)

  let paid = 0
  let linkedContacts = 0
  const industries = new Set<string>()

  for (const account of accounts) {
    if (PAID_PLANS.has(account.plan)) paid += 1
    if (account.primaryContact.tokenIdentifier !== null) linkedContacts += 1

    const industry = account.organization.industry?.trim().toLowerCase()
    if (industry) industries.add(industry)
  }

  return {
    total: accounts.length,
    active: statusCounts.active,
    activeRate: ratio(statusCounts.active, accounts.length),
    paid,
    paidRate: ratio(paid, accounts.length),
    linkedContacts,
    linkedRate: ratio(linkedContacts, accounts.length),
    industries: industries.size,
    totals: windowTotals(createdAt, COMPARISON_DAYS, now),
    growth: toCumulativeSeries(createdAt, GROWTH_DAYS, now),
    statusSegments: toSegments(
      STATUS_ORDER.map((status) => ({
        key: status,
        label: ACCOUNT_STATUS_LABEL[status],
        value: statusCounts[status],
        tone: STATUS_TONE[status]
      }))
    ),
    planSegments: toSegments(
      ACCOUNT_PLAN_VALUES.map((plan) => ({
        key: plan,
        label: ACCOUNT_PLAN_LABEL[plan],
        value: planCounts[plan],
        tone: PLAN_TONE[plan]
      }))
    )
  }
}

export interface GovernanceReadings {
  /** Everyone holding the `god` claim. */
  gods: number
  /** The subset who can also grant it. */
  topGods: number
  /** Directory records the roster scan walked to build that list. */
  scanned: number
  truncated: boolean
  /** Gods carrying a claim but no verified email — a standing exposure. */
  unverified: number
  disabled: number
  /** The roster, most recently seen first. */
  recent: GodUser[]
}

export function readGovernance(roster: readonly GodUser[], scanned: number, truncated: boolean): GovernanceReadings {
  let topGods = 0
  let unverified = 0
  let disabled = 0

  for (const user of roster) {
    if (user.topg) topGods += 1
    if (!user.emailVerified) unverified += 1
    if (user.disabled) disabled += 1
  }

  const recent = [...roster].sort((a, b) => (toTimestamp(b.lastSignInAt) ?? 0) - (toTimestamp(a.lastSignInAt) ?? 0))

  return { gods: roster.length, topGods, scanned, truncated, unverified, disabled, recent }
}
