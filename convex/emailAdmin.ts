import { ConvexError, v } from 'convex/values'
import { isAccountEmailAddress } from '../src/lib/accounts/accounts'
import { renderEmailTemplateSample } from '../src/lib/email/templates'
import { action } from './_generated/server'
import { sendTransactionalEmail } from './lib/email'

export const sendTest = action({
  args: {
    template: v.union(v.literal('account-invite'), v.literal('admin-confirmation'), v.literal('submission-link')),
    recipient: v.string()
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity?.god !== true) throw new ConvexError('Citadel access is required to send test emails.')
    const recipient = args.recipient.trim().toLowerCase()
    if (!isAccountEmailAddress(recipient)) throw new ConvexError('Enter a valid recipient email address.')
    const email = renderEmailTemplateSample(args.template, recipient)
    await sendTransactionalEmail({ ...email, to: recipient, subject: `[TEST] ${email.subject}` })
    return null
  }
})
