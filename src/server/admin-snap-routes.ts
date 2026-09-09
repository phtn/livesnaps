import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { type AdminConvexEnvironment, AdminRequestError, withAdminConvex, withAdminConvexWrite } from './admin-convex'
import { requestedAccountId } from './workspace-routes'

export type AdminSnapRouteEnvironment = AdminConvexEnvironment

const SNAP_LIST_LIMIT = 250

const UNABLE_TO_LOAD_SNAPS = 'Unable to load snaps.'

export function handleAdminSnapList(request: Request, environment: AdminSnapRouteEnvironment = {}) {
  const params = new URL(request.url).searchParams
  const limit = Number(params.get('limit'))
  if (params.get('page') === '1') {
    return withAdminConvex(
      request,
      environment,
      (client) => {
        const accountId = requestedAccountId(request)
        if (!accountId) throw new AdminRequestError('Select an Account to continue.')
        return client.query(api.snaps.q.listForAccountPage, {
          accountId,
          sourceLinkId: (params.get('sourceLinkId') as Id<'submissionLinks'>) || undefined,
          paginationOpts: { numItems: 50, cursor: params.get('cursor') || null }
        })
      },
      UNABLE_TO_LOAD_SNAPS
    )
  }

  return withAdminConvex(
    request,
    environment,
    (client) =>
      client.query(api.snaps.q.listForAdmin, {
        accountId: requestedAccountId(request),
        sourceLinkId:
          (new URL(request.url).searchParams.get('sourceLinkId') as Id<'submissionLinks'> | undefined) || undefined,
        limit: Number.isSafeInteger(limit) && limit > 0 ? limit : SNAP_LIST_LIMIT
      }),
    UNABLE_TO_LOAD_SNAPS
  )
}

export function handleAdminSnapDetail(request: Request, snapId: string, environment: AdminSnapRouteEnvironment = {}) {
  return withAdminConvex(
    request,
    environment,
    (client) => client.query(api.snaps.q.getForAdminByRouteId, { snapId }),
    UNABLE_TO_LOAD_SNAPS
  )
}

export function handleAdminSnapUpdate(request: Request, snapId: string, environment: AdminSnapRouteEnvironment = {}) {
  return withAdminConvexWrite(
    request,
    environment,
    async (client) => {
      const parsed: unknown = await request.json().catch(() => null)
      if (!parsed || typeof parsed !== 'object') throw new AdminRequestError('A valid JSON request body is required.')

      const body = parsed as Record<string, unknown>
      const stringFields = ['fullName', 'plateNumber', 'make', 'model', 'phone'] as const
      if (stringFields.some((field) => typeof body[field] !== 'string')) {
        throw new AdminRequestError('Applicant name, plate number, phone, make, and model must be strings.')
      }
      if (!(body.year === null || typeof body.year === 'number') || !(body.mileage === null || typeof body.mileage === 'number')) {
        throw new AdminRequestError('Year and mileage must be numeric values when provided.')
      }

      return client.mutation(api.snaps.m.updateAdminDetails, {
        snapId: snapId as Id<'snaps'>,
        details: {
          fullName: body.fullName as string,
          plateNumber: body.plateNumber as string,
          make: body.make as string,
          model: body.model as string,
          year: body.year,
          mileage: body.mileage,
          phone: body.phone as string
        }
      })
    },
    'Unable to update the snap.'
  )
}

export function handleAdminSnapHandlers(request: Request, environment: AdminSnapRouteEnvironment = {}) {
  if (request.method === 'GET') {
    return withAdminConvex(
      request,
      environment,
      (client) => client.query(api.snaps.handlers.options, { accountId: requestedAccountId(request) }),
      'Unable to load handlers.'
    )
  }
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed.' }, { status: 405 })
  return withAdminConvexWrite(
    request,
    environment,
    async (client) => {
      const body = (await request.json()) as { uploadId?: unknown; memberId?: unknown }
      if (
        !body ||
        typeof body.uploadId !== 'string' ||
        !(body.memberId === null || typeof body.memberId === 'string')
      ) {
        throw new AdminRequestError('An upload ID and member ID (or null to clear) are required.')
      }
      return client.mutation(api.snaps.handlers.setHandler, {
        uploadId: body.uploadId,
        memberId: body.memberId as import('../../convex/_generated/dataModel').Id<'accountMembers'> | null
      })
    },
    'Unable to update the handler.'
  )
}
