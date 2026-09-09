import { handleAccountAdminConfirmation } from './server/account-confirmation-routes'
import { handleAdminSession, handleAdminSessionToken } from './server/admin-auth-routes'
import {
  handleAdminAccountMemberInvite,
  handleAdminAccountMemberList,
  handleAdminRegisteredUserSearch
} from './server/admin-member-routes'
import {
  handleAdminSnapDetail,
  handleAdminSnapHandlers,
  handleAdminSnapList,
  handleAdminSnapUpdate
} from './server/admin-snap-routes'
import {
  handleAdminVerificationEntryAttachmentRemove,
  handleAdminVerificationEntryAttachmentUpload,
  handleAdminVerificationEntryCreate,
  handleAdminVerificationEntryList,
  handleAdminVerificationEntrySend
} from './server/admin-verification-routes'
import { handleGodsAccountDetail, handleGodsAccounts } from './server/gods-account-routes'
import { handleGodsSession, handleGodsSessionToken } from './server/gods-auth-routes'
import { handleGodsUserClaims, handleGodsUsers } from './server/gods-user-routes'
import { handleRecipientDefaults } from './server/recipient-defaults-routes'
import { handleReportSettings } from './server/report-settings-routes'
import { handleResendWebhook } from './server/resend-webhook-routes'
import {
  handleAdminSnapPhotoRequest,
  handleSnapPhotoRequest,
  handleSnapSubmissionPhotoPreviewRequest,
  type SnapPhotoRouteEnvironment
} from './server/snap-photo-routes'
import { handleSnapSessionRequest, type SnapRouteEnvironment } from './server/snap-routes'
import {
  handleSubmissionAnalytics,
  handleSubmissionLinkEmail,
  handleSubmissionLinks,
  handleWorkspaceAccounts
} from './server/workspace-routes'

interface WorkerEnvironment {
  ASSETS: {
    fetch(request: Request): Promise<Response>
  }
  CONVEX_URL?: string
  PUBLIC_CONVEX_URL?: string
  IPINFO_LITE_TOKEN?: string
  MAPBOX_ACCESS_TOKEN?: string
  R2_ACCOUNT_ID?: string
  R2_ACCESS_KEY_ID?: string
  R2_SECRET_ACCESS_KEY?: string
  R2_BUCKET_NAME?: string
  RESEND_WEBHOOK_SECRET?: string
}

const SESSION_PATH = '/api/snaps/session'
const ADMIN_SESSION_PATH = '/api/admin/session'
const ADMIN_SESSION_TOKEN_PATH = '/api/admin/session/token'
const GODS_SESSION_PATH = '/api/gods/session'
const GODS_SESSION_TOKEN_PATH = '/api/gods/session/token'
const GODS_ACCOUNTS_PATH = '/api/gods/accounts'
const GODS_ACCOUNT_DETAIL_PATH = /^\/api\/gods\/accounts\/([^/]+)$/
const GODS_USERS_PATH = '/api/gods/users'
const GODS_USER_CLAIMS_PATH = '/api/gods/users/claims'
const PHOTO_PATH = '/api/proofs'
const ADMIN_SNAPS_PATH = '/api/admin/snaps'
const ADMIN_SNAP_DETAIL_PATH = /^\/api\/admin\/snaps\/([^/]+)$/
const ADMIN_ACCOUNT_MEMBERS_PATH = '/api/admin/account-members'
const ADMIN_USERS_PATH = '/api/admin/users'
const ADMIN_VERIFICATION_ENTRIES_PATH = '/api/admin/verification-entries'
const ADMIN_VERIFICATION_ENTRY_SEND_PATH = '/api/admin/verification-entries/send'
const ADMIN_VERIFICATION_ENTRY_ATTACHMENTS_PATH = '/api/admin/verification-entries/attachments'
const ADMIN_VERIFICATION_ENTRY_ATTACHMENT_REMOVE_PATH = '/api/admin/verification-entries/attachments/remove'
const SNAP_SUBMISSION_PHOTO_PATH = /^\/api\/snaps\/([^/]+)\/photos\/(\d+)$/
const ADMIN_SNAP_PHOTO_PATH = /^\/api\/r2\/(.+)$/
const RESEND_WEBHOOK_PATH = '/api/webhooks'

const isSpaNavigation = (request: Request) =>
  request.method === 'GET' && request.headers.get('accept')?.includes('text/html')

const getSnapPhotoEnvironment = (env: WorkerEnvironment): SnapPhotoRouteEnvironment => ({
  convexUrl: env.CONVEX_URL || env.PUBLIC_CONVEX_URL,
  r2AccountId: env.R2_ACCOUNT_ID,
  r2AccessKeyId: env.R2_ACCESS_KEY_ID,
  r2SecretAccessKey: env.R2_SECRET_ACCESS_KEY,
  r2Bucket: env.R2_BUCKET_NAME
})

export default {
  async fetch(request: Request, env: WorkerEnvironment): Promise<Response> {
    const pathname = new URL(request.url).pathname
    const photoRouteMatch = SNAP_SUBMISSION_PHOTO_PATH.exec(pathname)

    if (pathname === '/api/admin/recipient-defaults')
      return handleRecipientDefaults(request, { convexUrl: env.CONVEX_URL || env.PUBLIC_CONVEX_URL })

    if (pathname === '/api/gods/report-settings')
      return handleReportSettings(request, { convexUrl: env.CONVEX_URL || env.PUBLIC_CONVEX_URL })

    if (pathname === SESSION_PATH) {
      const environment: SnapRouteEnvironment = {
        convexUrl: env.CONVEX_URL || env.PUBLIC_CONVEX_URL,
        ipinfoLiteToken: env.IPINFO_LITE_TOKEN,
        mapboxAccessToken: env.MAPBOX_ACCESS_TOKEN
      }
      return handleSnapSessionRequest(request, environment)
    }

    if (pathname === ADMIN_SESSION_TOKEN_PATH) {
      return handleAdminSessionToken(request)
    }

    if (pathname === ADMIN_SESSION_PATH) {
      return handleAdminSession(request, { convexUrl: env.CONVEX_URL || env.PUBLIC_CONVEX_URL })
    }

    if (pathname === GODS_SESSION_TOKEN_PATH) {
      return handleGodsSessionToken(request)
    }

    if (pathname === GODS_SESSION_PATH) {
      return handleGodsSession(request)
    }

    if (pathname === GODS_USER_CLAIMS_PATH) {
      return handleGodsUserClaims(request)
    }

    if (pathname === GODS_USERS_PATH) {
      return handleGodsUsers(request)
    }

    const convexUrl = env.CONVEX_URL || env.PUBLIC_CONVEX_URL

    if (pathname === '/api/admin/accounts') return handleWorkspaceAccounts(request, { convexUrl })
    if (pathname === '/api/admin/submission-links') return handleSubmissionLinks(request, { convexUrl })
    if (pathname === '/api/admin/submission-links/email') return handleSubmissionLinkEmail(request, { convexUrl })
    if (pathname === '/api/admin/submission-analytics') return handleSubmissionAnalytics(request, { convexUrl })

    if (pathname === '/api/account/confirm-admin') {
      return handleAccountAdminConfirmation(request, { convexUrl })
    }

    if (pathname === RESEND_WEBHOOK_PATH) {
      return handleResendWebhook(request, {
        convexUrl,
        resendWebhookSecret: env.RESEND_WEBHOOK_SECRET
      })
    }

    if (pathname === GODS_ACCOUNTS_PATH) {
      return handleGodsAccounts(request, { convexUrl })
    }

    const godsAccountDetailMatch = GODS_ACCOUNT_DETAIL_PATH.exec(pathname)

    if (godsAccountDetailMatch) {
      let accountSlug: string

      try {
        accountSlug = decodeURIComponent(godsAccountDetailMatch[1])
      } catch {
        return Response.json({ error: 'The account slug is invalid.' }, { status: 400 })
      }

      return handleGodsAccountDetail(request, accountSlug, { convexUrl })
    }

    if (pathname === '/api/admin/snap-handlers') {
      return handleAdminSnapHandlers(request, { convexUrl })
    }

    if (pathname === ADMIN_SNAPS_PATH) {
      return handleAdminSnapList(request, { convexUrl })
    }

    if (pathname === ADMIN_ACCOUNT_MEMBERS_PATH) {
      // One path, two verbs: GET reads the workspace roster, POST invites.
      return request.method === 'POST'
        ? handleAdminAccountMemberInvite(request, { convexUrl })
        : handleAdminAccountMemberList(request, { convexUrl })
    }

    if (pathname === ADMIN_USERS_PATH) {
      return handleAdminRegisteredUserSearch(request, { convexUrl })
    }

    if (pathname === ADMIN_VERIFICATION_ENTRIES_PATH) {
      // One path, two verbs: GET polls the table, POST creates a draft entry.
      return request.method === 'POST'
        ? handleAdminVerificationEntryCreate(request, { convexUrl })
        : handleAdminVerificationEntryList(request, { convexUrl })
    }

    if (pathname === ADMIN_VERIFICATION_ENTRY_SEND_PATH) {
      return handleAdminVerificationEntrySend(request, { convexUrl })
    }

    if (pathname === ADMIN_VERIFICATION_ENTRY_ATTACHMENTS_PATH) {
      return handleAdminVerificationEntryAttachmentUpload(request, { convexUrl })
    }

    if (pathname === ADMIN_VERIFICATION_ENTRY_ATTACHMENT_REMOVE_PATH) {
      return handleAdminVerificationEntryAttachmentRemove(request, { convexUrl })
    }

    const adminSnapDetailMatch = ADMIN_SNAP_DETAIL_PATH.exec(pathname)

    if (adminSnapDetailMatch) {
      let snapId: string

      try {
        snapId = decodeURIComponent(adminSnapDetailMatch[1])
      } catch {
        return Response.json({ error: 'The snap ID is invalid.' }, { status: 400 })
      }

      return request.method === 'POST'
        ? handleAdminSnapUpdate(request, snapId, { convexUrl })
        : handleAdminSnapDetail(request, snapId, { convexUrl })
    }

    if (pathname === PHOTO_PATH) {
      return handleSnapPhotoRequest(request, getSnapPhotoEnvironment(env))
    }

    const adminSnapPhotoMatch = ADMIN_SNAP_PHOTO_PATH.exec(pathname)

    if (adminSnapPhotoMatch) {
      let objectKey: string

      try {
        objectKey = adminSnapPhotoMatch[1].split('/').map(decodeURIComponent).join('/')
      } catch {
        return Response.json({ error: 'The photo path is invalid.' }, { status: 400 })
      }

      return handleAdminSnapPhotoRequest(request, objectKey, getSnapPhotoEnvironment(env))
    }

    if (photoRouteMatch) {
      let proofId: string

      try {
        proofId = decodeURIComponent(photoRouteMatch[1])
      } catch {
        return Response.json({ error: 'The proof ID is invalid.' }, { status: 400 })
      }

      return handleSnapSubmissionPhotoPreviewRequest(
        request,
        proofId,
        Number(photoRouteMatch[2]),
        getSnapPhotoEnvironment(env)
      )
    }

    const response = await env.ASSETS.fetch(request)
    if (response.status !== 404 || !isSpaNavigation(request)) return response

    return env.ASSETS.fetch(new Request(new URL('/', request.url), request))
  }
}
