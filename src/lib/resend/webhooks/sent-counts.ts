interface ResendWebhookTargetEvent {
  eventType: string
  target?: string
}

const normalizeEmail = (value: string) => value.trim().toLowerCase()

export function countEmailSentEventsByTarget(events: ResendWebhookTargetEvent[], emails: string[]) {
  const counts = new Map(Array.from(new Set(emails.map(normalizeEmail).filter(Boolean)), (email) => [email, 0]))

  for (const event of events) {
    if (event.eventType !== 'email.sent' || !event.target) continue

    const target = normalizeEmail(event.target)
    const currentCount = counts.get(target)

    if (currentCount !== undefined) {
      counts.set(target, currentCount + 1)
    }
  }

  return Array.from(counts, ([email, sentCount]) => ({ email, sentCount }))
}
