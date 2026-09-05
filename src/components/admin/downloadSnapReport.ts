import { createTableExportFileName, downloadTableExport } from '@/components/admin/export-utils'
import { convexClient } from '@/lib/convex-client'
import { createSnapFullReportDocument } from '@/lib/snaps/full-report'
import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'

export async function downloadSnapFullReport(snap: Doc<'snaps'>) {
  const report = createSnapFullReportDocument(snap)
  const { renderSnapFullReportPdf } = await import('./snap-report-pdf')
  const pdf = await renderSnapFullReportPdf(report)
  const fileName = createTableExportFileName(`snap-report-${report.recordId.slice(-12)}`, 'pdf', report.generatedAt)

  downloadTableExport(Uint8Array.from(pdf).buffer, 'application/pdf', fileName)
}

// Row actions only carry a snap id, so the full document is fetched here
// before rendering — the table's row data is a compact projection that lacks
// the fields the full report requires.
export async function exportSnapReportById(snapId: Id<'snaps'>) {
  if (!convexClient) throw new Error('The Convex client is unavailable.')
  const snap = await convexClient.query(api.snaps.q.getForAdmin, { snapId })
  if (!snap) throw new Error('Snap not found.')
  await downloadSnapFullReport(snap)
}
