import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { canUseAccount } from '../lib/accounts/accounts'
import { isSubmissionLinkColor } from '../lib/accounts/submission-links'
import { AdminRequestError, withAdminConvex, withAdminConvexWrite, type AdminConvexClient, type AdminConvexEnvironment } from './admin-convex'

export function requestedAccountId(request: Request) {
  const value = new URL(request.url).searchParams.get('accountId')?.trim()
  return value ? value as Id<'accounts'> : undefined
}

export async function listWorkspaceAccounts(client: AdminConvexClient) {
  const accounts = await client.query(api.accounts.q.listMine, { limit: 250 })
  const rows = await Promise.all(accounts.filter(account => canUseAccount(account.status)).map(async account => {
    const membership = await client.query(api.accountMembers.q.getMine, { accountId: account._id })
    if (membership?.status !== 'active') return null
    return { id: account._id, name: account.name, slug: account.slug, status: account.status, plan: account.plan, role: membership.role }
  }))
  return rows.filter((row): row is NonNullable<typeof row> => row !== null)
}

export async function resolveWorkspaceAccount(client: AdminConvexClient, request: Request) {
  const accounts = await listWorkspaceAccounts(client)
  const id = requestedAccountId(request)
  const account = id ? accounts.find(account => account.id === id) : accounts.length === 1 ? accounts[0] : undefined
  if (!account) throw new AdminRequestError(id ? 'You do not have access to this Account.' : 'Select an Account to continue.')
  return account
}

export const handleWorkspaceAccounts = (request: Request, environment: AdminConvexEnvironment = {}) =>
  withAdminConvex(request, environment, listWorkspaceAccounts, 'Unable to load your Accounts.')

export function handleSubmissionLinks(request: Request, environment: AdminConvexEnvironment = {}) {
  if (request.method === 'GET') {
    return withAdminConvex(request, environment, async client => {
      const account = await resolveWorkspaceAccount(client, request)
      return client.query(api.submissionLinks.q.list, { accountId: account.id })
    }, 'Unable to load submission links.')
  }
  return withAdminConvexWrite(request, environment, async client => {
    const account = await resolveWorkspaceAccount(client, request)
    const body: unknown = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AdminRequestError('A valid request is required.')
    const input = body as Record<string, unknown>
    if (input.action === 'ensure-default') return client.mutation(api.submissionLinks.m.ensureDefault, { accountId: account.id })
    if (input.action === 'create' && typeof input.slug === 'string' && typeof input.label === 'string') {
      if (input.color !== undefined && !isSubmissionLinkColor(input.color)) throw new AdminRequestError('Choose a valid link color.')
      return client.mutation(api.submissionLinks.m.create, {
        accountId: account.id,
        slug: input.slug,
        label: input.label,
        ...(isSubmissionLinkColor(input.color) ? { color: input.color } : {})
      })
    }
    if (input.action === 'update' && typeof input.linkId === 'string') {
      const links = await client.query(api.submissionLinks.q.list, { accountId: account.id })
      if (!links.links.some(link => link._id === input.linkId)) throw new AdminRequestError('Link not found in this Account.')
      if (input.label !== undefined && typeof input.label !== 'string') throw new AdminRequestError('The label is invalid.')
      if (input.color !== undefined && !isSubmissionLinkColor(input.color)) throw new AdminRequestError('Choose a valid link color.')
      if (input.enabled !== undefined && typeof input.enabled !== 'boolean') throw new AdminRequestError('The link status is invalid.')
      return client.mutation(api.submissionLinks.m.update, {
        linkId: input.linkId as Id<'submissionLinks'>,
        ...(typeof input.label === 'string' ? { label: input.label } : {}),
        ...(isSubmissionLinkColor(input.color) ? { color: input.color } : {}),
        ...(typeof input.enabled === 'boolean' ? { enabled: input.enabled } : {})
      })
    }
    throw new AdminRequestError('Choose a valid submission link action.')
  }, 'Unable to save the submission link.')
}

export function handleSubmissionAnalytics(request: Request, environment: AdminConvexEnvironment = {}) {
  return withAdminConvex(request, environment, async client => {
    const account = await resolveWorkspaceAccount(client, request)
    const params = new URL(request.url).searchParams
    return client.query(api.submissionLinks.q.analytics, {
      accountId: account.id, fromDay: params.get('fromDay') ?? '', toDay: params.get('toDay') ?? ''
    })
  }, 'Unable to load link analytics. Choose a date range of up to 90 days.')
}

export function handleSubmissionLinkEmail(request: Request, environment: AdminConvexEnvironment = {}) {
  return withAdminConvexWrite(request, environment, async client => {
    const account = await resolveWorkspaceAccount(client, request)
    const body: unknown = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AdminRequestError('A valid email request is required.')
    const input = body as Record<string, unknown>
    if (typeof input.linkId !== 'string') throw new AdminRequestError('Choose a submission link to email.')
    if (!Array.isArray(input.recipients) || !input.recipients.every(value => typeof value === 'string')) {
      throw new AdminRequestError('Enter valid recipient email addresses.')
    }
    if (typeof input.message !== 'string') throw new AdminRequestError('Enter a message for the recipient.')

    return client.action(api.submissionLinks.email.send, {
      accountId: account.id,
      linkId: input.linkId as Id<'submissionLinks'>,
      recipients: input.recipients,
      message: input.message
    })
  }, 'Unable to send the submission link email.')
}
