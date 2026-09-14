/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { buildUserAvatarObjectKey } from '../../src/lib/r2/user-avatars'
import { api, internal } from '../_generated/api'
import schema from '../schema'

const modules = import.meta.glob('/convex/**/*.ts')
const picture = 'https://lh3.googleusercontent.com/a/photo=s96-c'
const identity = (pictureUrl = picture) => ({
  subject: 'firebase-uid',
  issuer: 'https://securetoken.google.com/livesnaps',
  tokenIdentifier: 'issuer|firebase-uid',
  pictureUrl
})

const scheduledSyncs = (t: ReturnType<typeof convexTest>) =>
  t.run(async (ctx) =>
    (await ctx.db.system.query('_scheduled_functions').collect()).filter((job) => job.name === 'users/avatar:sync')
  )

describe('user avatar keys', () => {
  test('uses the user-scoped 1010.webp object', () => {
    expect(buildUserAvatarObjectKey('j57abc_def-123')).toBe('users/j57abc_def-123/1010.webp')
    expect(() => buildUserAvatarObjectKey('../other')).toThrow(/Invalid user avatar path/)
  })
})

describe('avatar sync scheduling', () => {
  // Fake timers keep the scheduled Node action (sharp + R2) from actually running.
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  test('queues one sync on sign-in and throttles repeat requests', async () => {
    const t = convexTest(schema, modules)
    const userId = await t.withIdentity(identity()).mutation(api.users.m.ensureCurrent, {})
    await t.withIdentity(identity()).mutation(api.users.m.ensureCurrent, {})

    const jobs = await scheduledSyncs(t)
    expect(jobs).toHaveLength(1)
    expect(jobs[0].args[0]).toEqual({ userId, sourceUrl: picture })
  })

  test('stops queuing once the avatar matches the current image, and re-queues when it changes', async () => {
    const t = convexTest(schema, modules)
    const userId = await t.withIdentity(identity()).mutation(api.users.m.ensureCurrent, {})
    await t.mutation(internal.users.m.setAvatar, { userId, sourceUrl: picture })

    const user = await t.run((ctx) => ctx.db.get(userId))
    expect(user?.avatarR2Key).toBe(`users/${userId}/1010.webp`)
    expect(user?.avatarSyncRequestedAt).toBeUndefined()

    await t.withIdentity(identity()).mutation(api.users.m.ensureCurrent, {})
    expect(await scheduledSyncs(t)).toHaveLength(1)

    const newPicture = 'https://lh3.googleusercontent.com/a/new-photo=s96-c'
    await t.withIdentity(identity(newPicture)).mutation(api.users.m.ensureCurrent, {})
    const jobs = await scheduledSyncs(t)
    expect(jobs).toHaveLength(2)
    expect(jobs[1].args[0]).toEqual({ userId, sourceUrl: newPicture })
  })

  test('retries a sync that never finished after the throttle window', async () => {
    const t = convexTest(schema, modules)
    await t.withIdentity(identity()).mutation(api.users.m.ensureCurrent, {})
    vi.advanceTimersByTime(11 * 60 * 1000)
    await t.withIdentity(identity()).mutation(api.users.m.ensureCurrent, {})

    expect(await scheduledSyncs(t)).toHaveLength(2)
  })
})
