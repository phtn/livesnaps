/// <reference types="vite/client" />
import { expect, test } from 'vitest'
import { convexTest } from 'convex-test'
import { api } from '../convex/_generated/api'
import schema from '../convex/schema'
import { DEFAULT_IMAGE_CAPTURE_SETTINGS } from '../src/lib/snaps/snap-settings'
const modules = import.meta.glob('../convex/**/*.ts')

test('global defaults include every field and only gods may update them', async () => {
  const t = convexTest(schema, modules)
  expect(await t.query(api.snapSettings.q.getReport, {})).toEqual({ excludedFields: [], updatedAt: null })
  for (const client of [t, t.withIdentity({ subject: 'admin', admin: true })]) {
    await expect(client.mutation(api.snapSettings.m.updateReportField, { key: 'applicant:email', included: false })).rejects.toThrow()
  }
  await t.withIdentity({ subject: 'god', god: true }).mutation(api.snapSettings.m.updateReportField, { key: 'applicant:email', included: false })
  for (const subject of ['account-a', 'account-b']) {
    expect(await t.withIdentity({ subject }).query(api.snapSettings.q.getReport, {})).toMatchObject({ excludedFields: ['applicant:email'] })
  }
})

test('single-field updates preserve other choices and image settings', async () => {
  const t = convexTest(schema, modules)
  const god = t.withIdentity({ subject: 'god', god: true })
  await god.mutation(api.snapSettings.m.updateReportField, { key: 'applicant:email', included: false })
  await god.mutation(api.snapSettings.m.updateReportField, { key: 'vehicle:year', included: false })
  await god.mutation(api.snapSettings.m.updateReportField, { key: 'applicant:email', included: true })
  expect(await t.query(api.snapSettings.q.getReport, {})).toMatchObject({ excludedFields: ['vehicle:year'] })
  expect(await t.query(api.snapSettings.q.get, {})).toMatchObject(DEFAULT_IMAGE_CAPTURE_SETTINGS)
  await t.withIdentity({ subject: 'admin', admin: true }).mutation(api.snapSettings.m.update, { ...DEFAULT_IMAGE_CAPTURE_SETTINGS, imageQuality: 0.7 })
  expect(await t.query(api.snapSettings.q.getReport, {})).toMatchObject({ excludedFields: ['vehicle:year'] })
  await expect(god.mutation(api.snapSettings.m.updateReportField, { key: 'unknown', included: false })).rejects.toThrow('Unknown report field')
})
