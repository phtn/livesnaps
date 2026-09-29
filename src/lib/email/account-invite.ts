/**
 * The account invitation email.
 *
 * Kept as a pure renderer, separate from the Convex action that sends it, so the
 * copy and markup can be read, tested, and previewed without a deployment or an
 * outbound request.
 *
 * Email clients are not browsers: no external stylesheet survives the trip, and
 * several still lay out with tables. Hence inline styles, table scaffolding, and
 * a plain-text alternative that carries the same information for clients (and
 * readers) that refuse HTML.
 */

export interface AccountInviteEmailInput {
  /** The account the recipient is being invited into. */
  accountName: string
  /** Recipient's name when known - the greeting falls back to the address. */
  inviteeName?: string | null
  inviteeEmail: string
  /** Membership role, shown so the recipient knows what they are accepting. */
  role: string
  /** Who sent the invitation, when known. */
  inviterName?: string | null
  /** Where the recipient goes to accept. */
  adminConfirmation?: boolean
  acceptUrl: string
}

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

const brand = {
  ink: '#101828',
  softInk: '#344054',
  muted: '#667085',
  faint: '#98a2b3',
  hairline: '#e4e7ec',
  canvas: '#eef0f4',
  surface: '#ffffff',
  inset: '#f8f9fb',
  action: '#101828',
  actionInk: '#ffffff'
}

const serif = "Georgia,'Times New Roman',serif"
const sans = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"

// Force PNG for email clients that cannot render WebP; avoid automatic format negotiation.
export const EMAIL_WORDMARK_URL =
  'https://res.cloudinary.com/dx0heqhhe/image/upload/f_png/v1788892525/livesnaps-wordmark_pnd1ts.png'

/** Public website, linked from the footer of every template. */
export const WEBSITE_URL = 'https://livesnapsnow.com'
export const WEBSITE_LABEL = 'livesnapsnow.com'

/** Email HTML is assembled by string, so every interpolated value is escaped. */
function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const greetingName = (input: AccountInviteEmailInput) => input.inviteeName?.trim() || input.inviteeEmail

const inviterLine = (input: AccountInviteEmailInput) => {
  const inviter = input.inviterName?.trim()
  return inviter
    ? `${inviter} invited you to join ${input.accountName} on LiveSnapsNow.`
    : `You have been invited to join ${input.accountName} on LiveSnapsNow.`
}

export function renderAccountInviteEmail(input: AccountInviteEmailInput): RenderedEmail {
  const greeting = greetingName(input)
  const intro = input.adminConfirmation
    ? `An account has been created for you at ${input.accountName} on LiveSnapsNow. Confirm admin access on your Account page to manage it as its owner.`
    : inviterLine(input)
  const subject = input.adminConfirmation
    ? `Confirm admin access to ${input.accountName} on LiveSnapsNow`
    : `You're invited to ${input.accountName} on LiveSnapsNow`
  const actionLabel = input.adminConfirmation ? 'Confirm admin access' : 'Accept invitation'
  const eyebrow = input.adminConfirmation ? 'Admin confirmation' : 'You are invited'
  const headline = input.adminConfirmation ? 'Confirm admin access to' : 'Join'
  const recipientLine = input.adminConfirmation
    ? `This confirmation was sent to ${input.inviteeEmail}. Sign in with that address and confirm to activate your admin access.`
    : `This invitation was sent to ${input.inviteeEmail}. Sign in with that address to accept it.`
  const inviter = input.inviterName?.trim() || ''

  const text = [
    `Hi ${greeting},`,
    '',
    intro,
    `Role: ${input.role}`,
    '',
    `${actionLabel}:`,
    input.acceptUrl,
    '',
    recipientLine,
    '',
    '— LiveSnapsNow',
    WEBSITE_URL
  ].join('\n')

  const detailRow = (label: string, value: string, divided: boolean) => `
                  <tr>
                    <td style="padding:${divided ? '13px 20px 13px' : '14px 20px 14px'};font-family:${sans};font-size:11px;line-height:1.5;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${brand.faint};${divided ? `border-top:1px solid ${brand.hairline};` : ''}">${label}</td>
                    <td align="right" style="padding:${divided ? '13px 20px 13px' : '14px 20px 14px'};font-family:${sans};font-size:14px;line-height:1.5;font-weight:600;color:${brand.ink};${divided ? `border-top:1px solid ${brand.hairline};` : ''}">${value}</td>
                  </tr>`

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:${brand.canvas};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(intro)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${brand.canvas}" style="background:${brand.canvas};padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${brand.surface}" style="max-width:560px;background:${brand.surface};border:1px solid ${brand.hairline};border-radius:20px;font-family:${sans};">
            <tr>
              <td style="padding:36px 40px 0;">
                <img src="${EMAIL_WORDMARK_URL}" width="156" alt="LiveSnapsNow" style="display:block;width:156px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;" />
                <p style="margin:22px 0 0;font-size:11px;line-height:1.5;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:${brand.faint};">
                  ${escapeHtml(eyebrow)}
                </p>
                <h1 style="margin:10px 0 0;font-family:${serif};font-size:28px;line-height:1.3;font-weight:600;color:${brand.ink};">
                  ${headline} ${escapeHtml(input.accountName)}
                </h1>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 40px 0;">
                <p style="margin:0;font-size:15px;line-height:1.7;color:${brand.softInk};">
                  Hi ${escapeHtml(greeting)},
                </p>
                <p style="margin:10px 0 0;font-size:15px;line-height:1.7;color:${brand.softInk};">
                  ${escapeHtml(intro)}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:26px 40px 0;">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" bgcolor="${brand.inset}" style="background:${brand.inset};border:1px solid ${brand.hairline};border-radius:14px;">
                  ${detailRow('Account', escapeHtml(input.accountName), false)}
                  ${detailRow('Role', escapeHtml(input.role), true)}
                  ${!input.adminConfirmation && inviter ? detailRow('Invited by', escapeHtml(inviter), true) : ''}
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:30px 40px 0;">
                <a href="${escapeHtml(input.acceptUrl)}" style="display:inline-block;background:${brand.action};color:${brand.actionInk};text-decoration:none;font-size:15px;font-weight:600;letter-spacing:.01em;padding:14px 30px;border-radius:999px;">
                  ${actionLabel}
                </a>
                <p style="margin:18px 0 0;font-size:12px;line-height:1.7;color:${brand.muted};">
                  If the button does not open, copy and paste this link into your browser:<br />
                  <a href="${escapeHtml(input.acceptUrl)}" style="color:${brand.softInk};word-break:break-all;">${escapeHtml(input.acceptUrl)}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:26px 40px 36px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${brand.hairline};">
                  <tr>
                    <td style="padding-top:20px;font-size:12px;line-height:1.7;color:${brand.muted};">
                      ${escapeHtml(recipientLine)}
                      If you were not expecting it, you can ignore this message.
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
            <tr>
              <td align="center" style="padding:24px 16px 0;font-family:${sans};font-size:12px;line-height:1.8;color:${brand.faint};">
                LiveSnapsNow · Secure photo verification<br />
                <a href="${WEBSITE_URL}" style="color:${brand.faint};text-decoration:underline;">${WEBSITE_LABEL}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

  return { subject, html, text }
}
