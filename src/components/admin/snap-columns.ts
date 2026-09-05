import RowActions from '@/components/ui/table/row-actions.btsx'
import { getSnapImageUrl, isSnapObjectKey } from '@/lib/r2/snap-images'
import type { AdminSnapListItem, AdminSnapPhoto } from '@/lib/snaps/admin-photo-types'
import { getSnapPhotoFileName } from '@/lib/snaps/photo-download'
import type { ColumnPinningState } from '@octanejs/tanstack-table'
import { createColumnHelper } from '@octanejs/tanstack-table'
import { createElement } from 'octane'
import StatusBadge from './badges.btsx'
import { snapSessionStatus } from './data'
import { snapsFeatures } from './table-config'

/**
 * Shared table definition for the snaps admin table.
 *
 * Both the live page and the fixture-backed lab page render from this, so any
 * column or cell change shows up in the lab and ships to production unchanged.
 */

export type SnapRow = AdminSnapListItem

export const SNAP_LIST_LIMIT = 250
export const EMPTY_SNAPS: SnapRow[] = []
export const PAGE_SIZES = [50, 100, 200]

export const DEFAULT_COLUMN_VISIBILITY = {
  bestAccuracyMeters: false,
  createdAt: false,
  email: false,
  firebaseUid: false,
  phone: false,
  uploadId: false
}

export const DEFAULT_COLUMN_PINNING: ColumnPinningState = { end: ['actions'], start: [] }

/**
 * Tokens the `countryCodeMatchesIpinfo` accessor emits. The filter list faces
 * against accessor output, so its options must use these exact strings rather
 * than the underlying `boolean | null`.
 */
export const IPC_MATCH_TOKENS = ['match', 'mismatch', 'unknown'] as const

export const toIpcMatchToken = (value: boolean | null) => (value === null ? 'unknown' : value ? 'match' : 'mismatch')

const formatUpdatedAt = (timestamp: number) => new Date(timestamp).toISOString()

const columnHelper = createColumnHelper<typeof snapsFeatures, SnapRow>()

export const snapColumns = columnHelper.columns([
  columnHelper.accessor('plateNumber', {
    header: 'Plate',
    size: 120,
    sortFn: 'text',
    enableColumnFilter: false
  }),
  columnHelper.accessor('fullName', {
    header: 'Applicant',
    size: 276,
    sortFn: 'text',
    enableColumnFilter: false
  }),
  columnHelper.accessor('locationLabel', {
    header: 'Location',
    size: 300,
    sortFn: 'text',
    enableColumnFilter: false
  }),
  columnHelper.accessor((row) => row.photos.length, {
    id: 'photos',
    header: 'Photos',
    size: 120,
    sortFn: 'basic',
    enableColumnFilter: false
  }),
  columnHelper.accessor((row) => toIpcMatchToken(row.countryCodeMatchesIpinfo), {
    id: 'countryCodeMatchesIpinfo',
    header: 'IPCm',
    size: 150,
    sortFn: 'text',
    filterFn: 'arrHas',
    enableColumnFilter: true
  }),
  columnHelper.accessor('make', {
    header: 'Make',
    size: 140,
    sortFn: 'text',
    filterFn: 'arrHas',
    enableColumnFilter: true
  }),
  columnHelper.accessor('model', {
    header: 'Model',
    size: 140,
    sortFn: 'text',
    filterFn: 'arrHas',
    enableColumnFilter: true
  }),
  columnHelper.accessor('email', {
    header: 'Email',
    size: 300,
    sortFn: 'text',
    filterFn: 'includesString',
    enableColumnFilter: true
  }),
  columnHelper.accessor('status', {
    header: 'Status',
    size: 200,
    sortFn: 'text',
    filterFn: 'arrHas',
    enableColumnFilter: true,
    // `flexRender` invokes a `cell` as a component, so this returns a node
    // descriptor rather than markup — this module is plain TypeScript.
    cell: (info) => createElement(StatusBadge, { presentation: snapSessionStatus[info.getValue()] })
  }),
  columnHelper.accessor((row) => row.handler?.name ?? '', {
    id: 'handler',
    header: 'Handler',
    size: 200,
    sortFn: 'text',
    filterFn: 'includesString',
    enableColumnFilter: true
  }),
  columnHelper.accessor((row) => row.verification_status ?? '', {
    id: 'verification_status',
    header: 'Verification',
    size: 200,
    sortFn: 'text',
    filterFn: 'includesString',
    enableColumnFilter: true
  }),
  columnHelper.accessor('updatedAt', {
    header: 'Updated',
    size: 300,
    sortFn: 'basic',
    filterFn: 'inDateRange',
    enableColumnFilter: true,
    enableGlobalFilter: false,
    cell: (info) => formatUpdatedAt(info.getValue())
  }),
  columnHelper.accessor((row) => row.bestAccuracyMeters ?? null, {
    id: 'bestAccuracyMeters',
    header: 'Accuracy',
    size: 160,
    sortFn: 'basic',
    filterFn: 'inNumberRange',
    enableColumnFilter: true,
    cell: (info) => (info.getValue() === null ? '--' : `${info.getValue()} m`)
  }),
  columnHelper.accessor('createdAt', {
    header: 'Created',
    size: 300,
    sortFn: 'basic',
    filterFn: 'inDateRange',
    enableColumnFilter: true,
    enableGlobalFilter: false,
    cell: (info) => formatUpdatedAt(info.getValue())
  }),
  columnHelper.accessor('firebaseUid', { header: 'Firebase UID', size: 260, sortFn: 'text' }),
  columnHelper.accessor('phone', { header: 'Phone', size: 180, sortFn: 'text' }),
  columnHelper.accessor('uploadId', { header: 'Upload ID', size: 260, sortFn: 'text' }),
  columnHelper.display({
    id: 'actions',
    header: '⁞',
    size: 40,
    enableHiding: false,
    enableSorting: false,
    enableGlobalFilter: false,
    enableColumnFilter: false,
    enablePinning: true,
    // `flexRender` invokes a `cell` as a component, so this returns a node
    // descriptor rather than markup — this module is plain TypeScript.
    cell: (info) => createElement(RowActions, { snap: info.row.original })
  })
])

const integrityDescription = (photo: AdminSnapPhoto) => {
  const integrity = photo.capture_integrity

  if (!integrity) return 'not analyzed'

  const label =
    integrity.disposition === 'accepted'
      ? 'no replay detected'
      : integrity.disposition === 'rejected'
        ? 'replay rejected'
        : 'capture needs review'

  return `${label} (${(integrity.confidence * 100).toFixed(0)}%)`
}

// `getSnapImageUrl` throws on a malformed key, so drop those rather than
// failing the whole render.
//
// The return type is inferred rather than annotated as `PhotoViewerPhoto`: the
// ambient `*.btsx` module declaration exposes only a default export, so a named
// type import from a .btsx file does not resolve inside a plain .ts module.
// The inferred shape is checked structurally at each .btsx call site.
export const toViewerPhotos = (photos: readonly AdminSnapPhoto[]) =>
  [...photos]
    .filter((photo) => isSnapObjectKey(photo.r2_key))
    .sort((left, right) => left.slot - right.slot)
    .map((photo, index) => ({
      alt: `${photo.label} snap photo`,
      description: integrityDescription(photo),
      downloadName: getSnapPhotoFileName(photo, index),
      id: photo.r2_key,
      label: photo.label,
      src: getSnapImageUrl(photo.r2_key),
      unoptimized: true
    }))

export const buildSnapGallery = (snap: SnapRow | undefined) =>
  snap && snap.photos.length > 0
    ? {
        photos: snap.photos,
        title: snap.plateNumber ? `Snap photos · ${snap.plateNumber}` : `Snap photos · ${snap.uploadId}`,
        uploadId: snap.uploadId
      }
    : null
