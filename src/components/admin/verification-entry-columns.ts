import SelectOctane from '@/components/ui/SelectOctane.btsx'
import PersonCell from '@/components/ui/table/person-cell.btsx'
import type { ColumnPinningState } from '@octanejs/tanstack-table'
import { createColumnHelper } from '@octanejs/tanstack-table'
import { format } from 'date-fns'
import { createElement, useState } from 'octane'
import StatusBadge from './badges.btsx'
import { type VerificationEntryRow, verificationEntryStatus } from './data'
import { useSnapHandlerContext } from './snap-handler-context'
import type { snapsFeatures } from './table-config'
import VerificationRowActionsCell from './verification-row-actions.btsx'

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
  uploadId: false,
  handler: false
}

export const DEFAULT_COLUMN_PINNING: ColumnPinningState = { end: ['actions'], start: [] }

/** Matches the `status` union in `verificationEntrySchema`. */
export const VERIFICATION_ENTRY_STATUS_FILTERS = Object.keys(
  verificationEntryStatus
) as VerificationEntryRow['status'][]

const formatTimestamp = (timestamp: number) => format(new Date(timestamp), 'M/dd/yyyy hh:mm:ss a')

const columnHelper = createColumnHelper<typeof snapsFeatures, VerificationEntryRow>()
const createHeader = (header: string) => () => createElement('div', { className: 'ps-4' }, header)

const VerificationHandlerCell = ({ handler, uploadId }: Pick<VerificationEntryRow, 'handler' | 'uploadId'>) => {
  const context = useSnapHandlerContext()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const members = context?.options.members ?? []
  const currentMemberId = members.find((member) => member.email === handler?.email)?.id ?? ''
  const options = [
    ...members.map((member) => ({ value: member.id, label: member.name })),
    { value: 'clear', label: 'Clear handler' }
  ]

  const changeHandler = async (memberId: string) => {
    if (!memberId || memberId === currentMemberId || busy) return

    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/admin/snap-handlers', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ uploadId, memberId: memberId === 'clear' ? null : memberId })
      })
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string }
        throw new Error(payload.error || 'Unable to update handler.')
      }
      context?.refresh()
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to update handler.')
    } finally {
      setBusy(false)
    }
  }

  if (!context?.options.canManage) {
    return createElement(PersonCell, { imageUrl: handler?.image_url, name: handler?.name || 'Unassigned' })
  }

  return createElement('div', {
    className: 'flex flex-col gap-1',
    onClick: (event: MouseEvent) => event.stopPropagation(),
    children: [
      createElement(SelectOctane, {
        'aria-label': `Change handler for ${uploadId}`,
        className: 'max-w-48',
        classNames: {
          option: () => 'text-xs',
          singleValue: () => 'text-xs'
        },
        controlClassName: 'h-8 min-h-8! bg-background px-1.5',
        isDisabled: busy,
        isSearchable: members.length > 8,
        menuPortalTarget: typeof document === 'undefined' ? undefined : document.body,
        menuPosition: 'fixed',
        onChange: changeHandler,
        options,
        placeholder: busy ? 'Saving…' : handler?.name || 'Unassigned',
        value: currentMemberId
      }),
      error ? createElement('span', { role: 'alert', className: 'text-xs text-destructive' }, error) : null
    ]
  })
}

export const verificationEntryColumns = columnHelper.columns([
  columnHelper.display({
    id: 'handler',
    header: createHeader('Handler'),
    size: 220,
    cell: (info) =>
      createElement(VerificationHandlerCell, {
        handler: info.row.original.handler,
        uploadId: info.row.original.uploadId
      })
  }),
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
    cell: (info) => createElement(PersonCell, { imageUrl: info.row.original.applicantImageUrl, name: info.getValue() })
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
    cell: (info) => createElement(PersonCell, { imageUrl: info.row.original.senderImageUrl, name: info.getValue() })
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
  columnHelper.accessor('uploadId', { header: 'Upload ID', size: 260, sortFn: 'text' }),
  columnHelper.display({
    id: 'actions',
    header: createHeader('⁞'),
    size: 72,
    enableHiding: false,
    enableSorting: false,
    enableGlobalFilter: false,
    enableColumnFilter: false,
    enablePinning: true,
    // `flexRender` invokes a `cell` as a component, so this returns a node
    // descriptor rather than markup — this module is plain TypeScript.
    cell: (info) => createElement(VerificationRowActionsCell, { entry: info.row.original })
  })
])
