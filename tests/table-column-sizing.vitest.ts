import { expect, test } from 'vitest'
import { createColumnSizingParser, TABLE_QUERY_LIMITS } from '../src/components/ui/table/hyper/parsers'

const parser = createColumnSizingParser()

test('column widths round-trip through a namespaced URL, including encoded IDs and fractional pixels', () => {
  const widths = { 'upload:id,with spaces': 287.5, createdAt: 210 }
  const url = new URL('https://example.test/logs?logs_page=3&logs_q=error')
  url.searchParams.set('logs_widths', parser.serialize(widths))
  expect(parser.parse(new URL(url.href).searchParams.get('logs_widths'))).toEqual(widths)
  expect(url.searchParams.get('logs_page')).toBe('3')
  expect(url.searchParams.get('logs_q')).toBe('error')
})

test('missing and invalid widths fall back to column defaults', () => {
  expect(parser.parse(null)).toEqual({})
  expect(parser.parse('')).toEqual({})
  expect(parser.parse('status:-10,model:NaN,kind:Infinity,empty:,zero:0,bad,valid:340')).toEqual({ valid: 340 })
  expect(parser.parse('__proto__:120,constructor:150,prototype:180,safe:200')).toEqual({ safe: 200 })
})

test('width equality ignores key order and resetting serializes to the empty default', () => {
  expect(parser.eq({ status: 130, model: 220 }, { model: 220, status: 130 })).toBe(true)
  expect(parser.eq({ status: 131 }, { status: 130 })).toBe(false)
  expect(parser.serialize({})).toBe('')
  expect(parser.eq(parser.parse(''), parser.defaultValue)).toBe(true)
})

test('width persistence bounds entry counts and omits invalid outgoing widths', () => {
  const entries = Array.from({ length: 300 }, (_, index) => [`col${index}`, index + 1] as const)
  const serialized = parser.serialize(Object.fromEntries(entries))
  expect(Object.keys(parser.parse(serialized))).toHaveLength(TABLE_QUERY_LIMITS.visibilityEntries)
  expect(parser.serialize({ good: 150, negative: -1, infinity: Infinity, nan: NaN })).toBe('good:150')
})
