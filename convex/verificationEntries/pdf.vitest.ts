import { describe, expect, test } from 'vitest'
import type { SnapFullReportDocument } from '../../src/lib/snaps/full-report'
import { renderFullReportPdfBytes } from './pdf'

describe('verification full report PDF', () => {
  test('renders a real PDF attachment', async () => {
    const report: SnapFullReportDocument = {
      blocks: [
        {
          fields: [{ label: 'Plate number', mono: true, value: 'ABC 123' }],
          id: 'vehicle',
          index: '01',
          kind: 'section',
          title: 'Vehicle'
        }
      ],
      generatedAt: '2026-09-09T00:00:00.000Z',
      kind: 'snap-full-row-report',
      metrics: [{ label: 'Status', tone: 'success', value: 'Completed' }],
      recordId: 'record-1',
      status: 'completed',
      statusTone: 'success',
      subtitle: 'Verification report',
      title: 'ABC 123',
      uploadId: 'upload-1',
      version: 1
    }

    const bytes = await renderFullReportPdfBytes(report)

    expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe('%PDF-')
    expect(bytes.byteLength).toBeGreaterThan(1_000)
  })
})
