import { v } from 'convex/values'

export const adminSchema = v.object({
  identifier: v.string(),
  value: v.object({
    type: v.string(),
    data: v.object({ key: v.string(), value: v.string() }),
    updatedAt: v.number()
  })
})

export type Admin = typeof adminSchema.type
