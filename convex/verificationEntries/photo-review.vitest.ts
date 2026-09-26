/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import { api, internal } from '../_generated/api'
import schema from '../schema'
import { buildSnapObjectKey, SNAP_SLOTS } from '../../src/lib/r2/snap-images'
import { photoReviewSnapshot } from '../../src/lib/verifications/photo-review'

const modules = import.meta.glob('/convex/**/*.ts')
const uploadId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const captureId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const device = { latitude: 1, longitude: 2, accuracy_meters: 3, altitude_meters: null, altitude_accuracy_meters: null, heading_degrees: null, speed_meters_per_second: null, captured_at: 1 }
const address = { provider: 'mapbox' as const, attribution: '', mapbox_id: '', feature_type: '', full_address: 'Capture address', latitude: 1, longitude: 2, components: {} }

async function fixture() {
  const t = convexTest(schema, modules)
  const ids = await t.run(async ctx => {
    const accountId = await ctx.db.insert('accounts', {
      slug: 'reviews', name: 'Reviews', status: 'active', plan: 'trial', organization: {},
      primaryContact: { name: 'Owner', email: 'owner@example.com', phone: null, title: null, tokenIdentifier: null },
      billingEmail: null, ownerTokenIdentifier: 'test', notes: null, closedAt: null, closedBy: null, closeReason: null,
      createdAt: 1, createdBy: 'test', updatedAt: 1, updatedBy: 'test'
    })
    const memberIds = []
    for (const role of ['member', 'viewer'] as const) {
      memberIds.push(await ctx.db.insert('accountMembers', {
        accountId, email: `${role}@example.com`, tokenIdentifier: `issuer|${role}`, userId: null,
        name: role, title: null, role, status: 'active', invitedAt: 1, invitedBy: 'test',
        joinedAt: 1, updatedAt: 1, updatedBy: 'test'
      }))
    }
    const photos = SNAP_SLOTS.map(slot => ({ slot: slot.index, label: slot.label, captured_at: 1, content_type: 'image/webp' as const, r2_key: buildSnapObjectKey(uploadId, slot.index, captureId), size: 123, location: device }))
    const snapId = await ctx.db.insert('snaps', {
      accountId, metadata: { photos, storage_prefix: 'snaps/', upload_id: uploadId }, updated_at: 1,
      verification_status: 'draft',
      location_session: { address, best_accuracy_meters: 3, country_code_matches_ipinfo: true, initial: device, latest: device, started_at: 1, status: 'completed' }
    })
    const entryId = await ctx.db.insert('verificationEntries', {
      accountId, applicant: 'Applicant', createdAt: 1, emailFromAddress: 'member@example.com', emailToAddress: 'recipient@example.com',
      plateNumber: 'ABC123', senderName: 'member', senderTokenIdentifier: 'issuer|member', senderUid: 'member', status: 'draft', updatedAt: 1, uploadId
    })
    return { snapId, entryId, photos, memberId: memberIds[0] }
  })
  const member = t.withIdentity({ subject: 'member', tokenIdentifier: 'issuer|member' })
  const input = { id: ids.entryId, expectedRevision: 0, snapshot: photoReviewSnapshot(ids.photos), decisions: ids.photos.map(photo => ({ photoKey: photo.r2_key, status: 'verified' as const })) }
  return { t, member, input, ...ids }
}

test('read/discard is read-only; partial progress resumes and skipped photos stay Active', async () => {
  const { t, member, entryId, input, photos } = await fixture()
  await member.query(api.verificationEntries.q.getPhotoReview, { id: entryId })
  expect((await t.run(ctx => ctx.db.get(entryId)))?.status).toBe('draft')
  const decisions = [{ photoKey: photos[0].r2_key, status: 'verified' as const }, { photoKey: photos[1].r2_key, status: 'skipped' as const }]
  const saved = await member.mutation(api.verificationEntries.m.savePhotoReview, { ...input, decisions, currentPhotoKey: photos[2].r2_key })
  expect(saved.status).toBe('active')
  expect(saved.photoReview?.completedAt).toBeUndefined()
  const loaded = await member.query(api.verificationEntries.q.getPhotoReview, { id: entryId })
  expect(loaded.entry.photoReview).toMatchObject({ revision: 1, currentPhotoKey: photos[2].r2_key, decisions: decisions.map(item => ({ ...item, reviewedBy: 'issuer|member' })) })
  expect(loaded.snap.verification_status).toBe('draft')
})

test('only every photo verified completes the entry and snap together', async () => {
  const { member, input, entryId } = await fixture()
  const saved = await member.mutation(api.verificationEntries.m.savePhotoReview, input)
  expect(saved).toMatchObject({ status: 'verified', photoReview: { revision: 1, completedAt: expect.any(Number) } })
  expect((await member.query(api.verificationEntries.q.getPhotoReview, { id: entryId })).snap.verification_status).toBe('verified')
})

test('finishing every step with a skipped photo still leaves the entry Active', async () => {
  const { member, input } = await fixture()
  const saved = await member.mutation(api.verificationEntries.m.savePhotoReview, {
    ...input,
    decisions: input.decisions.map((decision, index) => ({ ...decision, status: index === 0 ? 'skipped' as const : 'verified' as const }))
  })
  expect(saved.status).toBe('active')
  expect(saved.photoReview?.completedAt).toBeUndefined()
})

test('viewers, outsiders, and unauthenticated users cannot read review evidence or save', async () => {
  const { t, input, entryId } = await fixture()
  for (const client of [t, t.withIdentity({ subject: 'viewer', tokenIdentifier: 'issuer|viewer' }), t.withIdentity({ subject: 'outsider', tokenIdentifier: 'issuer|outsider', admin: true })]) {
    await expect(client.query(api.verificationEntries.q.getPhotoReview, { id: entryId })).rejects.toThrow('Unauthorized')
    await expect(client.mutation(api.verificationEntries.m.savePhotoReview, input)).rejects.toThrow('Unauthorized')
  }
})

test('revoked membership cannot save a previously opened review', async () => {
  const { t, member, memberId, input, entryId } = await fixture()
  await member.query(api.verificationEntries.q.getPhotoReview, { id: entryId })
  await t.run(ctx => ctx.db.patch(memberId, { status: 'suspended' }))
  await expect(member.mutation(api.verificationEntries.m.savePhotoReview, input)).rejects.toThrow('Unauthorized')
})

test('stale revisions and changed capture evidence cannot overwrite progress', async () => {
  const { t, member, input, snapId, photos } = await fixture()
  await member.mutation(api.verificationEntries.m.savePhotoReview, { ...input, decisions: input.decisions.slice(0, 1) })
  await expect(member.mutation(api.verificationEntries.m.savePhotoReview, input)).rejects.toThrow('Another verifier')
  await t.run(async ctx => {
    const snap = (await ctx.db.get(snapId))!
    await ctx.db.patch(snapId, { metadata: { ...snap.metadata, photos: photos.map(photo => ({ ...photo, captured_at: 2 })) } })
  })
  await expect(member.mutation(api.verificationEntries.m.savePhotoReview, { ...input, expectedRevision: 1 })).rejects.toThrow('Capture details changed')
})

test('rejects duplicate or foreign photos, invalid cursor and oversized decisions', async () => {
  const { member, input } = await fixture()
  await expect(member.mutation(api.verificationEntries.m.savePhotoReview, { ...input, decisions: [input.decisions[0], input.decisions[0]] })).rejects.toThrow('unique photos')
  await expect(member.mutation(api.verificationEntries.m.savePhotoReview, { ...input, decisions: [{ photoKey: 'foreign-photo', status: 'verified' }] })).rejects.toThrow('unique photos')
  await expect(member.mutation(api.verificationEntries.m.savePhotoReview, { ...input, currentPhotoKey: 'foreign-photo' })).rejects.toThrow('unique photos')
  await expect(member.mutation(api.verificationEntries.m.savePhotoReview, { ...input, decisions: [...input.decisions, input.decisions[0]] })).rejects.toThrow('unique photos')
})

test('empty captures cannot be marked Verified and sent/cancelled entries cannot be overwritten', async () => {
  const { t, member, input, snapId, entryId } = await fixture()
  for (const status of ['submitted', 'cancelled'] as const) {
    await t.run(ctx => ctx.db.patch(entryId, { status }))
    await expect(member.mutation(api.verificationEntries.m.savePhotoReview, input)).rejects.toThrow('no longer')
  }
  await t.run(async ctx => {
    await ctx.db.patch(entryId, { status: 'draft' })
    const snap = (await ctx.db.get(snapId))!
    await ctx.db.patch(snapId, { metadata: { ...snap.metadata, photos: [] } })
  })
  await expect(member.mutation(api.verificationEntries.m.savePhotoReview, { ...input, snapshot: '[]', decisions: [] })).rejects.toThrow('valid set of photos')
})

test('verification results list only currently verified photos, and viewers may read them', async () => {
  const { t, member, input, entryId, photos, snapId } = await fixture()
  const decisions = [{ photoKey: photos[2].r2_key, status: 'verified' as const }, { photoKey: photos[0].r2_key, status: 'verified' as const }, { photoKey: photos[1].r2_key, status: 'skipped' as const }]
  await member.mutation(api.verificationEntries.m.savePhotoReview, { ...input, decisions })
  const [row] = await member.query(api.verificationEntries.q.listAllForAdmin, {})
  expect(row.verifiedPhotos.map(photo => photo.slot)).toEqual([photos[0].slot, photos[2].slot])

  const viewer = t.withIdentity({ subject: 'viewer', tokenIdentifier: 'issuer|viewer' })
  expect(await viewer.query(internal.verificationEntries.q.getVerifiedPhotoInternal, { id: entryId, photoKey: photos[0].r2_key })).not.toBeNull()
  expect(await viewer.query(internal.verificationEntries.q.getVerifiedPhotoInternal, { id: entryId, photoKey: photos[1].r2_key })).toBeNull()

  // A changed capture invalidates earlier decisions rather than stamping unreviewed evidence.
  await t.run(async ctx => {
    const snap = (await ctx.db.get(snapId))!
    await ctx.db.patch(snapId, { metadata: { ...snap.metadata, photos: snap.metadata.photos.map(photo => ({ ...photo, size: photo.size + 1 })) } })
  })
  expect((await member.query(api.verificationEntries.q.listAllForAdmin, {}))[0].verifiedPhotos).toEqual([])
  expect(await viewer.query(internal.verificationEntries.q.getVerifiedPhotoInternal, { id: entryId, photoKey: photos[0].r2_key })).toBeNull()
})
