import type { ColumnPinningState } from '@octanejs/tanstack-table'
import { createColumnHelper } from '@octanejs/tanstack-table'
import { format } from 'date-fns'
import { createElement } from 'octane'
import PersonCell from '@/components/ui/table/person-cell.btsx'
import StatusBadge from './badges.btsx'
import { verificationEntryStatus, type VerificationEntryRow } from './data'
import type { snapsFeatures } from './table-config'

/**
 * Shared table definition for the verification entries admin table, mirroring
 * `snap-columns.ts`. Rows are `verificationEntries` documents exactly as
 * `verificationEntries.q.listAllForAdmin` returns them.
 */

export type { VerificationEntryRow }

export const VERIFICATION_ENTRY_LIST_LIMIT = 250
export const EMPTY_VERIFICATION_ENTRIES: VerificationEntryRow[] = []
export const PAGE_SIZES = [50, 100, 200]

// The addresses an entry was sent from and its identifiers are available for
// anyone who goes looking, but they are noise in the default reading of the
// table, which is "who is waiting on what".
export const DEFAULT_COLUMN_VISIBILITY = {
  ccEmailAddress: false,
  emailFromAddress: false,
  senderUid: false,
  updatedAt: false,
  uploadId: false
}

export const DEFAULT_COLUMN_PINNING: ColumnPinningState = { end: [], start: [] }

/** Matches the `status` union in `verificationEntrySchema`. */
export const VERIFICATION_ENTRY_STATUS_FILTERS = Object.keys(verificationEntryStatus) as VerificationEntryRow['status'][]

const formatTimestamp = (timestamp: number) => format(new Date(timestamp), 'M/dd/yyyy hh:mm:ss a')

const columnHelper = createColumnHelper<typeof snapsFeatures, VerificationEntryRow>()
const createHeader = (header: string) => () => createElement('div', { className: 'ps-4' }, header)

export const verificationEntryColumns = columnHelper.columns([
  columnHelper.accessor('plateNumber', {
    header: createHeader('Plate'),
    size: 120,
    sortFn: 'text',
    enableColumnFilter: false
  }),
  columnHelper.accessor('applicant', {
    header: createHeader('Applicant'),
    size: 260,
    sortFn: 'text',
    enableColumnFilter: false,
    // `flexRender` invokes a `cell` as a component, so this returns a node
    // descriptor rather than markup — this module is plain TypeScript.
    cell: (info) => createElement(PersonCell, { name: info.getValue() })
  }),
  columnHelper.accessor('status', {
    header: createHeader('Status'),
    size: 180,
    sortFn: 'text',
    filterFn: 'arrHas',
    enableColumnFilter: true,
    // `flexRender` invokes a `cell` as a component, so this returns a node
    // descriptor rather than markup — this module is plain TypeScript.
    cell: (info) => createElement(StatusBadge, { presentation: verificationEntryStatus[info.getValue()] })
  }),
  columnHelper.accessor('emailToAddress', {
    header: createHeader('Recipient'),
    size: 300,
    sortFn: 'text',
    filterFn: 'includesString',
    enableColumnFilter: true
  }),
  columnHelper.accessor('senderName', {
    header: createHeader('Sender'),
    size: 220,
    sortFn: 'text',
    filterFn: 'includesString',
    enableColumnFilter: true,
    // `flexRender` invokes a `cell` as a component, so this returns a node
    // descriptor rather than markup — this module is plain TypeScript.
    cell: (info) => createElement(PersonCell, { name: info.getValue() })
  }),
  columnHelper.accessor((row) => (row.attachments ?? []).join(', '), {
    id: 'attachments',
    header: createHeader('Attachments'),
    size: 220,
    sortFn: 'text',
    enableColumnFilter: false,
    cell: (info) => info.getValue() || '--'
  }),
  columnHelper.accessor('createdAt', {
    header: createHeader('Created'),
    size: 300,
    sortFn: 'basic',
    filterFn: 'inDateRange',
    enableColumnFilter: true,
    enableGlobalFilter: false,
    cell: (info) => formatTimestamp(info.getValue())
  }),
  columnHelper.accessor('emailFromAddress', {
    header: createHeader('From'),
    size: 300,
    sortFn: 'text',
    filterFn: 'includesString',
    enableColumnFilter: true
  }),
  columnHelper.accessor((row) => row.ccEmailAddress ?? '', {
    id: 'ccEmailAddress',
    header: createHeader('CC'),
    size: 300,
    sortFn: 'text',
    filterFn: 'includesString',
    enableColumnFilter: true,
    cell: (info) => info.getValue() || '--'
  }),
  columnHelper.accessor('updatedAt', {
    header: createHeader('Updated'),
    size: 300,
    sortFn: 'basic',
    filterFn: 'inDateRange',
    enableColumnFilter: true,
    enableGlobalFilter: false,
    cell: (info) => formatTimestamp(info.getValue())
  }),
  columnHelper.accessor('senderUid', { header: 'Sender UID', size: 260, sortFn: 'text' }),
  columnHelper.accessor('uploadId', { header: 'Upload ID', size: 260, sortFn: 'text' })
])
