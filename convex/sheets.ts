import { ConvexError, v } from 'convex/values'
import { action } from './_generated/server'

const SHEETS_ID_PATTERN = /^[A-Za-z0-9-_]{20,}$/

/** Reads the document title out of a shared sheet's HTML (`Name - Google Sheets`). */
export function extractSheetTitle(html: string): string | null {
  const title = /<title>([^<]*)<\/title>/i.exec(html.slice(0, 200_000))?.[1]?.trim()
  if (!title) return null
  const name = title.replace(/\s+-\s+Google Sheets\s*$/i, '').trim()
  return name || null
}

export const getTitle = action({
  args: { id: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity?.god !== true) throw new ConvexError('Citadel access is required to read sheet titles.')
    const id = args.id.trim()
    if (!SHEETS_ID_PATTERN.test(id)) throw new ConvexError('That is not a valid sheet ID.')
    try {
      const response = await fetch(`https://docs.google.com/spreadsheets/d/${id}/`, {
        signal: AbortSignal.timeout(15_000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LiveSnaps/1.0)' }
      })
      if (!response.ok) return null
      return extractSheetTitle(await response.text())
    } catch {
      return null
    }
  }
})
