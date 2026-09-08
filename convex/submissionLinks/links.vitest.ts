/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { buildSnapObjectKey, SNAP_SLOTS } from '../../src/lib/r2/snap-images'
import { api, internal } from '../_generated/api'
import type { Id } from '../_generated/dataModel'
import schema from '../schema'

const modules = import.meta.glob('/convex/**/*.ts')
const applicant = {
  subject: 'client',
  issuer: 'issuer',
  tokenIdentifier: 'issuer|client',
  name: 'Client',
  email: 'client@example.com'
}
const owner = { subject: 'owner', tokenIdentifier: 'issuer|owner', name: 'Owner', email: 'owner@example.com' }
const viewer = { subject: 'viewer', tokenIdentifier: 'issuer|viewer', name: 'Viewer', email: 'viewer@example.com' }
const outsider = {
  subject: 'outsider',
  tokenIdentifier: 'issuer|outsider',
  name: 'Outsider',
  email: 'outsider@example.com'
}
const god = { subject: 'god', tokenIdentifier: 'issuer|god', name: 'God', god: true, topg: true }
const uid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const location = () => ({
  latitude: 14.6,
  longitude: 121,
  accuracy_meters: 5,
  altitude_meters: null,
  altitude_accuracy_meters: null,
  heading_degrees: null,
  speed_meters_per_second: null,
  captured_at: Date.now()
})
const address = {
  provider: 'mapbox' as const,
  attribution: 'Mapbox',
  mapbox_id: 'place-1',
  feature_type: 'address',
  full_address: 'Makati, Philippines',
  latitude: 14.6,
  longitude: 121,
  country_code: 'PH',
  components: {}
}
const ipinfo = {
  ip: '127.0.0.1',
  asn: 'test',
  as_name: 'test',
  as_domain: 'test',
  country_code: 'PH',
  country: 'Philippines',
  continent_code: 'AS',
  continent: 'Asia'
}
const args = (uploadId: number, accountSlug = 'org-1', linkSlug?: string) => ({
  accountSlug,
  ...(linkSlug === undefined ? {} : { linkSlug }),
  address,
  ipinfo,
  initial_location: location(),
  upload_id: uid(uploadId)
})
const details = { phone: '09123456789', plate_number: 'ABC123', make: 'Toyota', model: 'Corolla', year: 2024 }
const createTest = () => convexTest(schema, modules)
let t: ReturnType<typeof createTest>
let org1: Id<'accounts'>
let org2: Id<'accounts'>
let viewerMember: Id<'accountMembers'>
const day = '2026-09-08'

beforeEach(async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(`${day}T12:00:00.000Z`))
  t = convexTest(schema, modules)
  await t.run(async (ctx) => {
    const createAccount = (slug: string) =>
      ctx.db.insert('accounts', {
        slug,
        name: slug,
        status: 'active',
        plan: 'trial',
        organization: {},
        primaryContact: {
          name: 'Private Contact',
          email: 'private@example.com',
          phone: null,
          title: null,
          tokenIdentifier: null
        },
        billingEmail: 'billing@example.com',
        ownerTokenIdentifier: owner.tokenIdentifier,
        notes: 'Private notes',
        closedAt: null,
        closedBy: null,
        closeReason: null,
        createdAt: Date.now(),
        createdBy: god.tokenIdentifier,
        updatedAt: Date.now(),
        updatedBy: god.tokenIdentifier
      })
    org1 = await createAccount('org-1')
    org2 = await createAccount('org-2')
    for (const [accountId, person, role] of [
      [org1, owner, 'owner'],
      [org1, viewer, 'viewer'],
      [org2, outsider, 'owner']
    ] as const) {
      const id = await ctx.db.insert('accountMembers', {
        accountId,
        email: person.email,
        tokenIdentifier: person.tokenIdentifier,
        userId: null,
        name: person.name,
        title: null,
        role,
        status: 'active',
        invitedAt: 1,
        invitedBy: 'test',
        joinedAt: 1,
        updatedAt: 1,
        updatedBy: 'test'
      })
      if (person === viewer) viewerMember = id
    }
  })
})
afterEach(async () => {
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  vi.useRealTimers()
})
const analytics = () =>
  t.withIdentity(viewer).query(api.submissionLinks.q.analytics, { accountId: org1, fromDay: day, toDay: day })
const createLink = (slug = 'team-a') =>
  t.withIdentity(owner).mutation(api.submissionLinks.m.create, { accountId: org1, slug, label: slug })
const photo = (uploadId: number, slot = 1) => {
  const snapSlot = SNAP_SLOTS[slot - 1]
  return {
    capture_id: uid(100 + slot),
    captured_at: Date.now(),
    content_type: 'image/webp' as const,
    label: snapSlot.label,
    r2_key: buildSnapObjectKey(uid(uploadId), snapSlot.index, uid(100 + slot)),
    size: 100,
    slot
  }
}
const savePhoto = (uploadId: number, slot = 1) =>
  t.withIdentity(applicant).mutation(api.snaps.m.savePhoto, {
    upload_id: uid(uploadId),
    is_retake: false,
    location: location(),
    photo: photo(uploadId, slot)
  })

// Exercise the real functions and transactions, including direct-client calls.
describe('Account submission links and immutable ownership', () => {
  test('resolves existing default routes without leaking Account private data', async () => {
    const result = await t.query(api.submissionLinks.q.resolvePublic, { accountSlug: 'org-1' })
    expect(result).toEqual({
      accountId: org1,
      accountName: 'org-1',
      accountSlug: 'org-1',
      linkSlug: '',
      label: 'Default link',
      available: true
    })
    expect(await t.query(api.submissionLinks.q.resolvePublic, { accountSlug: 'org-1', linkSlug: 'unknown' })).toBeNull()
    expect(await t.query(api.submissionLinks.q.resolvePublic, { accountSlug: 'missing' })).toBeNull()
    expect(await t.query(api.submissionLinks.q.resolvePublic, { accountSlug: 'api' })).toBeNull()
    await t.run((ctx) => ctx.db.patch(org1, { status: 'pending' }))
    expect(await t.query(api.submissionLinks.q.resolvePublic, { accountSlug: 'org-1' })).toMatchObject({
      available: false
    })
  })

  test('binds each new session to its Account and link, with exact UUID retry idempotency', async () => {
    const linkId = await createLink()
    const first = await t.withIdentity(applicant).mutation(api.snaps.m.startSession, args(1, 'org-1', 'team-a'))
    expect(await t.withIdentity(applicant).mutation(api.snaps.m.startSession, args(1, 'org-1', 'team-a'))).toBe(first)
    for (const destination of [args(1), args(1, 'org-2')]) {
      await expect(t.withIdentity(applicant).mutation(api.snaps.m.startSession, destination)).rejects.toThrow(
        /different destination/
      )
    }
    await expect(
      t.withIdentity(outsider).mutation(api.snaps.m.startSession, args(1, 'org-1', 'team-a'))
    ).rejects.toThrow(/different destination/)
    await expect(t.mutation(api.snaps.m.startSession, args(3))).rejects.toThrow(/Sign in/)
    const second = await t.withIdentity(applicant).mutation(api.snaps.m.startSession, args(2, 'org-2'))
    expect(second).not.toBe(first)
    const firstSnap = await t.run((ctx) => ctx.db.get(first))
    expect(firstSnap).toMatchObject({ accountId: org1, submissionLinkId: linkId, metadata: { upload_id: uid(1) } })
    expect(await t.run((ctx) => ctx.db.get(second))).toMatchObject({ accountId: org2 })
    expect((await analytics()).totals.started).toBe(1)
  })

  test('completion counts exactly once and never lets a new capture overwrite the completed snap', async () => {
    const snapId = await t.withIdentity(applicant).mutation(api.snaps.m.startSession, args(1))
    for (const slot of SNAP_SLOTS) await savePhoto(1, slot.index)
    const complete = {
      upload_id: uid(1),
      status: 'completed' as const,
      plate_number: 'ABC123',
      last_location: location()
    }
    await t.withIdentity(applicant).mutation(api.snaps.m.endSession, complete)
    await t.withIdentity(applicant).mutation(api.snaps.m.endSession, complete)
    await expect(
      t.withIdentity(applicant).mutation(api.snaps.m.endSession, { upload_id: uid(1), status: 'cancelled' })
    ).rejects.toThrow(/already ended/)
    await expect(
      t.withIdentity(applicant).mutation(api.snaps.m.updateDetails, { SNAP_id: snapId, details })
    ).rejects.toThrow(/completed/)
    const next = await t.withIdentity(applicant).mutation(api.snaps.m.startSession, args(2))
    expect(next).not.toBe(snapId)
    expect(await t.run((ctx) => ctx.db.get(snapId))).toMatchObject({
      location_session: { status: 'completed' },
      metadata: { upload_id: uid(1) }
    })
    expect((await analytics()).totals).toMatchObject({ started: 2, completed: 1 })
  })

  test('rejects write spoofing by unauthenticated callers, another applicant, or an Account owner', async () => {
    const snapId = await t.withIdentity(applicant).mutation(api.snaps.m.startSession, args(1))
    for (const caller of [t, t.withIdentity(outsider), t.withIdentity(owner)]) {
      await expect(
        caller.mutation(api.snaps.m.savePhoto, {
          upload_id: uid(1),
          is_retake: false,
          location: location(),
          photo: photo(1)
        })
      ).rejects.toThrow()
      await expect(
        caller.mutation(api.snaps.m.endSession, { upload_id: uid(1), status: 'cancelled' })
      ).rejects.toThrow()
      await expect(caller.mutation(api.snaps.m.updateDetails, { SNAP_id: snapId, details })).rejects.toThrow()
    }
    await t.withIdentity(applicant).mutation(api.snaps.m.updateDetails, { SNAP_id: snapId, details })
    await savePhoto(1)
    expect(await t.run((ctx) => ctx.db.get(snapId))).toMatchObject({ accountId: org1, phone: details.phone })
  })

  test('disabled links block new starts while existing captures keep their attribution', async () => {
    const linkId = await createLink()
    const snapId = await t.withIdentity(applicant).mutation(api.snaps.m.startSession, args(1, 'org-1', 'team-a'))
    await t
      .withIdentity(owner)
      .mutation(api.submissionLinks.m.update, { linkId, enabled: false, label: 'Renamed team' })
    expect(
      await t.query(api.submissionLinks.q.resolvePublic, { accountSlug: 'org-1', linkSlug: 'team-a' })
    ).toMatchObject({ available: false, label: 'Renamed team' })
    await expect(
      t.withIdentity(applicant).mutation(api.snaps.m.startSession, args(2, 'org-1', 'team-a'))
    ).rejects.toThrow(/disabled/)
    expect(await t.withIdentity(applicant).mutation(api.snaps.m.startSession, args(1, 'org-1', 'team-a'))).toBe(snapId)
    await savePhoto(1)
    expect(await t.run((ctx) => ctx.db.get(snapId))).toMatchObject({ submissionLinkId: linkId })
    expect((await analytics()).links.find((link) => link.linkId === linkId)).toMatchObject({
      label: 'Renamed team',
      started: 1
    })
  })

  test.each(['pending', 'suspended', 'closed'] as const)(
    'a %s Account blocks submitted writes but permits authenticated cancellation',
    async (status) => {
      const snapId = await t.withIdentity(applicant).mutation(api.snaps.m.startSession, args(1))
      await t.run((ctx) => ctx.db.patch(org1, { status }))
      await expect(t.withIdentity(applicant).mutation(api.snaps.m.startSession, args(2))).rejects.toThrow(
        /not accepting/
      )
      await expect(savePhoto(1)).rejects.toThrow(/not accepting/)
      await expect(
        t.withIdentity(applicant).mutation(api.snaps.m.updateDetails, { SNAP_id: snapId, details })
      ).rejects.toThrow(/not accepting/)
      await expect(
        t.withIdentity(applicant).mutation(api.snaps.m.endSession, { upload_id: uid(1), status: 'completed' })
      ).rejects.toThrow(/not accepting/)
      await t.withIdentity(applicant).mutation(api.snaps.m.endSession, { upload_id: uid(1), status: 'cancelled' })
      expect(await t.run((ctx) => ctx.db.get(snapId))).toMatchObject({ location_session: { status: 'cancelled' } })
    }
  )

  test('counts cancelled, invalidated, and cron abandonment exactly once in the start-day cohort', async () => {
    for (const id of [1, 2, 3]) await t.withIdentity(applicant).mutation(api.snaps.m.startSession, args(id))
    for (const [id, status] of [
      [1, 'cancelled'],
      [2, 'invalidated']
    ] as const) {
      const endArgs = { upload_id: uid(id), status, reason: 'Location moved' }
      await t.withIdentity(applicant).mutation(api.snaps.m.endSession, endArgs)
      await t.withIdentity(applicant).mutation(api.snaps.m.endSession, endArgs)
    }
    vi.setSystemTime(new Date('2026-09-09T01:00:00.000Z'))
    expect(await t.mutation(internal.snaps.m.abandonExpiredSessions, {})).toMatchObject({ abandoned: 1 })
    expect(await t.mutation(internal.snaps.m.abandonExpiredSessions, {})).toMatchObject({ abandoned: 0 })
    expect((await analytics()).totals).toEqual({ started: 3, completed: 0, abandoned: 1, cancelled: 1, invalidated: 1 })
    expect(
      (
        await t
          .withIdentity(viewer)
          .query(api.submissionLinks.q.analytics, { accountId: org1, fromDay: '2026-09-09', toDay: '2026-09-09' })
      ).totals.started
    ).toBe(0)
  })

  test('all active members can read link analytics; other Accounts and gods without membership cannot', async () => {
    await t.withIdentity(applicant).mutation(api.snaps.m.startSession, args(1))
    for (const identity of [owner, viewer]) {
      expect(
        (await t.withIdentity(identity).query(api.submissionLinks.q.list, { accountId: org1 })).links
      ).toHaveLength(1)
      expect(
        (
          await t
            .withIdentity(identity)
            .query(api.submissionLinks.q.analytics, { accountId: org1, fromDay: day, toDay: day })
        ).totals.started
      ).toBe(1)
    }
    for (const caller of [t, t.withIdentity(outsider), t.withIdentity(god), t.withIdentity(applicant)]) {
      await expect(caller.query(api.submissionLinks.q.list, { accountId: org1 })).rejects.toThrow(/Unauthorized/)
      await expect(
        caller.query(api.submissionLinks.q.analytics, { accountId: org1, fromDay: day, toDay: day })
      ).rejects.toThrow(/Unauthorized/)
    }
    await t.run((ctx) => ctx.db.patch(viewerMember, { status: 'suspended' }))
    await expect(analytics()).rejects.toThrow(/Unauthorized/)
  })

  test('only owners/admins manage links, while viewers can safely initialize a default exactly once', async () => {
    const defaultId = await t.withIdentity(viewer).mutation(api.submissionLinks.m.ensureDefault, { accountId: org1 })
    expect(await t.withIdentity(owner).mutation(api.submissionLinks.m.ensureDefault, { accountId: org1 })).toBe(
      defaultId
    )
    await createLink()
    await expect(createLink()).rejects.toThrow(/already has/)
    for (const caller of [t.withIdentity(viewer), t.withIdentity(outsider), t.withIdentity(god)]) {
      await expect(
        caller.mutation(api.submissionLinks.m.create, { accountId: org1, slug: 'team-b', label: 'Team B' })
      ).rejects.toThrow()
      await expect(
        caller.mutation(api.submissionLinks.m.update, { linkId: defaultId, enabled: false })
      ).rejects.toThrow()
    }
    await t.withIdentity(owner).mutation(api.submissionLinks.m.update, { linkId: defaultId, enabled: false })
    await expect(t.withIdentity(applicant).mutation(api.snaps.m.startSession, args(1))).rejects.toThrow(/disabled/)
  })

  test('stores color tags, returns a default for older links, and lets admins update them', async () => {
    const defaultId = await t.withIdentity(owner).mutation(api.submissionLinks.m.ensureDefault, { accountId: org1 })
    const teamId = await t.withIdentity(owner).mutation(api.submissionLinks.m.create, {
      accountId: org1,
      slug: 'team-color',
      label: 'Color team',
      color: 'emerald'
    })
    expect((await t.withIdentity(viewer).query(api.submissionLinks.q.list, { accountId: org1 })).links)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ _id: defaultId, color: 'blue' }),
        expect.objectContaining({ _id: teamId, color: 'emerald' })
      ]))

    await t.withIdentity(owner).mutation(api.submissionLinks.m.update, { linkId: teamId, color: 'violet' })
    expect((await t.withIdentity(viewer).query(api.submissionLinks.q.list, { accountId: org1 })).links)
      .toEqual(expect.arrayContaining([expect.objectContaining({ _id: teamId, color: 'violet' })]))
  })

  test('rejects unsafe link slugs and invalid or excessive analytics windows', async () => {
    for (const slug of ['', '../team', 'team/a', 'team--a', 'a'.repeat(64)]) {
      await expect(createLink(slug)).rejects.toThrow(/slug/)
    }
    for (const [fromDay, toDay] of [
      ['2026-02-30', day],
      ['2026-01-01', day],
      [day, '2026-09-01'],
      ['invalid', day]
    ]) {
      await expect(
        t.withIdentity(owner).query(api.submissionLinks.q.analytics, { accountId: org1, fromDay, toDay })
      ).rejects.toThrow()
    }
  })

  test('account slugs remain permanent and reserved application paths cannot be provisioned', async () => {
    await expect(
      t.withIdentity(outsider).query(api.accounts.q.checkSlugAvailability, { slug: 'open-name' })
    ).rejects.toThrow(/Creating an account requires a god account/)
    expect(await t.withIdentity(god).query(api.accounts.q.checkSlugAvailability, { slug: 'open-name' })).toEqual({
      slug: 'open-name',
      available: true,
      reason: 'available'
    })
    expect(await t.withIdentity(god).query(api.accounts.q.checkSlugAvailability, { slug: 'citadel' })).toEqual({
      slug: 'citadel',
      available: false,
      reason: 'reserved'
    })
    expect(await t.withIdentity(god).query(api.accounts.q.checkSlugAvailability, { slug: 'not--valid' })).toEqual({
      slug: 'not--valid',
      available: false,
      reason: 'invalid'
    })
    expect(await t.withIdentity(god).query(api.accounts.q.checkSlugAvailability, { slug: 'org-1' })).toEqual({
      slug: 'org-1',
      available: false,
      reason: 'taken'
    })
    await expect(
      t.withIdentity(god).mutation(api.accounts.m.update, { id: org1, slug: 'org-renamed' })
    ).rejects.toThrow(/permanent/)
    for (const slug of ['api', 'account', 'citadel', 'snaps', 'legal']) {
      await expect(
        t.withIdentity(god).mutation(api.accounts.m.create, {
          name: 'Reserved',
          slug,
          primaryContact: { name: 'Owner', email: owner.email }
        })
      ).rejects.toThrow(/reserved application path/)
    }
    await t.withIdentity(god).mutation(api.accounts.m.remove, { id: org1 })
    expect(await t.withIdentity(god).query(api.accounts.q.checkSlugAvailability, { slug: 'org-1' })).toEqual({
      slug: 'org-1',
      available: false,
      reason: 'taken'
    })
    await expect(
      t.withIdentity(god).mutation(api.accounts.m.create, {
        name: 'Replacement',
        slug: 'org-1',
        primaryContact: { name: 'Owner', email: owner.email }
      })
    ).rejects.toThrow(/already exists/)
    expect(await t.query(api.submissionLinks.q.resolvePublic, { accountSlug: 'org-1' })).toBeNull()
  })
})
