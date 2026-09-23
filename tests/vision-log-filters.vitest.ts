// @vitest-environment happy-dom
import { constructTable } from '@octanejs/tanstack-table'
import { storeReactivityBindings } from '@tanstack/table-core/store-reactivity-bindings'
import { expect, test } from 'vitest'
import { features } from '../src/components/admin/table-config'
import { visionLogColumns } from '../src/components/citadel/vision-log-columns'
import type { VisionLogDocument } from '../convex/vision_logs/d'

const makeTable = () => constructTable({
  features: { ...features, coreReactivityFeature: storeReactivityBindings() },
  columns: visionLogColumns,
  data: [
    { _id: 'a', status: 'success', kind: 'vehicle', provider: 'openai', createdAt: Date.parse('2026-09-22T12:00:00Z') },
    { _id: 'b', status: 'error', kind: 'mileage', provider: 'openai', createdAt: Date.parse('2026-09-23T12:00:00Z') },
    { _id: 'c', status: 'pending', kind: 'vehicle', provider: 'other', createdAt: Date.parse('2026-09-23T12:00:00Z') },
  ] as VisionLogDocument[],
  getRowId: (row) => row._id,
})

test('log filters support multiple scalar values, combined date ranges, and reset', () => {
  const table = makeTable()
  const ids = () => table.getFilteredRowModel().rows.map((row) => row.id)
  table.getColumn('status').setFilterValue(['success', 'error'])
  expect(ids()).toEqual(['a', 'b'])
  table.getColumn('createdAt').setFilterValue(['2026-09-23T00:00:00Z', ''])
  expect(ids()).toEqual(['b'])
  table.getColumn('provider').setFilterValue(['other'])
  expect(ids()).toEqual([])
  table.resetColumnFilters()
  expect(ids()).toEqual(['a', 'b', 'c'])
})

test('log columns expose faceted choices and exclude display-only details', () => {
  const table = makeTable()
  expect(table.getColumn('details').getCanFilter()).toBe(false)
  expect(Array.from(table.getColumn('status').getFacetedUniqueValues().entries())).toEqual([
    ['success', 1], ['error', 1], ['pending', 1],
  ])
  table.getColumn('provider').setFilterValue(['openai'])
  expect(Array.from(table.getColumn('status').getFacetedUniqueValues().entries())).toEqual([
    ['success', 1], ['error', 1],
  ])
})
