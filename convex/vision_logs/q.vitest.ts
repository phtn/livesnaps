/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import { api } from '../_generated/api'
import schema from '../schema'

const modules = import.meta.glob('/convex/**/*.ts')

test('vision logs require god access, including for admin users', async () => {
  const t = convexTest(schema, modules)
  await expect(t.query(api.vision_logs.q.listForGod, {})).rejects.toThrow()
  await expect(t.withIdentity({ subject: 'admin', admin: true }).query(api.vision_logs.q.listForGod, {})).rejects.toThrow()
  await expect(t.withIdentity({ subject: 'god', god: true }).query(api.vision_logs.q.listForGod, {})).resolves.toEqual([])
})

test('returns only the latest 250 vision logs in createdAt order', async () => {
  const t = convexTest(schema, modules)
  await t.run(async (ctx) => {
    for (let createdAt = 251; createdAt >= 1; createdAt--) {
      await ctx.db.insert('vision_logs', {
        upload_id: `upload-${createdAt}`, slot: 0, kind: 'vehicle', status: 'completed',
        provider: 'openai', model: 'test', r2_key: 'test/photo.jpg', createdAt,
      })
    }
  })
  const logs = await t.withIdentity({ subject: 'god', god: true }).query(api.vision_logs.q.listForGod, {})
  expect(logs).toHaveLength(250)
  expect(logs.map((log) => log.createdAt)).toEqual(Array.from({ length: 250 }, (_, i) => 251 - i))
})
