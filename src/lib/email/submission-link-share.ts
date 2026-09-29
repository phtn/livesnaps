import { EMAIL_WORDMARK_URL, WEBSITE_LABEL, WEBSITE_URL, type RenderedEmail } from './account-invite'

export interface SubmissionLinkShareEmailInput {
  accountName: string
  linkLabel: string
  message: string
  submissionUrl: string
}

const brand = {
  ink: '#101828',
  softInk: '#344054',
  muted: '#667085',
  faint: '#98a2b3',
  hairline: '#e4e7ec',
  canvas: '#eef0f4',
  surface: '#ffffff',
  inset: '#f8f9fb'
}

const serif = "Georgia,'Times New Roman',serif"
const sans = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

const messageHtml = (value: string) => escapeHtml(value).replace(/\r?\n/g, '<br />')

/** Pure renderer so the share email can be tested without contacting Resend. */
export function renderSubmissionLinkShareEmail(input: SubmissionLinkShareEmailInput): RenderedEmail {
  const subject = `${input.accountName} sent you a LiveSnapsNow submission link`
  const text = [
    input.message,
    '',
    `${input.linkLabel}:`,
    input.submissionUrl,
    '',
    `This secure submission link was sent by ${input.accountName} using LiveSnapsNow.`,
    '',
    WEBSITE_URL
  ].join('\n')

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:${brand.canvas};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.accountName)} shared a secure submission link with you.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${brand.canvas}" style="background:${brand.canvas};padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${brand.surface}" style="max-width:560px;background:${brand.surface};border:1px solid ${brand.hairline};border-radius:20px;font-family:${sans};">
            <tr>
              <td style="padding:36px 40px 0;">
                <img src="${EMAIL_WORDMARK_URL}" width="156" alt="LiveSnapsNow" style="display:block;width:156px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;" />
                <p style="margin:22px 0 0;font-size:11px;line-height:1.5;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:${brand.faint};">
                  ${escapeHtml(input.accountName)}
                </p>
                <h1 style="margin:10px 0 0;font-family:${serif};font-size:28px;line-height:1.3;font-weight:600;color:${brand.ink};">
                  A secure submission link for you
                </h1>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 40px 0;">
                <p style="margin:0;font-size:15px;line-height:1.7;color:${brand.softInk};">${messageHtml(input.message)}</p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:30px 40px 0;">
                <a href="${escapeHtml(input.submissionUrl)}" style="display:inline-block;background:${brand.ink};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;letter-spacing:.01em;padding:14px 30px;border-radius:999px;">Open submission link</a>
                <p style="margin:18px 0 0;font-size:12px;line-height:1.7;color:${brand.muted};">
                  If the button does not open, copy and paste this link into your browser:<br />
                  <a href="${escapeHtml(input.submissionUrl)}" style="color:${brand.softInk};word-break:break-all;">${escapeHtml(input.submissionUrl)}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:26px 40px 36px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${brand.inset}" style="background:${brand.inset};border:1px solid ${brand.hairline};border-radius:14px;">
                  <tr>
                    <td style="padding:14px 20px;font-family:${sans};font-size:11px;line-height:1.5;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${brand.faint};">Link</td>
                    <td align="right" style="padding:14px 20px;font-family:${sans};font-size:14px;line-height:1.5;font-weight:600;color:${brand.ink};">${escapeHtml(input.linkLabel)}</td>
                  </tr>
                </table>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${brand.hairline};margin-top:26px;">
                  <tr>
                    <td style="padding-top:20px;font-size:12px;line-height:1.7;color:${brand.muted};">
                      This secure submission link was sent by ${escapeHtml(input.accountName)} using LiveSnapsNow.
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
