import { api } from '../../convex/_generated/api'
import { withAdminConvex, withAdminConvexWrite, AdminRequestError, type AdminConvexEnvironment } from './admin-convex'
import { requestedAccountId } from './workspace-routes'

export function handleRecipientDefaults(request: Request, environment: AdminConvexEnvironment) {
  const accountId = requestedAccountId(request)
  if (request.method === 'GET') return withAdminConvex(request, environment, client => {
    if (!accountId) throw new AdminRequestError('Select an Account to continue.')
    return client.query(api.accountMembers.q.getRecipientDefaults, { accountId })
  }, 'Unable to load recipient defaults.')
  return withAdminConvexWrite(request, environment, async client => {
    if (!accountId) throw new AdminRequestError('Select an Account to continue.')
    const body: unknown = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || !('scope' in body) || (body.scope !== 'account' && body.scope !== 'member') || !('emails' in body) || !Array.isArray(body.emails) || !body.emails.every(email => typeof email === 'string'))
      throw new AdminRequestError('A scope and list of email addresses are required.')
    await client.mutation(api.accountMembers.m.setRecipientDefaults, { accountId, scope: body.scope, emails: body.emails })
    return client.query(api.accountMembers.q.getRecipientDefaults, { accountId })
  }, 'Unable to save recipient defaults.')
}
