import { submissionLinkPath } from './submission-links'

export const PUBLIC_SUBMISSION_ORIGIN = 'https://livesnapsnow.com'

export function submissionShareUrl(accountSlug: string, linkSlug = '') {
  const url = new URL(PUBLIC_SUBMISSION_ORIGIN)
  url.pathname = submissionLinkPath(accountSlug, linkSlug)
  return url.toString()
}

export async function workspaceJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin', ...init })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? body.error : 'Unable to complete this request.'
    throw new Error(message)
  }
  return body as T
}

export const writeWorkspaceJson = <T>(url: string, body: unknown) => workspaceJson<T>(url, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
})
