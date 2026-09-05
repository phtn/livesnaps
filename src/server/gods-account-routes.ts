import {
  getFirebaseAdminAuth,
  getFirebaseUserByUid,
  revokeFirebaseUserRefreshTokens,
  setFirebaseCustomUserClaims
} from '@/lib/firebase-admin/admin'
import { AdminIdTokenError, mintAdminIdToken } from '@/lib/firebase-admin/admin-id-token'
import { updateFirebaseManagedAccessClaim } from '@/lib/firebase-admin/custom-claims'
import { authorizeManagedClaimChange, readFirebaseCustomClaims } from '@/lib/firebase-admin/god-directory'
import { getVerifiedGodSession } from '@/lib/firebase-admin/server-auth'
import { getHostnameFromHostHeader } from '@/lib/routing/admin-subdomain'
import { isGodsSubdomainHostname } from '@/lib/routing/gods-subdomain'
import { api } from '../../convex/_generated/api'
import { createConvexClient } from './convex'

export interface GodsAccountRouteEnvironment {
  convexUrl?: string
}

export type GodsAccountListResponse = {
  accounts: Awaited<ReturnType<typeof listAccounts>>
}

/**
 * Reports what happened to the contact's `admin` claim. Granting it is a
 * best-effort follow-on: the account is already created and must not be rolled
 * back because a claim could not be applied, so the outcome is reported instead
 * of thrown.
 */
export type AdminClaimOutcome = {
  granted: boolean
  reason: string | null
}

export type GodsAccountCreateResponse = GodsAccountListResponse & {
  adminClaim: AdminClaimOutcome
}

export type GodsAccountDetailResponse = {
  account: NonNullable<Awaited<ReturnType<typeof getAccountBySlug>>>
  members: Awaited<ReturnType<typeof listAccountMembers>>
  // Whether this viewer may permanently delete the account. The UI uses it to
  // decide whether to render the control; the server enforces the rule again on
  // the delete itself, so a client that ignores this gets refused anyway.
  canDelete: boolean
}

const ACCOUNT_LIST_LIMIT = 250
const ACCOUNT_MEMBER_LIST_LIMIT = 250

const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store' }
  })

function isGodsRequest(request: Request) {
  const hostname =
    getHostnameFromHostHeader(request.headers.get('x-forwarded-host') ?? request.headers.get('host')) ??
    new URL(request.url).hostname

  return isGodsSubdomainHostname(hostname)
}

function isSameOriginRequest(request: Request) {
  const origin = request.headers.get('origin')
  return origin === null || origin === new URL(request.url).origin
}

type GodsConvexClient = ReturnType<typeof createConvexClient>

/**
 * The Citadel authenticates with a god session cookie, which Convex cannot
 * verify. Re-mint a real ID token for the already-verified god so Convex sees
 * their genuine claims - the same exchange the admin snap routes use.
 */
type GodSession = NonNullable<Awaited<ReturnType<typeof getVerifiedGodSession>>>

async function getGodsConvexClient(
  session: GodSession,
  environment: GodsAccountRouteEnvironment
): Promise<GodsConvexClient> {
  return createConvexClient(await mintAdminIdToken(session.decodedToken.uid), environment.convexUrl)
}

/**
 * Grants the account contact the `admin` claim once their account exists.
 *
 * The claim rules already in place are the authority here: `admin` is a managed
 * access claim, so `authorizeManagedClaimChange` still requires a `topg` actor
 * and a verified email on the recipient. A plain god can therefore create an
 * account but not mint an admin, and this reports that rather than escalating
 * around it.
 */
async function grantContactAdminClaim(session: GodSession, uid: string): Promise<AdminClaimOutcome> {
  if (!getFirebaseAdminAuth()) {
    return { granted: false, reason: 'Firebase Admin credentials are not configured.' }
  }

  let target
  try {
    target = await getFirebaseUserByUid(uid)
  } catch {
    return { granted: false, reason: 'The contact could not be found in the user directory.' }
  }

  const targetClaims = readFirebaseCustomClaims(target.customClaims)

  if (targetClaims.admin === true) {
    return { granted: true, reason: null }
  }

  const decision = authorizeManagedClaimChange({
    actorClaims: session.customClaims,
    actorUid: session.decodedToken.uid,
    claim: 'admin',
    enabled: true,
    target: {
      claims: targetClaims,
      email: target.email ?? null,
      emailVerified: target.emailVerified,
      uid: target.uid
    }
  })

  if (!decision.allowed) return { granted: false, reason: decision.error }

  try {
    await setFirebaseCustomUserClaims(target.uid, updateFirebaseManagedAccessClaim(targetClaims, 'admin', true))
    // Claims are baked into the ID token, so an unrevoked session would keep
    // the old access until it expires on its own.
    await revokeFirebaseUserRefreshTokens(target.uid)
    return { granted: true, reason: null }
  } catch {
    return { granted: false, reason: 'Could not update this account’s access.' }
  }
}

const listAccounts = (client: GodsConvexClient) =>
  client.query(api.accounts.q.listForAdmin, { limit: ACCOUNT_LIST_LIMIT })

const getAccountBySlug = (client: GodsConvexClient, slug: string) => client.query(api.accounts.q.getBySlug, { slug })

const listAccountMembers = (client: GodsConvexClient, accountId: GodsAccountListResponse['accounts'][number]['_id']) =>
  client.query(api.accountMembers.q.listForAccount, { accountId, limit: ACCOUNT_MEMBER_LIST_LIMIT })

const asTrimmedString = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

const asOptionalString = (value: unknown) => {
  const trimmed = asTrimmedString(value)
  return trimmed.length > 0 ? trimmed : undefined
}

const readObject = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}

/**
 * Shapes the request body into the mutation's argument type. Convex re-validates
 * every field, so this only has to narrow `unknown` - it is not the authority on
 * what a valid account is.
 */
function readCreateAccountBody(body: unknown) {
  const payload = readObject(body)
  const contact = readObject(payload.primaryContact)
  const organization = readObject(payload.organization)

  const name = asTrimmedString(payload.name)
  const contactName = asTrimmedString(contact.name)
  const contactEmail = asTrimmedString(contact.email)

  if (!name) return { error: 'An account name is required.' as const }
  if (!contactName) return { error: 'A primary contact name is required.' as const }
  if (!contactEmail) return { error: 'A primary contact email is required.' as const }

  const plan = asOptionalString(payload.plan)
  const status = asOptionalString(payload.status)

  return {
    input: {
      name,
      slug: asOptionalString(payload.slug),
      plan: plan as 'trial' | 'starter' | 'growth' | 'enterprise' | undefined,
      status: status as 'pending' | 'active' | 'suspended' | 'closed' | undefined,
      organization: {
        legalName: asOptionalString(organization.legalName),
        website: asOptionalString(organization.website),
        industry: asOptionalString(organization.industry),
        size: asOptionalString(organization.size),
        taxId: asOptionalString(organization.taxId)
      },
      primaryContact: {
        name: contactName,
        email: contactEmail,
        phone: asOptionalString(contact.phone) ?? null,
        title: asOptionalString(contact.title) ?? null,
        firebaseUid: asOptionalString(contact.firebaseUid) ?? null
      },
      billingEmail: asOptionalString(payload.billingEmail) ?? null,
      notes: asOptionalString(payload.notes) ?? null
    }
  }
}

// Convex reports our `ConvexError` messages inside the thrown Error's text.
// Surface that to the operator rather than a generic failure.
function readConvexErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return null

  const match = /Uncaught ConvexError:\s*(.+?)(?:\n|$)/.exec(error.message)
  return match ? match[1].trim() : null
}

function handleRouteError(error: unknown, fallback: string) {
  if (error instanceof AdminIdTokenError) {
    return json({ error: 'The Citadel session could not be authenticated.' }, 500)
  }

  const convexMessage = readConvexErrorMessage(error)
  if (convexMessage) return json({ error: convexMessage }, 400)

  if (error instanceof Error && /Unauthorized|Unauthenticated/i.test(error.message)) {
    return json({ error: 'God access is required.' }, 403)
  }

  return json({ error: fallback }, 500)
}

/**
 * `GET /api/gods/accounts` — every account and its status.
 * `POST /api/gods/accounts` — provision a new account.
 */
export async function handleGodsAccounts(
  request: Request,
  environment: GodsAccountRouteEnvironment = {}
): Promise<Response> {
  if (!isGodsRequest(request)) return json({ error: 'Not found.' }, 404)
  if (request.method !== 'GET' && request.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405)
  }
  if (request.method === 'POST' && !isSameOriginRequest(request)) {
    return json({ error: 'Invalid request origin.' }, 403)
  }

  const session = await getVerifiedGodSession(request)

  if (!session) return json({ error: 'God access is required.' }, 401)

  try {
    const client = await getGodsConvexClient(session, environment)

    if (request.method === 'GET') {
      return json({ accounts: await listAccounts(client) })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return json({ error: 'A valid JSON request body is required.' }, 400)
    }

    const parsed = readCreateAccountBody(body)
    if ('error' in parsed) return json({ error: parsed.error }, 400)

    await client.mutation(api.accounts.m.create, parsed.input)

    const contactUid = parsed.input.primaryContact.firebaseUid
    const adminClaim: AdminClaimOutcome = contactUid
      ? await grantContactAdminClaim(session, contactUid)
      : { granted: false, reason: 'The contact is not an existing user, so no claim was granted.' }

    // Re-read rather than appending the new row: the list is ordered and
    // capped server-side, so the client should not guess where it lands.
    const created: GodsAccountCreateResponse = { accounts: await listAccounts(client), adminClaim }
    return json(created, 201)
  } catch (error) {
    return handleRouteError(
      error,
      request.method === 'POST' ? 'Unable to create the account.' : 'Unable to load accounts.'
    )
  }
}

const isTopgSession = (session: GodSession) => session.customClaims.topg === true

/**
 * `GET /api/gods/accounts/:slug` — one account with its members.
 * `DELETE /api/gods/accounts/:slug` — permanently delete it (`topg` only).
 */
export async function handleGodsAccountDetail(
  request: Request,
  slug: string,
  environment: GodsAccountRouteEnvironment = {}
): Promise<Response> {
  if (!isGodsRequest(request)) return json({ error: 'Not found.' }, 404)
  if (request.method !== 'GET' && request.method !== 'DELETE') {
    return json({ error: 'Method not allowed.' }, 405)
  }
  if (request.method === 'DELETE' && !isSameOriginRequest(request)) {
    return json({ error: 'Invalid request origin.' }, 403)
  }

  const session = await getVerifiedGodSession(request)

  if (!session) return json({ error: 'God access is required.' }, 401)

  // Refused before the account is read, so a god who cannot delete cannot use
  // this route to probe which slugs exist.
  if (request.method === 'DELETE' && !isTopgSession(session)) {
    return json({ error: 'Deleting an account requires a top-god account.' }, 403)
  }

  try {
    const client = await getGodsConvexClient(session, environment)
    const account = await getAccountBySlug(client, slug)

    if (!account) return json({ error: 'That account could not be found.' }, 404)

    if (request.method === 'DELETE') {
      await client.mutation(api.accounts.m.remove, { id: account._id })
      return json({ ok: true })
    }

    const body: GodsAccountDetailResponse = {
      account,
      members: await listAccountMembers(client, account._id),
      canDelete: isTopgSession(session)
    }

    return json(body)
  } catch (error) {
    return handleRouteError(
      error,
      request.method === 'DELETE' ? 'Unable to delete this account.' : 'Unable to load this account.'
    )
  }
}
