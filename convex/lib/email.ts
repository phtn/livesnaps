import { ConvexError } from 'convex/values'

const DEFAULT_FROM_ADDRESS = 'LiveSnapsNow <hq@livesnapsnow.com>'

export interface OutboundEmail {
  to: string
  subject: string
  html: string
  text: string
}

/**
 * The one place a transactional email leaves the deployment.
 *
 * `verificationEntries.m.sendEmail` predates this and still carries its own
 * Resend call because it also builds attachments; anything new should come
 * through here so the key lookup, the from address, and the failure shape stay
 * in one place.
 */
export async function sendTransactionalEmail({ to, subject, html, text }: OutboundEmail) {
  const apiKey = (process.env.RESEND_API_KEY ?? process.env.RESEND ?? '').trim()

  // Refusing beats logging: a silent no-op here would leave an invited member
  // waiting on an email that was never sent.
  if (!apiKey) {
    throw new ConvexError('Resend is not configured for this deployment. Set RESEND_API_KEY.')
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM?.trim() || DEFAULT_FROM_ADDRESS,
      to: [to],
      subject,
      html,
      text
    })
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new ConvexError(`Resend API failed (${response.status}): ${detail.slice(0, 500)}`)
  }
}

/**
 * Where an email's links point. Set `APP_BASE_URL` per deployment (a preview
 * pointing at production links would send people to the wrong data).
 */
export function getAppBaseUrl() {
  return (process.env.APP_BASE_URL?.trim() || 'https://livesnapsnow.com').replace(/\/+$/, '')
}
