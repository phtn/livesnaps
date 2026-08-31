import {
  handleSnapPhotoRequest,
  handleSnapSubmissionPhotoPreviewRequest,
  type SnapPhotoRouteEnvironment
} from './server/snap-photo-routes'
import { handleSnapSessionRequest, type SnapRouteEnvironment } from './server/snap-routes'

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
}

const SESSION_PATH = '/api/snaps/session'
const PHOTO_PATH = '/api/proofs'
const SNAP_SUBMISSION_PHOTO_PATH = /^\/api\/snaps\/([^/]+)\/photos\/(\d+)$/

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

    if (pathname === SESSION_PATH) {
      const environment: SnapRouteEnvironment = {
        convexUrl: env.CONVEX_URL || env.PUBLIC_CONVEX_URL,
        ipinfoLiteToken: env.IPINFO_LITE_TOKEN,
        mapboxAccessToken: env.MAPBOX_ACCESS_TOKEN
      }
      return handleSnapSessionRequest(request, environment)
    }

    if (pathname === PHOTO_PATH) {
      return handleSnapPhotoRequest(request, getSnapPhotoEnvironment(env))
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
