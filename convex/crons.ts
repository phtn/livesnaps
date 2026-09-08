import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()

// Materialize abandonment so live analytics update without reading a query clock.
crons.interval('abandon expired capture sessions', { minutes: 5 }, internal.snaps.m.abandonExpiredSessions, {})

export default crons
