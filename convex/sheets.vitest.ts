/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, expect, test, vi } from 'vitest'
import { api } from './_generated/api'
import schema from './schema'
import { extractSheetTitle } from './sheets'

const modules = import.meta.glob('/convex/**/*.ts')
const god = { subject: 'god', god: true }
afterEach(() => { vi.unstubAllGlobals() })

test('sheet titles reject callers and ids before any fetch', async () => {
  const t = convexTest(schema, modules)
  await expect(t.action(api.sheets.getTitle, { id: 'abcDEF123-_4567890abcDEF123-_4567890abc12' })).rejects.toThrow(
    'Citadel access'
  )
  const authed = t.withIdentity(god)
  await expect(authed.action(api.sheets.getTitle, { id: 'nope' })).rejects.toThrow('valid sheet ID')
})

test('sheet titles resolve from shared html and stay null otherwise', async () => {
  const fetchMock = vi.fn(async (_url: unknown) => new Response('<html><head><title>Crew roster - Google Sheets</title></head></html>', { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  const t = convexTest(schema, modules).withIdentity(god)
  const id = 'abcDEF123-_4567890abcDEF123-_4567890abc12'
  expect(await t.action(api.sheets.getTitle, { id })).toBe('Crew roster')
  expect(fetchMock).toHaveBeenCalledOnce()
  expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`https://docs.google.com/spreadsheets/d/${id}/`)

  vi.stubGlobal('fetch', vi.fn(async () => new Response('Denied', { status: 401 })))
  expect(await t.action(api.sheets.getTitle, { id })).toBeNull()

  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
  expect(await t.action(api.sheets.getTitle, { id })).toBeNull()
})

test('title extraction tolerates odd heads', () => {
  expect(extractSheetTitle('<title>Crew roster - Google Sheets</title>')).toBe('Crew roster')
  expect(extractSheetTitle('<title>  Padded  </title>')).toBe('Padded')
  expect(extractSheetTitle('<title>Google Sheets</title>')).toBe('Google Sheets')
  expect(extractSheetTitle('<title></title>')).toBeNull()
  expect(extractSheetTitle('<p>no head here</p>')).toBeNull()
})
