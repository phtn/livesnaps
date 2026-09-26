import { v } from 'convex/values'
import { internal } from '../_generated/api'
import { internalAction, internalMutation } from '../_generated/server'
import { deleteR2Object, isR2Configured } from '../lib/r2'

// Each deleted snap also deletes its vision logs (one per photo slot), so the
// batch stays well under the per-transaction write limit.
const ABANDONED_SNAP_DELETE_BATCH_SIZE = 100
const VISION_LOGS_PER_SNAP_LIMIT = 50

/**
 * Hard-deletes abandoned capture sessions, along with their vision logs, and
 * hands their photo keys to `deleteSnapPhotoObjects`. Submission-link analytics
 * live in `submissionLinkDailyStats`, so the abandoned counts survive.
 *
 * A snap that has a handler or a verification status is kept: someone is
 * working on it.
 */
export const deleteAbandonedSnaps = internalMutation({
  args: {},
  returns: v.object({
    deleted: v.number(),
    hasMore: v.boolean()
  }),
  handler: async (ctx) => {
    const abandoned = ctx.db
      .query('snaps')
      .withIndex('by_location_session_status_and_started_at', (query) =>
        query.eq('location_session.status', 'abandoned')
      )
      .order('asc')

    const photoKeys: string[] = []
    let deleted = 0
    let hasMore = false

    for await (const snap of abandoned) {
      if (snap.handler || snap.verification_status) continue

      if (deleted === ABANDONED_SNAP_DELETE_BATCH_SIZE) {
        hasMore = true
        break
      }

      const uploadId = snap.metadata.upload_id
      const visionLogs = await ctx.db
        .query('vision_logs')
        .withIndex('by_upload_id', (query) => query.eq('upload_id', uploadId))
        .take(VISION_LOGS_PER_SNAP_LIMIT)

      for (const log of visionLogs) {
        await ctx.db.delete('vision_logs', log._id)
      }

      photoKeys.push(...snap.metadata.photos.map((photo) => photo.r2_key))
      await ctx.db.delete('snaps', snap._id)
      deleted += 1
    }

    if (photoKeys.length > 0) {
      await ctx.scheduler.runAfter(0, internal.snaps.cleanup.deleteSnapPhotoObjects, { keys: photoKeys })
    }

    if (hasMore) {
      await ctx.scheduler.runAfter(0, internal.snaps.cleanup.deleteAbandonedSnaps, {})
    }

    return { deleted, hasMore }
  }
})

/**
 * Removes deleted snaps' photos from R2. The rows are already gone, so a
 * failure here only leaves orphaned objects; it is logged rather than retried.
 */
export const deleteSnapPhotoObjects = internalAction({
  args: { keys: v.array(v.string()) },
  returns: v.object({ deleted: v.number(), failed: v.number() }),
  handler: async (_ctx, { keys }) => {
    if (!isR2Configured()) {
      console.warn(`R2 is not configured; ${keys.length} abandoned snap photo(s) left in the bucket.`)
      return { deleted: 0, failed: keys.length }
    }

    const results = await Promise.allSettled(keys.map((key) => deleteR2Object(key)))
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')

    for (const failure of failures) {
      console.error(failure.reason instanceof Error ? failure.reason.message : failure.reason)
    }

    return { deleted: keys.length - failures.length, failed: failures.length }
  }
})
