import { renderAccountInviteEmail } from './account-invite'
import { renderSubmissionLinkShareEmail } from './submission-link-share'

export const emailTemplates = [
  { id: 'account-invite', name: 'Account invitation', description: 'Invite a member to an account.' },
  { id: 'admin-confirmation', name: 'Admin confirmation', description: 'Confirm ownership of a newly created account.' },
  { id: 'submission-link', name: 'Submission link', description: 'Share a secure submission link.' }
] as const

export type EmailTemplateId = typeof emailTemplates[number]['id']

/** Sample data uses the production renderers without creating real invitations or links. */
export function renderEmailTemplateSample(template: EmailTemplateId, recipient = 'recipient@example.com') {
  if (template === 'submission-link') {
    return renderSubmissionLinkShareEmail({
      accountName: 'Sample account',
      linkLabel: 'Sample submission link',
      message: 'This is a test email from LiveSnapsNow. Please review the layout and wordmark. No submission is required.',
      submissionUrl: 'https://example.com/livesnaps-email-test'
    })
  }
  return renderAccountInviteEmail({
    accountName: 'Sample account',
    inviteeName: 'Test recipient',
    inviteeEmail: recipient,
    inviterName: 'LiveSnapsNow team',
    role: template === 'admin-confirmation' ? 'owner' : 'member',
    adminConfirmation: template === 'admin-confirmation',
    acceptUrl: 'https://example.com/livesnaps-email-test'
  })
}
