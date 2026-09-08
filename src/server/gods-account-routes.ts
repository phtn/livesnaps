import { AdminIdTokenError, mintAdminIdToken } from '@/lib/firebase-admin/admin-id-token'
import { getVerifiedGodSession } from '@/lib/firebase-admin/server-auth'
import { getHostnameFromHostHeader } from '@/lib/routing/admin-subdomain'
import { isGodsSubdomainHostname } from '@/lib/routing/gods-subdomain'
import { api } from '../../convex/_generated/api'
import { createConvexClient, RequestError } from './convex'
import { contactAdminAccessService, type ContactAdminAccess } from './gods-account-admin-access'

export interface GodsAccountRouteEnvironment {
  convexUrl?: string
}

export type GodsAccountListResponse = {
  accounts: Awaited<ReturnType<typeof listAccounts>>
}

export type GodsAccountCreateResponse = GodsAccountListResponse

export type GodsAccountSlugAvailabilityResponse = Awaited<ReturnType<typeof checkAccountSlugAvailability>>

export type GodsAccountDetailResponse = {
  account: NonNullable<Awaited<ReturnType<typeof getAccountBySlug>>>
  members: Awaited<ReturnType<typeof listAccountMembers>>
  // Whether this viewer may permanently delete the account. The UI uses it to
  // decide whether to render the control; the server enforces the rule again on
  // the delete itself, so a client that ignores this gets refused anyway.
  canDelete: boolean
  adminAccess: ContactAdminAccess
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

const listAccounts = (client: GodsConvexClient) =>
  client.query(api.accounts.q.listForAdmin, { limit: ACCOUNT_LIST_LIMIT })

const checkAccountSlugAvailability = (client: GodsConvexClient, slug: string) =>
  client.query(api.accounts.q.checkSlugAvailability, { slug })

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

  return {
    input: {
      name,
      slug: asOptionalString(payload.slug),
      plan: plan as 'trial' | 'starter' | 'pro' | 'enterprise' | undefined,
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
  if (error instanceof RequestError) return json({ error: error.message }, error.status)
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
 * `GET /api/gods/accounts?slug=...` — validate one prospective slug.
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
      const slug = new URL(request.url).searchParams.get('slug')
      if (slug !== null) return json(await checkAccountSlugAvailability(client, slug))
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

    // Re-read rather than appending the new row: the list is ordered and
    // capped server-side, so the client should not guess where it lands.
    const created: GodsAccountCreateResponse = { accounts: await listAccounts(client) }
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
  if (request.method !== 'GET' && request.method !== 'DELETE' && request.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405)
  }
  if (request.method !== 'GET' && !isSameOriginRequest(request)) {
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
    let account = await getAccountBySlug(client, slug)

    if (!account) return json({ error: 'That account could not be found.' }, 404)

    if (request.method === 'DELETE') {
      await client.mutation(api.accounts.m.remove, { id: account._id })
      return json({ ok: true })
    }

    const actor = { uid: session.decodedToken.uid, claims: session.customClaims }
    if (request.method === 'POST') {
      let payload: unknown
      try {
        payload = await request.json()
      } catch {
        return json({ error: 'A valid JSON body is required.' }, 400)
      }
      const { action, memberId } = readObject(payload)
      if ((action !== 'cancel-admin-invite' && action !== 'revoke-admin' && action !== 'grant-admin') || typeof memberId !== 'string') {
        return json({ error: 'A valid admin access action and membership are required.' }, 400)
      }
      await contactAdminAccessService.change(client, account, actor, action, memberId, environment.convexUrl)
      account = await getAccountBySlug(client, slug)
      if (!account) return json({ error: 'That account could not be found.' }, 404)
    }

    const body: GodsAccountDetailResponse = {
      account,
      members: await listAccountMembers(client, account._id),
      canDelete: isTopgSession(session),
      adminAccess: await contactAdminAccessService.read(client, account, actor)
    }

    return json(body)
  } catch (error) {
    return handleRouteError(
      error,
      request.method === 'DELETE' ? 'Unable to delete this account.' : 'Unable to load this account.'
    )
  }
}
