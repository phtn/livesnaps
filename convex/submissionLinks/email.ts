import { ConvexError, v } from 'convex/values'
import { submissionLinkPath } from '../../src/lib/accounts/submission-links'
import { renderSubmissionLinkShareEmail } from '../../src/lib/email/submission-link-share'
import { normalizeRecipientDefaults } from '../../src/lib/verifications/recipient-defaults'
import { internal } from '../_generated/api'
import { action } from '../_generated/server'
import { getAppBaseUrl, sendTransactionalEmailBatch } from '../lib/email'

const MESSAGE_MAX_LENGTH = 5_000

export const send = action({
  args: {
    accountId: v.id('accounts'),
    linkId: v.id('submissionLinks'),
    recipients: v.array(v.string()),
    message: v.string()
  },
  returns: v.object({ sent: v.number() }),
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(internal.submissionLinks.q.getShareEmailContextInternal, {
      accountId: args.accountId,
      linkId: args.linkId
    })
    if (!context) throw new ConvexError('Submission link not found in this Account.')
    if (!context.enabled) throw new ConvexError('Enable this submission link before sharing it.')

    const message = args.message.trim()
    if (!message) throw new ConvexError('Enter a message for the recipient.')
    if (message.length > MESSAGE_MAX_LENGTH) throw new ConvexError(`Keep the message under ${MESSAGE_MAX_LENGTH.toLocaleString()} characters.`)

    let recipients: string[]
    try {
      recipients = normalizeRecipientDefaults(args.recipients)
    } catch (error) {
      throw new ConvexError(error instanceof Error ? error.message : 'Enter valid recipient email addresses.')
    }
    if (recipients.length === 0) throw new ConvexError('Add at least one recipient email address.')

    const submissionUrl = `${getAppBaseUrl()}${submissionLinkPath(context.accountSlug, context.linkSlug)}`
    const email = renderSubmissionLinkShareEmail({
      accountName: context.accountName,
      linkLabel: context.linkLabel,
      message,
      submissionUrl
    })
    await sendTransactionalEmailBatch(recipients.map(to => ({ to, ...email })))
    return { sent: recipients.length }
  }
})
