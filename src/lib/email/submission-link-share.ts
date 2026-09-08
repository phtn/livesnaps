import { EMAIL_WORDMARK_URL, type RenderedEmail } from './account-invite'

export interface SubmissionLinkShareEmailInput {
  accountName: string
  linkLabel: string
  message: string
  submissionUrl: string
}

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
    `This secure submission link was sent by ${input.accountName} using LiveSnapsNow.`
  ].join('\n')

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f6f7f9;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.accountName)} shared a secure submission link with you.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#ffffff;border:1px solid #e4e7ec;border-radius:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
            <tr>
              <td style="padding:28px 32px 0;">
                <img src="${EMAIL_WORDMARK_URL}" width="156" alt="LiveSnapsNow" style="display:block;width:156px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;" />
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 0;">
                <p style="margin:0;font-size:12px;line-height:1.5;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#687182;">${escapeHtml(input.accountName)}</p>
                <h1 style="margin:7px 0 0;font-size:23px;line-height:1.3;font-weight:600;color:#0f1115;">A secure submission link for you</h1>
                <p style="margin:16px 0 0;font-size:15px;line-height:1.65;color:#5b6472;">${messageHtml(input.message)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 0;">
                <a href="${escapeHtml(input.submissionUrl)}" style="display:inline-block;background:#0f1115;color:#ffffff;text-decoration:none;font-size:15px;font-weight:500;padding:12px 22px;border-radius:999px;">Open submission link</a>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 32px 28px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e4e7ec;">
                  <tr><td style="padding-top:18px;font-size:12px;line-height:1.6;color:#7a8494;">Link: ${escapeHtml(input.linkLabel)}<br />If the button does not open, copy this address:<br /><a href="${escapeHtml(input.submissionUrl)}" style="color:#404957;word-break:break-all;">${escapeHtml(input.submissionUrl)}</a></td></tr>
                </table>
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
