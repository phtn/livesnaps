import { defineApp } from 'convex/server'
import { v } from 'convex/values'

export default defineApp({
  env: {
    RESEND_WEBHOOK_SECRET: v.string(),
    RESEND_API_KEY: v.optional(v.string()),
    RESEND: v.optional(v.string())
  }
})
