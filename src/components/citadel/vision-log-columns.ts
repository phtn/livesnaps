import type { features } from '@/components/admin/table-config'
import JsonViewer from '@/components/json-viewer.btsx'
import { createColumnHelper } from '@octanejs/tanstack-table'
import { createElement } from 'octane'
import type { VisionLogDocument } from '../../../convex/vision_logs/d'
import { createHeader } from '../ui/table/hyper/create-header'

const column = createColumnHelper<typeof features, VisionLogDocument>()
export const EMPTY_VISION_LOGS: VisionLogDocument[] = []

export const visionLogColumns = [
  column.accessor('createdAt', {
    id: 'createdAt',
    header: createHeader('Created'),
    filterFn: 'inDateRange',
    size: 210,
    cell: (info) => new Date(info.getValue()).toLocaleString()
  }),
  column.accessor('status', { id: 'status', header: createHeader('Status'), filterFn: 'arrHas', size: 130 }),
  column.accessor('kind', { id: 'kind', header: createHeader('Kind'), filterFn: 'arrHas', size: 160 }),
  column.accessor('upload_id', { id: 'upload_id', header: createHeader('Upload ID'), filterFn: 'arrHas', size: 250 }),
  column.accessor((log) => log.slotLabel ?? String(log.slot), {
    id: 'slot',
    header: createHeader('Slot'),
    filterFn: 'arrHas',
    size: 170
  }),
  column.accessor('provider', { id: 'provider', header: createHeader('Provider'), filterFn: 'arrHas', size: 120 }),
  column.accessor('model', { id: 'model', header: createHeader('Model'), filterFn: 'arrHas', size: 220 }),
  column.accessor((log) => log.errorMessage ?? '', { id: 'error', header: createHeader('Error'), size: 320 }),
  column.accessor((log) => (log.isDebug ? 'Yes' : 'No'), { id: 'isDebug', header: createHeader('Debug'), size: 90 }),
  column.display({
    id: 'details',
    header: createHeader('Details'),
    size: 340,
    cell: (info) =>
      createElement(
        'details',
        { className: 'py-2' },
        createElement('summary', { className: 'cursor-pointer' }, 'View output'),
        createElement(JsonViewer, {
          maxHeight: 'max-h-72',
          withToolbar: true,
          data: info.row.original.rawOutput
          // data: {
          //   vehicle: info.row.original.vehicle,
          //   mileage: info.row.original.mileage,
          //   captureIntegrity: info.row.original.captureIntegrity,
          //   visionStatus: info.row.original.visionStatus,
          //   rawOutput: info.row.original.rawOutput,
          //   errorMessage: info.row.original.errorMessage,
          //   capture_id: info.row.original.capture_id,
          //   r2_key: info.row.original.r2_key
          // }
        })
      )
  })
]
