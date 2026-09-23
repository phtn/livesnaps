import { createColumnHelper } from '@octanejs/tanstack-table'
import { createElement } from 'octane'
import type { VisionLogDocument } from '../../../convex/vision_logs/d'
import type { snapsFeatures } from '@/components/admin/table-config'

const column = createColumnHelper<typeof snapsFeatures, VisionLogDocument>()
export const EMPTY_VISION_LOGS: VisionLogDocument[] = []

export const visionLogColumns = [
  column.accessor('createdAt', {
    id: 'createdAt', header: 'Created', size: 210,
    cell: (info) => new Date(info.getValue()).toLocaleString(),
  }),
  column.accessor('status', { id: 'status', header: 'Status', size: 130 }),
  column.accessor('kind', { id: 'kind', header: 'Kind', size: 160 }),
  column.accessor('upload_id', { id: 'upload_id', header: 'Upload ID', size: 250 }),
  column.accessor((log) => log.slotLabel ?? String(log.slot), { id: 'slot', header: 'Slot', size: 170 }),
  column.accessor('provider', { id: 'provider', header: 'Provider', size: 120 }),
  column.accessor('model', { id: 'model', header: 'Model', size: 220 }),
  column.accessor((log) => log.errorMessage ?? '', { id: 'error', header: 'Error', size: 320 }),
  column.accessor((log) => log.isDebug ? 'Yes' : 'No', { id: 'isDebug', header: 'Debug', size: 90 }),
  column.display({
    id: 'details', header: 'Details', size: 340,
    cell: (info) => createElement('details', { className: 'py-2' },
      createElement('summary', { className: 'cursor-pointer' }, 'View output'),
      createElement('pre', { className: 'mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all text-xs' },
        JSON.stringify({
          vehicle: info.row.original.vehicle,
          mileage: info.row.original.mileage,
          captureIntegrity: info.row.original.captureIntegrity,
          visionStatus: info.row.original.visionStatus,
          rawOutput: info.row.original.rawOutput,
          errorMessage: info.row.original.errorMessage,
          capture_id: info.row.original.capture_id,
          r2_key: info.row.original.r2_key,
        }, null, 2))),
  }),
]
