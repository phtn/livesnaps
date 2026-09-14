/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import { api } from '../convex/_generated/api'
import schema from '../convex/schema'
import { buildSnapObjectKey } from '../src/lib/r2/snap-images'

const modules = import.meta.glob('../convex/**/*.ts')
const uploadId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const frontCaptureId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const backCaptureId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const device = {
  accuracy_meters: 3,
  altitude_accuracy_meters: null,
  altitude_meters: null,
  captured_at: 1,
  heading_degrees: null,
  latitude: 1,
  longitude: 2,
  speed_meters_per_second: null
}
const address = {
  attribution: '',
  components: {},
  feature_type: '',
  full_address: 'Test address',
  latitude: 1,
  longitude: 2,
  mapbox_id: '',
  provider: 'mapbox' as const
}

const fixture = async () => {
  const t = convexTest(schema, modules)
  const owner = t.withIdentity({ subject: 'owner', tokenIdentifier: 'issuer|owner' })
  const snapId = await t.run(async (ctx) => {
    const accountId = await ctx.db.insert('accounts', {
      billingEmail: null,
      closeReason: null,
      closedAt: null,
      closedBy: null,
      createdAt: 1,
      createdBy: 'test',
      name: 'Test account',
      notes: null,
      organization: {},
      ownerTokenIdentifier: 'issuer|owner',
      plan: 'trial',
      primaryContact: { email: 'owner@example.com', name: 'Owner', phone: null, title: null, tokenIdentifier: null },
      slug: 'test-account',
      status: 'active',
      updatedAt: 1,
      updatedBy: 'test'
    })

    return await ctx.db.insert('snaps', {
      accountId,
      email: 'owner@example.com',
      firebase_uid: 'owner',
      full_name: 'Owner',
      location_session: {
        address,
        best_accuracy_meters: 3,
        country_code_matches_ipinfo: true,
        initial: device,
        latest: device,
        started_at: 1,
        status: 'active'
      },
      metadata: {
        applicant_token_identifier: 'issuer|owner',
        photos: [
          {
            capture_id: frontCaptureId,
            captured_at: 1,
            content_type: 'image/webp',
            label: 'front',
            r2_key: buildSnapObjectKey(uploadId, 1, frontCaptureId),
            size: 100,
            slot: 1
          },
          {
            capture_id: backCaptureId,
            captured_at: 2,
            content_type: 'image/webp',
            label: 'back',
            r2_key: buildSnapObjectKey(uploadId, 2, backCaptureId),
            size: 100,
            slot: 2
          }
        ],
        storage_prefix: 'snaps/',
        upload_id: uploadId
      },
      updated_at: 1
    })
  })

  return { owner, snapId, t }
}

test('vehicle Vision claims front first and uses back only after front has no plate', async () => {
  const { owner, snapId, t } = await fixture()
  const config = { model: 'vision-test-model', provider: 'cohere', upload_id: uploadId }

  const frontJob = await owner.mutation(api.vision_logs.m.claimCaptureVehicleVision, config)
  expect(frontJob).toMatchObject({ capture_id: frontCaptureId, slot: 1 })
  if (!frontJob) throw new Error('Expected the front Vision job to be claimed.')
  expect(await owner.mutation(api.vision_logs.m.claimCaptureVehicleVision, config)).toBeNull()

  await owner.mutation(api.vision_logs.m.completeCaptureVehicleVision, {
    log_id: frontJob.log_id,
    status: 'completed',
    vehicle: { make: 'Toyota', model: 'Corolla', plate_number: '' }
  })

  const backJob = await owner.mutation(api.vision_logs.m.claimCaptureVehicleVision, config)
  expect(backJob).toMatchObject({ capture_id: backCaptureId, slot: 2 })
  if (!backJob) throw new Error('Expected the back Vision job to be claimed.')

  await owner.mutation(api.vision_logs.m.completeCaptureVehicleVision, {
    log_id: backJob.log_id,
    status: 'completed',
    vehicle: { make: 'Different make', model: 'Different model', plate_number: 'abc 1234' }
  })

  expect(await owner.mutation(api.vision_logs.m.claimCaptureVehicleVision, config)).toBeNull()
  expect(await t.run((ctx) => ctx.db.get('snaps', snapId))).toMatchObject({
    make: 'Toyota',
    model: 'Corolla',
    plate_number: 'ABC 1234'
  })
})

test('a plate from the front ends vehicle Vision without reading the back', async () => {
  const { owner, t } = await fixture()
  const config = { model: 'vision-test-model', provider: 'meta', upload_id: uploadId }
  const frontJob = await owner.mutation(api.vision_logs.m.claimCaptureVehicleVision, config)
  if (!frontJob) throw new Error('Expected the front Vision job to be claimed.')

  await owner.mutation(api.vision_logs.m.completeCaptureVehicleVision, {
    log_id: frontJob.log_id,
    status: 'completed',
    vehicle: { make: 'Toyota', model: 'Raize', plate_number: 'NJE 2990' }
  })

  expect(await owner.mutation(api.vision_logs.m.claimCaptureVehicleVision, config)).toBeNull()
  const logs = await t.run((ctx) =>
    ctx.db
      .query('vision_logs')
      .withIndex('by_upload_id', (query) => query.eq('upload_id', uploadId))
      .take(10)
  )
  expect(logs.map((log) => log.slot)).toEqual([1])
})

test('another user cannot claim a capture Vision job', async () => {
  const { t } = await fixture()
  const outsider = t.withIdentity({ subject: 'outsider', tokenIdentifier: 'issuer|outsider' })

  await expect(
    outsider.mutation(api.vision_logs.m.claimCaptureVehicleVision, {
      model: 'vision-test-model',
      provider: 'cohere',
      upload_id: uploadId
    })
  ).rejects.toThrow('Unauthorized')
})
