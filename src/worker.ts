import { handleSnapSessionRequest } from './server/snap-routes'

interface WorkerEnvironment {
  ASSETS: {
    fetch(request: Request): Promise<Response>
  }
}

const SESSION_PATH = '/api/snaps/session'

export default {
  async fetch(request: Request, env: WorkerEnvironment): Promise<Response> {
    if (new URL(request.url).pathname === SESSION_PATH) {
      return handleSnapSessionRequest(request)
    }

    return env.ASSETS.fetch(request)
  }
}
