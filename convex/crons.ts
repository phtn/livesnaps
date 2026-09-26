import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()

// Materialize abandonment so live analytics update without reading a query clock.
crons.interval('abandon expired capture sessions', { minutes: 5 }, internal.snaps.m.abandonExpiredSessions, {})

// Abandoned sessions are already counted in submission-link analytics, so the
// snap rows, their vision logs, and their R2 photos can go.
crons.interval('delete abandoned snaps', { hours: 3 }, internal.snaps.cleanup.deleteAbandonedSnaps, {})

export default crons
