/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, expect, test, vi } from 'vitest'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import schema from '../convex/schema'
import { buildSnapObjectKey } from '../src/lib/r2/snap-images'

const modules = import.meta.glob('../convex/**/*.ts')
const uploadA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const uploadB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const captureId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const device = { latitude: 1, longitude: 2, accuracy_meters: 3, altitude_meters: null, altitude_accuracy_meters: null, heading_degrees: null, speed_meters_per_second: null, captured_at: 1 }
const address = { provider: 'mapbox' as const, attribution: '', mapbox_id: '', feature_type: '', full_address: 'Private address', latitude: 1, longitude: 2, components: {} }

async function fixture() {
  const t = convexTest(schema, modules)
  const as = (person: string, admin = false, god = false) => t.withIdentity({ subject: person, tokenIdentifier: `issuer|${person}`, admin, god, email: `${person}@example.com`, name: person })
  const ids = await t.run(async ctx => {
    async function account(slug: string) {
      return await ctx.db.insert('accounts', {
        slug, name: slug, status: 'active', plan: 'trial', organization: {},
        primaryContact: { name: 'Owner', email: `${slug}@example.com`, phone: null, title: null, tokenIdentifier: null },
        billingEmail: null, ownerTokenIdentifier: 'test', notes: null, closedAt: null, closedBy: null, closeReason: null,
        createdAt: 1, createdBy: 'god', updatedAt: 1, updatedBy: 'god'
      })
    }
    const accountA = await account('org-a')
    const accountB = await account('org-b')
    async function member(accountId: Id<'accounts'>, person: string, role: 'admin' | 'member' | 'viewer') {
      return await ctx.db.insert('accountMembers', {
        accountId, email: `${person}@example.com`, tokenIdentifier: `issuer|${person}`, userId: null,
        name: person, title: null, role, status: 'active', invitedAt: 1, invitedBy: 'test',
        joinedAt: 1, updatedAt: 1, updatedBy: 'test'
      })
    }
    const adminA = await member(accountA, 'admin-a', 'admin')
    const memberA = await member(accountA, 'member-a', 'member')
    const viewerA = await member(accountA, 'viewer-a', 'viewer')
    await member(accountB, 'admin-b', 'admin')
    async function snap(accountId: Id<'accounts'> | undefined, upload_id: string, status: 'active' | 'completed') {
      return await ctx.db.insert('snaps', {
        ...(accountId ? { accountId } : {}), full_name: accountId === accountA ? 'Name at A' : 'Name at B',
        email: accountId === accountA ? 'a-private@example.com' : 'b-private@example.com',
        plate_number: 'ABC123', make: 'Private Make', model: 'Private Model', mileage: 100,
        metadata: { applicant_token_identifier: 'issuer|client', photos: [{ slot: 1, label: 'front', captured_at: 1, content_type: 'image/webp', r2_key: buildSnapObjectKey(upload_id, 1, captureId), size: 123 }], storage_prefix: 'snaps/', upload_id },
        location_session: { address, best_accuracy_meters: 3, country_code_matches_ipinfo: true, initial: device, latest: device, started_at: 1, status }, updated_at: 1
      })
    }
    const snapA = await snap(accountA, uploadA, 'completed')
    const snapB = await snap(accountB, uploadB, 'active')
    const legacy = await snap(undefined, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'completed')
    async function entry(accountId: Id<'accounts'> | undefined, uploadId: string) {
      return await ctx.db.insert('verificationEntries', {
        ...(accountId ? { accountId } : {}), applicant: 'Applicant', createdAt: 1, emailFromAddress: 'sender@example.com',
        emailToAddress: 'recipient@example.com', plateNumber: 'ABC123', senderName: 'sender',
        senderTokenIdentifier: 'issuer|sender', senderUid: 'sender', status: 'draft', updatedAt: 1, uploadId
      })
    }
    const entryA = await entry(accountA, uploadA)
    const entryB = await entry(accountB, uploadB)
    await entry(undefined, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd')
    return { accountA, accountB, adminA, memberA, viewerA, snapA, snapB, legacy, entryA, entryB }
  })
  return { t, as, ...ids }
}

test('Account members see all own submissions; claims never bypass tenant or legacy boundaries', async () => {
  const { as, accountA, accountB, snapA, snapB, legacy } = await fixture()
  for (const role of ['admin-a', 'member-a', 'viewer-a']) {
    for (const admin of [false, true]) {
      const user = as(role, admin)
      expect((await user.query(api.snaps.q.listForAdmin, { accountId: accountA })).map(row => row._id)).toEqual([snapA])
      expect((await user.query(api.snaps.q.getForAdmin, { snapId: snapA }))?._id).toBe(snapA)
      expect((await user.query(api.snaps.q.listForAccountPage, { accountId: accountA, paginationOpts: { cursor: null, numItems: 10 } })).page.map(row => row._id)).toEqual([snapA])
      await expect(user.query(api.snaps.q.listForAdmin, { accountId: accountB })).rejects.toThrow('Unauthorized')
      await expect(user.query(api.snaps.q.getForAdmin, { snapId: snapB })).rejects.toThrow('Unauthorized')
      await expect(user.query(api.snaps.q.getForAdminByRouteId, { snapId: legacy })).rejects.toThrow('Unauthorized')
    }
  }
  for (const user of [as('outsider', true), as('god', true, true)]) {
    await expect(user.query(api.snaps.q.getForAdmin, { snapId: snapA })).rejects.toThrow('Unauthorized')
    await expect(user.query(api.snaps.q.listForAdmin, { accountId: accountA })).rejects.toThrow('Unauthorized')
  }
})

test('raw object keys, route IDs and applicant histories stay inside the owning Account', async () => {
  const { as, snapA, snapB } = await fixture()
  const user = as('viewer-a')
  const keyA = buildSnapObjectKey(uploadA, 1, captureId)
  const keyB = buildSnapObjectKey(uploadB, 1, captureId)
  expect(await user.query(api.snaps.q.getAuthorizedPhotoObjectKey, { objectKey: keyA })).toBe(keyA)
  expect(await user.query(api.snaps.q.getForAccountPhotoObjectKey, { snapId: snapA, slot: 1 })).toBe(keyA)
  await expect(user.query(api.snaps.q.getAuthorizedPhotoObjectKey, { objectKey: keyB })).rejects.toThrow('Unauthorized')
  await expect(user.query(api.snaps.q.getForAccountPhotoObjectKey, { snapId: snapB, slot: 1 })).rejects.toThrow('Unauthorized')
  const profile = await user.query(api.snaps.q.getApplicantProfileForAdminBySnapId, { snapId: snapA })
  expect(profile?.snaps.map(row => row._id)).toEqual([snapA])
  expect(profile?.knownEmails).toEqual(['a-private@example.com'])
  expect(profile?.knownNames).toEqual(['Name at A'])
  await expect(user.query(api.snaps.q.getApplicantProfileForAdminBySnapId, { snapId: snapB })).rejects.toThrow('Unauthorized')
})

test('clients can access only their open capture and a redacted receipt after submission', async () => {
  const { t, as, snapA, snapB } = await fixture()
  const client = as('client')
  const draft = await client.query(api.snaps.q.getByUploadId, { upload_id: uploadB })
  expect(draft).toEqual({ plate_number: 'ABC123', make: 'Private Make', model: 'Private Model', mileage: 100 })
  expect((await client.query(api.snaps.q.getCaptureAnalysisState, { upload_id: uploadB })).vehicle.make).toBe('Private Make')
  expect(await client.query(api.snaps.q.getMinePhotoObjectKey, { proofId: snapB, slot: 1 })).toBe(buildSnapObjectKey(uploadB, 1, captureId))
  const receipt = await client.query(api.snaps.q.getMineByRouteId, { snapId: snapA })
  expect(receipt).toMatchObject({ status: 'completed', address: '', photos: [], make: '', model: '', plateNumber: '', mileage: null })
  expect((await client.query(api.snaps.q.listMine, {}))).toHaveLength(2)
  await expect(client.query(api.snaps.q.getMinePhotoObjectKey, { proofId: snapA, slot: 1 })).rejects.toThrow('Unauthorized')
  await expect(client.query(api.snaps.q.getByUploadId, { upload_id: uploadA })).rejects.toThrow('Unauthorized')
  await expect(as('admin-a', true).query(api.snaps.q.getByUploadId, { upload_id: uploadB })).rejects.toThrow('Unauthorized')
  await expect(t.query(api.snaps.q.getCaptureAnalysisState, { upload_id: uploadB })).rejects.toThrow('Unauthorized')
})

test('revoked membership, suspended Account and ambiguous workspace selection fail immediately', async () => {
  const { t, as, accountA, accountB, memberA, snapA } = await fixture()
  await t.run(async ctx => {
    const member = await ctx.db.get('accountMembers', memberA)
    if (!member) throw new Error('Missing fixture')
    const { _id, _creationTime, ...fields } = member
    await ctx.db.insert('accountMembers', { ...fields, accountId: accountB })
  })
  await expect(as('member-a').query(api.snaps.q.listForAdmin, {})).rejects.toThrow('Select an Account')
  expect(await as('member-a').query(api.snaps.q.listForAdmin, { accountId: accountA })).toHaveLength(1)
  await t.run(ctx => ctx.db.patch(memberA, { status: 'suspended' }))
  await expect(as('member-a', true).query(api.snaps.q.getForAdmin, { snapId: snapA })).rejects.toThrow('Unauthorized')
  await t.run(ctx => ctx.db.patch(accountA, { status: 'suspended' }))
  await expect(as('admin-a', true).query(api.snaps.q.listForAdmin, { accountId: accountA })).rejects.toThrow('Unauthorized')
})

test('verification reads are shared, but cross-account sends, attachments and handler writes are denied', async () => {
  const { t, as, accountA, entryA, entryB, adminA } = await fixture()
  const viewer = as('viewer-a')
  expect((await viewer.query(api.verificationEntries.q.listAllForAdmin, { accountId: accountA })).map(row => row._id)).toEqual([entryA])
  expect((await viewer.query(api.verificationEntries.q.listForAdmin, { accountId: accountA })).map(row => row._id)).toEqual([entryA])
  expect((await viewer.query(api.verificationEntries.q.listForAccountPage, { accountId: accountA, paginationOpts: { cursor: null, numItems: 10 } })).page.map(row => row._id)).toEqual([entryA])
  await expect(viewer.mutation(api.verificationEntries.m.updateAttachments, { id: entryA, attachments: ['report'] })).rejects.toThrow('Unauthorized')
  const writer = as('member-a', true)
  expect((await writer.mutation(api.verificationEntries.m.updateAttachments, { id: entryA, attachments: ['report'] })).attachments).toEqual(['report'])
  await expect(writer.mutation(api.verificationEntries.m.updateAttachments, { id: entryB, attachments: ['report'] })).rejects.toThrow('Unauthorized')
  await expect(writer.mutation(api.verificationEntries.m.generateAttachmentUploadUrl, { id: entryB })).rejects.toThrow('Unauthorized')
  await expect(writer.action(api.verificationEntries.m.sendEmail, { id: entryB })).rejects.toThrow('Unauthorized')
  await expect(as('admin-a', true).mutation(api.snaps.handlers.setHandler, { uploadId: uploadB, memberId: adminA })).rejects.toThrow('Unauthorized')
  await t.run(ctx => ctx.db.patch(entryA, { accountId: undefined }))
  expect(await viewer.query(api.verificationEntries.q.listAllForAdmin, { accountId: accountA })).toEqual([])
  await expect(writer.mutation(api.verificationEntries.m.updateAttachments, { id: entryA, attachments: ['report'] })).rejects.toThrow('Unauthorized')
})

test('admin claims cannot grant membership in another Account or escalate a viewer', async () => {
  const { as, accountA, accountB } = await fixture()
  await expect(as('viewer-a', true).mutation(api.accountMembers.m.invite, { accountId: accountA, email: 'new@example.com' })).rejects.toThrow('Unauthorized')
  await expect(as('admin-a', true).mutation(api.accountMembers.m.invite, { accountId: accountB, email: 'new@example.com' })).rejects.toThrow('Unauthorized')
})


afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

const uploadPath = (url: string) => { const parsed = new URL(url); return parsed.pathname + parsed.search }

test('attachment upload URLs bind stored bytes to one entry and reject foreign storage IDs and replay', async () => {
  vi.useFakeTimers()
  vi.stubEnv('CONVEX_SITE_URL', 'https://test.convex.site')
  const { t, as, entryA, entryB } = await fixture()
  const writer = as('member-a')
  const uploadUrl = await writer.mutation(api.verificationEntries.m.generateAttachmentUploadUrl, { id: entryA })
  const stored = await t.fetch(uploadPath(uploadUrl), { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'Private file' })
  expect(stored.status).toBe(200)
  const { storageId } = await stored.json() as { storageId: Id<'_storage'> }
  expect((await t.fetch(uploadPath(uploadUrl), { method: 'POST', body: 'again' })).status).toBe(403)
  await expect(as('admin-b').mutation(api.verificationEntries.m.attachUpload, { id: entryB, storageId, name: 'hijack', size: 12 })).rejects.toThrow('does not belong')
  const unknownStorageId = await t.run(ctx => ctx.storage.store(new Blob(['unknown'])))
  await expect(writer.mutation(api.verificationEntries.m.attachUpload, { id: entryA, storageId: unknownStorageId, name: 'foreign', size: 7 })).rejects.toThrow('does not belong')
  await expect(writer.mutation(api.verificationEntries.m.attachUpload, { id: entryA, storageId, name: 'bad size', size: 1 })).rejects.toThrow('size does not match')
  const attached = await writer.mutation(api.verificationEntries.m.attachUpload, { id: entryA, storageId, name: 'mine.txt', contentType: 'forged/type', size: 12 })
  expect(attached.uploads).toMatchObject([{ storageId, size: 12, contentType: 'text/plain' }])
  await expect(writer.mutation(api.verificationEntries.m.attachUpload, { id: entryA, storageId, name: 'again', size: 12 })).rejects.toThrow('does not belong')
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  expect(await t.run(ctx => ctx.db.system.get('_storage', storageId))).not.toBeNull()
  await writer.mutation(api.verificationEntries.m.removeUpload, { id: entryA, storageId })
  expect(await t.run(ctx => ctx.db.system.get('_storage', storageId))).toBeNull()
})

test('upload capabilities expire, revoke with membership, validate bytes, and clean up abandoned files', async () => {
  vi.useFakeTimers()
  vi.stubEnv('CONVEX_SITE_URL', 'https://test.convex.site')
  const { t, as, entryA, memberA } = await fixture()
  const writer = as('member-a')
  const abandonedUrl = await writer.mutation(api.verificationEntries.m.generateAttachmentUploadUrl, { id: entryA })
  const abandonedResponse = await t.fetch(uploadPath(abandonedUrl), { method: 'POST', body: 'abandoned' })
  expect(abandonedResponse.status).toBe(200)
  const { storageId } = await abandonedResponse.json() as { storageId: Id<'_storage'> }
  const emptyUrl = await writer.mutation(api.verificationEntries.m.generateAttachmentUploadUrl, { id: entryA })
  expect((await t.fetch(uploadPath(emptyUrl), { method: 'POST', body: '' })).status).toBe(400)
  const oversizedUrl = await writer.mutation(api.verificationEntries.m.generateAttachmentUploadUrl, { id: entryA })
  expect((await t.fetch(uploadPath(oversizedUrl), { method: 'POST', body: new Uint8Array(10 * 1024 * 1024 + 1) })).status).toBe(413)
  const revokedUrl = await writer.mutation(api.verificationEntries.m.generateAttachmentUploadUrl, { id: entryA })
  await t.run(ctx => ctx.db.patch(memberA, { status: 'suspended' }))
  expect((await t.fetch(uploadPath(revokedUrl), { method: 'POST', body: 'revoked' })).status).toBe(403)
  await t.run(ctx => ctx.db.patch(memberA, { status: 'active' }))
  const expiresUrl = await writer.mutation(api.verificationEntries.m.generateAttachmentUploadUrl, { id: entryA })
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  expect((await t.fetch(uploadPath(expiresUrl), { method: 'POST', body: 'expired' })).status).toBe(403)
  expect(await t.run(ctx => ctx.db.system.get('_storage', storageId))).toBeNull()
  await expect(writer.mutation(api.verificationEntries.m.attachUpload, { id: entryA, storageId, name: 'late', size: 9 })).rejects.toThrow('does not belong')
})
