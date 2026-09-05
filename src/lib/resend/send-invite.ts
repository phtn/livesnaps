import { createClient } from './index'
import { queueResendSend } from './rate-limit'
import { renderTemplate } from './render'
import { DEFAULT_PROPS, parseTemplateProps, type TemplateProps } from './templates/defaults'
import { GreetingEmail } from './templates/greeting'

const DEFAULT_FROM = 'hq@foreplay.pro'
const DEFAULT_APP_BASE_URL = 'https://foreplay.pro'
const DEFAULT_SUBJECT = "You're invited."
const FALLBACK_RETRY_DELAYS_MS = [500, 1500] as const

type SendEmailArgs = {
  to: string
  subject?: string | null
  recipientName?: string | null
  templateProps?: TemplateProps | string | null
  cc?: string[]
  bcc?: string[]
  headers?: Record<string, string>
}

const toNonEmptyString = (value: string | undefined | null): string | null => {
  if (!value) {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

const toNonEmptyStringArray = (values: string[] | undefined): string[] | undefined => {
  if (!values) {
    return undefined
  }

  const normalized = values.map((value) => value.trim()).filter((value) => value.length > 0)

  return normalized.length > 0 ? normalized : undefined
}

const normalizeHeaders = (headers: Record<string, string> | undefined): Record<string, string> | undefined => {
  if (!headers) {
    return undefined
  }

  const normalizedEntries = Object.entries(headers).flatMap(([key, value]) => {
    const normalizedKey = key.trim()
    const normalizedValue = value.trim()

    if (!normalizedKey || !normalizedValue) {
      return []
    }

    return [[normalizedKey, normalizedValue] as const]
  })

  return normalizedEntries.length > 0 ? Object.fromEntries(normalizedEntries) : undefined
}

const mergeTemplateProps = (templateProps: TemplateProps | string | null | undefined): TemplateProps => {
  const baseProps =
    typeof templateProps === 'string'
      ? parseTemplateProps(templateProps)
      : {
          ...DEFAULT_PROPS,
          ...(templateProps ?? {})
        }

  return {
    ...baseProps,
    recipientName: toNonEmptyString(baseProps.recipientName) ?? undefined,
    inviterName: toNonEmptyString(baseProps.inviterName) ?? undefined,
    title: toNonEmptyString(baseProps.title) ?? DEFAULT_PROPS.title,
    message: toNonEmptyString(baseProps.message) ?? DEFAULT_PROPS.message,
    ctaLabel: toNonEmptyString(baseProps.ctaLabel) ?? DEFAULT_PROPS.ctaLabel,
    ctaUrl: toNonEmptyString(baseProps.ctaUrl) ?? DEFAULT_PROPS.ctaUrl,
    accessCode: toNonEmptyString(baseProps.accessCode) ?? undefined
  }
}

const extractResendError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  if (error && typeof error === 'object') {
    const message = 'message' in error && typeof error.message === 'string' ? error.message : undefined
    const name = 'name' in error && typeof error.name === 'string' ? error.name : undefined

    if (message && name) {
      return `${name}: ${message}`
    }

    if (message) {
      return message
    }
  }

  return 'Unknown Resend error'
}

const getAppBaseUrl = (): string =>
  process.env.EMAIL_API_BASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
  process.env.SITE_URL?.trim() ||
  DEFAULT_APP_BASE_URL

const getRecipientName = (recipientName: string | undefined | null, email: string): string => {
  const name = toNonEmptyString(recipientName)
  if (name) {
    return name
  }

  const emailName = toNonEmptyString(email)?.split('@')[0]
  return emailName || 'there'
}

async function sendViaAppApi(args: {
  to: string
  subject: string
  html: string
  cc?: string[]
  bcc?: string[]
  headers?: Record<string, string>
}): Promise<{ id: string | null }> {
  const response = await fetch(`${getAppBaseUrl()}/api/resend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'invite',
      type: 'products',
      group: 'auto',
      from: process.env.RESEND_FROM ?? DEFAULT_FROM,
      to: [args.to],
      subject: args.subject,
      html: args.html,
      cc: args.cc,
      bcc: args.bcc,
      headers: args.headers
    })
  })

  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean
    id?: string | null
    error?: string
  } | null

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error ?? 'Failed to send via /api/resend')
  }

  return {
    id: payload.id ?? null
  }
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function sendViaAppApiWithRetry(args: {
  to: string
  subject: string
  html: string
  cc?: string[]
  bcc?: string[]
  headers?: Record<string, string>
}): Promise<{ id: string | null }> {
  let lastError: unknown = null

  for (let attempt = 0; attempt <= FALLBACK_RETRY_DELAYS_MS.length; attempt++) {
    try {
      const result = await sendViaAppApi(args)
      if (attempt > 0) {
        console.info('[-email] fallback send recovered', {
          attempt: attempt + 1,
          to: args.to
        })
      }
      return result
    } catch (error) {
      lastError = error
      console.error('[-email] fallback send failed', {
        attempt: attempt + 1,
        to: args.to,
        error: extractResendError(error)
      })

      const retryDelay = FALLBACK_RETRY_DELAYS_MS[attempt]
      if (retryDelay === undefined) {
        break
      }

      await delay(retryDelay)
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to send via /api/resend after retries')
}

export async function sendEmail(args: SendEmailArgs): Promise<{ id: string | null } | null> {
  const to = toNonEmptyString(args.to)
  if (!to) {
    return null
  }

  const normalizedTemplateProps = mergeTemplateProps(args.templateProps)
  const cc = toNonEmptyStringArray(args.cc)
  const bcc = toNonEmptyStringArray(args.bcc)
  const headers = normalizeHeaders(args.headers)
  const html = await renderTemplate(GreetingEmail, {
    ...normalizedTemplateProps,
    recipientName: getRecipientName(args.recipientName ?? normalizedTemplateProps.recipientName, to)
  })
  const subject = toNonEmptyString(args.subject) ?? DEFAULT_SUBJECT

  let resend: ReturnType<typeof createClient> | null = null
  try {
    resend = createClient()
  } catch (error) {
    const message = extractResendError(error)
    if (!message.includes('Resend API key is not configured')) {
      throw error
    }
  }

  if (!resend) {
    return sendViaAppApiWithRetry({
      to,
      subject,
      html,
      cc,
      bcc,
      headers
    })
  }

  const result = await queueResendSend(() =>
    resend.emails.send({
      from: process.env.RESEND_FROM ?? DEFAULT_FROM,
      to,
      subject,
      html,
      cc,
      bcc,
      headers
    })
  )

  if (result.error) {
    throw new Error(extractResendError(result.error))
  }

  return {
    id: result.data?.id ?? null
  }
}
