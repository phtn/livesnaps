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
  ink: '#0f1115',
  muted: '#5b6472',
  hairline: '#e4e7ec',
  canvas: '#f6f7f9',
  surface: '#ffffff',
  action: '#0f1115',
  actionInk: '#ffffff'
}

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
  const recipientLine = input.adminConfirmation
    ? `This confirmation was sent to ${input.inviteeEmail}. Sign in with that address and confirm to activate your admin access.`
    : `This invitation was sent to ${input.inviteeEmail}. Sign in with that address to accept it.`

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
    '— LiveSnapsNow'
  ].join('\n')

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:${brand.canvas};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(intro)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${brand.canvas};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${brand.surface};border:1px solid ${brand.hairline};border-radius:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
            <tr>
              <td style="padding:28px 32px 0;">
                <p style="margin:0;font-size:15px;font-weight:600;letter-spacing:0.02em;color:${brand.ink};">
                  LIVE<span style="color:#6aa84f;">SNAPS</span>Now
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 0;">
                <h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:600;color:${brand.ink};">
                  ${input.adminConfirmation ? 'Confirm admin access to' : 'Join'} ${escapeHtml(input.accountName)}
                </h1>
                <p style="margin:12px 0 0;font-size:15px;line-height:1.6;color:${brand.muted};">
                  Hi ${escapeHtml(greeting)},
                </p>
                <p style="margin:8px 0 0;font-size:15px;line-height:1.6;color:${brand.muted};">
                  ${escapeHtml(intro)}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 0;">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid ${brand.hairline};border-radius:12px;">
                  <tr>
                    <td style="padding:12px 16px;font-size:13px;color:${brand.muted};">Account</td>
                    <td style="padding:12px 16px;font-size:13px;color:${brand.ink};text-align:right;">${escapeHtml(input.accountName)}</td>
                  </tr>
                  <tr>
                    <td style="padding:0 16px 12px;font-size:13px;color:${brand.muted};">Role</td>
                    <td style="padding:0 16px 12px;font-size:13px;color:${brand.ink};text-align:right;">${escapeHtml(input.role)}</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 0;">
                <a href="${escapeHtml(input.acceptUrl)}" style="display:inline-block;background:${brand.action};color:${brand.actionInk};text-decoration:none;font-size:15px;font-weight:500;padding:12px 22px;border-radius:999px;">
                  ${actionLabel}
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 28px;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:${brand.muted};">
                  ${escapeHtml(recipientLine)}
                  If you were not expecting it, you can ignore this message.
                </p>
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
