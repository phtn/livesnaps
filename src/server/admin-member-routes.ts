import { ACCOUNT_MEMBER_ROLE_VALUES, type AccountMemberRole } from '@/lib/accounts/members'
import { api } from '../../convex/_generated/api'
import { type AdminConvexClient, type AdminConvexEnvironment, AdminRequestError, withAdminConvex, withAdminConvexWrite } from './admin-convex'
import { resolveWorkspaceAccount } from './workspace-routes'

export type AdminMemberRouteEnvironment = AdminConvexEnvironment

const MEMBER_LIST_LIMIT = 250

/**
 * The workspace the signed-in administrator operates.
 *
 * The admin console has no account in its URL — an administrator is an account
 * owner or admin, so the account is read from their own membership rather than
 * chosen. `listMine` orders by creation, so an administrator who somehow holds
 * two memberships lands on their newest one; the response names the account so
 * the page can say which workspace it is showing.
 */
async function readWorkspace(client: AdminConvexClient, request: Request) {
  const account = await resolveWorkspaceAccount(client, request)

  return {
    account,
    members: await client.query(api.accountMembers.q.listForAccount, {
      accountId: account.id,
      limit: MEMBER_LIST_LIMIT
    })
  }
}

export type AdminAccountMemberListResponse = Awaited<ReturnType<typeof readWorkspace>>

/** `GET /api/admin/account-members` — the workspace and everyone on it. */
export function handleAdminAccountMemberList(request: Request, environment: AdminMemberRouteEnvironment = {}) {
  return withAdminConvex(request, environment, client => readWorkspace(client, request), 'Unable to load the account members.')
}

const readString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

const readRole = (value: unknown): AccountMemberRole | undefined => {
  const role = readString(value)
  return ACCOUNT_MEMBER_ROLE_VALUES.find((candidate) => candidate === role)
}

/**
 * `POST /api/admin/account-members` — invite someone to the workspace.
 *
 * Validation is thin on purpose: `accountMembers.m.invite` normalizes the
 * address, refuses a duplicate membership, and enforces who may hand out the
 * owner role. Only the shape is checked here. The invitation email is scheduled
 * by that mutation, so a queued send never rolls back a good membership.
 */
export function handleAdminAccountMemberInvite(request: Request, environment: AdminMemberRouteEnvironment = {}) {
  return withAdminConvexWrite(
    request,
    environment,
    async (client) => {
      const body: unknown = await request.json().catch(() => null)

      if (typeof body !== 'object' || body === null) {
        throw new AdminRequestError('A valid JSON request body is required.')
      }

      const payload = body as Record<string, unknown>
      const email = readString(payload.email)

      if (!email) throw new AdminRequestError('A member email address is required.')

      const account = await resolveWorkspaceAccount(client, request)
      if (account.role !== 'admin' && account.role !== 'owner') throw new AdminRequestError('Account administrator access is required.')

      await client.mutation(api.accountMembers.m.invite, {
        accountId: account.id,
        email,
        name: readString(payload.name) ?? null,
        title: readString(payload.title) ?? null,
        role: readRole(payload.role)
      })

      // The fresh roster comes back with the write, so the members tab does not
      // have to round-trip again to show the invitation that was just sent.
      return await readWorkspace(client, request)
    },
    'Unable to invite this member.'
  )
}
