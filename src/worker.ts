import { handleSnapSessionRequest, type SnapRouteEnvironment } from './server/snap-routes'

interface WorkerEnvironment {
  ASSETS: {
    fetch(request: Request): Promise<Response>
  }
  CONVEX_URL?: string
  PUBLIC_CONVEX_URL?: string
  IPINFO_LITE_TOKEN?: string
  MAPBOX_ACCESS_TOKEN?: string
}

const SESSION_PATH = '/api/snaps/session'

const isSpaNavigation = (request: Request) =>
  request.method === 'GET' && request.headers.get('accept')?.includes('text/html')

export default {
  async fetch(request: Request, env: WorkerEnvironment): Promise<Response> {
    if (new URL(request.url).pathname === SESSION_PATH) {
      const environment: SnapRouteEnvironment = {
        convexUrl: env.CONVEX_URL || env.PUBLIC_CONVEX_URL,
        ipinfoLiteToken: env.IPINFO_LITE_TOKEN,
        mapboxAccessToken: env.MAPBOX_ACCESS_TOKEN
      }
      return handleSnapSessionRequest(request, environment)
    }

    const response = await env.ASSETS.fetch(request)
    if (response.status !== 404 || !isSpaNavigation(request)) return response

    return env.ASSETS.fetch(new Request(new URL('/', request.url), request))
  }
}
