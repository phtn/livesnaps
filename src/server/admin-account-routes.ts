import { ACCOUNT_LOGO_MAX_WEBP_BYTES, buildAccountLogoObjectKey, isAccountLogoObjectKey } from '@/lib/r2/account-logos'
import { deleteR2Object, getR2Object, putR2Object, type R2Config, R2ConfigurationError } from '@/lib/r2/server'
import { detectUserImageFormat } from '@/lib/r2/user-images'
import { api } from '../../convex/_generated/api'
import {
  type AdminConvexEnvironment,
  AdminRequestError,
  getAdminConvexClient,
  withAdminConvex,
  withAdminConvexWrite
} from './admin-convex'
import { resolveWorkspaceAccount } from './workspace-routes'

export interface AdminAccountRouteEnvironment extends AdminConvexEnvironment {
  r2AccountId?: string
  r2AccessKeyId?: string
  r2SecretAccessKey?: string
  r2Bucket?: string
}

export type AdminAccountResponse = Awaited<ReturnType<typeof readAccount>>

const editable = (role: string) => role === 'owner' || role === 'admin'
const r2Config = (environment: AdminAccountRouteEnvironment): Partial<R2Config> => ({
  accountId: environment.r2AccountId,
  accessKeyId: environment.r2AccessKeyId,
  secretAccessKey: environment.r2SecretAccessKey,
  bucket: environment.r2Bucket
})

async function readAccount(client: Parameters<typeof resolveWorkspaceAccount>[0], request: Request) {
  const workspace = await resolveWorkspaceAccount(client, request)
  const account = await client.query(api.accounts.q.getById, { id: workspace.id })
  if (!account) throw new AdminRequestError('Account not found.')
  return { account, canEdit: editable(workspace.role) }
}

const stringOrUndefined = (value: unknown) => (typeof value === 'string' ? value : undefined)
const objectValue = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}

export function handleAdminAccount(request: Request, environment: AdminAccountRouteEnvironment = {}) {
  if (request.method === 'GET') {
    return withAdminConvex(
      request,
      environment,
      (client) => readAccount(client, request),
      'Unable to load account settings.'
    )
  }

  return withAdminConvexWrite(
    request,
    environment,
    async (client) => {
      const workspace = await resolveWorkspaceAccount(client, request)
      if (!editable(workspace.role))
        throw new AdminRequestError('Only account owners and administrators can edit account details.')
      const body = objectValue(await request.json().catch(() => null))
      const contact = objectValue(body.primaryContact)
      const organization = objectValue(body.organization)
      const address = objectValue(organization.address)

      if (typeof body.name !== 'string' || typeof contact.name !== 'string' || typeof contact.email !== 'string') {
        throw new AdminRequestError('An account name, contact name, and contact email are required.')
      }

      await client.mutation(api.accounts.m.update, {
        id: workspace.id,
        name: body.name,
        primaryContact: {
          name: contact.name,
          email: contact.email,
          phone: stringOrUndefined(contact.phone) ?? null,
          title: stringOrUndefined(contact.title) ?? null
        },
        organization: {
          legalName: stringOrUndefined(organization.legalName),
          website: stringOrUndefined(organization.website),
          industry: stringOrUndefined(organization.industry),
          size: stringOrUndefined(organization.size),
          taxId: stringOrUndefined(organization.taxId),
          address: {
            line1: stringOrUndefined(address.line1),
            line2: stringOrUndefined(address.line2),
            city: stringOrUndefined(address.city),
            region: stringOrUndefined(address.region),
            postalCode: stringOrUndefined(address.postalCode),
            country: stringOrUndefined(address.country)
          }
        },
        billingEmail: stringOrUndefined(body.billingEmail) ?? null,
        notes: stringOrUndefined(body.notes) ?? null
      })

      return readAccount(client, request)
    },
    'Unable to save account settings.'
  )
}

export async function handleAdminAccountLogo(request: Request, environment: AdminAccountRouteEnvironment = {}) {
  try {
    const client = await getAdminConvexClient(request, environment)
    if (!client) return Response.json({ error: 'An active Account session is required.' }, { status: 401 })
    const workspace = await resolveWorkspaceAccount(client, request)
    const account = await client.query(api.accounts.q.getById, { id: workspace.id })
    if (!account) return Response.json({ error: 'Account not found.' }, { status: 404 })

    if (request.method === 'GET') {
      if (!account.logoR2Key || !isAccountLogoObjectKey(account._id, account.logoR2Key)) {
        return Response.json({ error: 'Account logo not found.' }, { status: 404 })
      }
      const response = await getR2Object(account.logoR2Key, r2Config(environment))
      if (!response.ok || !response.body) return Response.json({ error: 'Account logo not found.' }, { status: 404 })
      const etag = response.headers.get('etag')
      return new Response(response.body, {
        headers: {
          'cache-control': 'private, max-age=300',
          'content-type': 'image/webp',
          ...(etag ? { etag } : {})
        }
      })
    }

    if (request.method !== 'POST') return Response.json({ error: 'Method not allowed.' }, { status: 405 })
    const origin = request.headers.get('origin')
    if (origin !== null && origin !== new URL(request.url).origin) {
      return Response.json({ error: 'Invalid request origin.' }, { status: 403 })
    }
    if (!editable(workspace.role)) {
      return Response.json({ error: 'Only account owners and administrators can change the logo.' }, { status: 403 })
    }

    const data = await request.formData().catch(() => null)
    const file = data?.get('file')
    if (!(file instanceof File) || file.size < 1) throw new AdminRequestError('Choose a logo to upload.')
    if (file.size > ACCOUNT_LOGO_MAX_WEBP_BYTES)
      throw new AdminRequestError('The optimized logo must be 2 MB or smaller.')
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (file.type !== 'image/webp' || detectUserImageFormat(bytes)?.contentType !== 'image/webp') {
      throw new AdminRequestError('Account logos must be optimized WebP images.')
    }

    const logoId = crypto.randomUUID().replaceAll('-', '')
    const objectKey = buildAccountLogoObjectKey(account._id, logoId)
    const upload = await putR2Object({
      body: bytes.buffer,
      contentType: 'image/webp',
      objectKey,
      r2: r2Config(environment)
    })
    if (!upload.ok) throw new Error(`R2 logo upload failed with status ${upload.status}.`)

    try {
      const updated = await client.mutation(api.accounts.m.setLogo, { id: account._id, objectKey })
      if (account.logoR2Key && isAccountLogoObjectKey(account._id, account.logoR2Key)) {
        await deleteR2Object(account.logoR2Key, r2Config(environment)).catch(() => undefined)
      }
      return Response.json({ account: updated, canEdit: true }, { headers: { 'cache-control': 'no-store' } })
    } catch (error) {
      await deleteR2Object(objectKey, r2Config(environment)).catch(() => undefined)
      throw error
    }
  } catch (error) {
    if (error instanceof AdminRequestError) return Response.json({ error: error.message }, { status: 400 })
    if (error instanceof R2ConfigurationError) {
      return Response.json({ error: 'Account logo storage is not configured.' }, { status: 503 })
    }
    if (error instanceof Error && /Unauthorized|Unauthenticated/i.test(error.message)) {
      return Response.json({ error: 'You do not have access to this Account.' }, { status: 403 })
    }
    return Response.json({ error: 'Unable to update the account logo.' }, { status: 500 })
  }
}
