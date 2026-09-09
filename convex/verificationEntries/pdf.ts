'use node'

import { container, type Node, text } from '@takumi-rs/helpers'
import { ConvexError, v } from 'convex/values'
import { render } from 'takumi-pdf'
import {
  createSnapFullReportDocument,
  type SnapFullReportDocument,
  type SnapReportField
} from '../../src/lib/snaps/full-report'
import { api, internal } from '../_generated/api'
import { internalAction } from '../_generated/server'

const ink = '#17191d'
const muted = '#69707a'
const rule = '#daddd8'
const accent = '#e8783d'

const fieldRow = (field: SnapReportField): Node =>
  container({
    tagName: 'div',
    style: {
      borderTop: `0.5px solid ${rule}`,
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      padding: '7px 0',
      width: '100%'
    },
    children: [
      text(field.label, {
        color: muted,
        fontSize: 7,
        fontWeight: 500,
        letterSpacing: '0.06em',
        textTransform: 'uppercase'
      }),
      text(field.value, {
        color: ink,
        fontFamily: field.mono ? 'monospace' : 'sans-serif',
        fontSize: 9,
        lineHeight: 1.35,
        overflowWrap: 'break-word',
        whiteSpace: 'pre-wrap'
      })
    ]
  })

const reportSection = (report: SnapFullReportDocument, blockIndex: number): Node => {
  const block = report.blocks[blockIndex]
  const fields: SnapReportField[] = [
    ...block.fields,
    ...(block.kind === 'evidence'
      ? block.items.flatMap((item) => [
          ...(item.title ? [{ label: `Evidence ${item.index}`, value: item.title, span: 2 as const }] : []),
          ...item.fields
        ])
      : [])
  ]

  return container({
    tagName: 'section',
    style: { display: 'flex', flexDirection: 'column', marginBottom: 18, width: '100%' },
    children: [
      text(`${block.index}  ${block.title}`, {
        color: ink,
        fontSize: 14,
        fontWeight: 600,
        marginBottom: 4,
        textTransform: 'capitalize'
      }),
      ...(block.description
        ? [text(block.description, { color: muted, fontSize: 8, lineHeight: 1.35, marginBottom: 8 })]
        : []),
      ...fields.map(fieldRow)
    ]
  })
}

/** The email path renders the same report document as the table download, as real PDF bytes. */
export const renderFullReportPdfBytes = async (report: SnapFullReportDocument): Promise<Uint8Array> => {
  const content = container({
    tagName: 'main',
    style: {
      backgroundColor: '#ffffff',
      color: ink,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'sans-serif',
      width: '100%'
    },
    children: [
      text('Full Authoritative Report', {
        color: accent,
        fontSize: 8,
        fontWeight: 600,
        letterSpacing: '0.14em',
        marginBottom: 10,
        textTransform: 'uppercase'
      }),
      text(report.title, { color: ink, fontSize: 28, fontWeight: 600, lineHeight: 1, marginBottom: 7 }),
      text(report.subtitle, { color: muted, fontSize: 9, lineHeight: 1.4, marginBottom: 16 }),
      container({
        tagName: 'div',
        style: { borderBottom: `1px solid ${rule}`, borderTop: `1px solid ${rule}`, display: 'flex', marginBottom: 18 },
        children: report.metrics.map((metric) =>
          container({
            tagName: 'div',
            style: {
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
              padding: '9px 10px',
              width: `${100 / report.metrics.length}%`
            },
            children: [
              text(metric.label, { color: muted, fontSize: 6.5, letterSpacing: '0.06em', textTransform: 'uppercase' }),
              text(metric.value, { color: ink, fontSize: 9, fontWeight: 500 })
            ]
          })
        )
      }),
      ...report.blocks.map((_block, blockIndex) => reportSection(report, blockIndex))
    ]
  })

  const bytes = await render(content, {
    lang: 'en-PH',
    margin: { top: 44, right: 42, bottom: 44, left: 42 },
    metadata: {
      authors: ['LiveSnapsNow'],
      ...(report.showGeneratedAt === false ? {} : { creationDate: report.generatedAt.slice(0, 19) }),
      creator: 'LiveSnapsNow',
      description: `Full Snap Proof report for ${report.uploadId}`,
      title: `Proof Report - ${report.title}`
    },
    outline: true,
    size: 'a4'
  })

  if (bytes.length < 5 || new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') {
    throw new ConvexError('Full report renderer did not produce a valid PDF.')
  }

  return bytes
}

export const renderFullReport = internalAction({
  args: { uploadId: v.string() },
  returns: v.object({ content: v.string(), byteLength: v.number() }),
  handler: async (ctx, { uploadId }) => {
    const snap = await ctx.runQuery(internal.verificationEntries.helpers.getSnapByUploadIdInternal, { uploadId })
    if (!snap) throw new ConvexError('Snap not found for the full report.')

    const settings = await ctx.runQuery(api.snapSettings.q.getReport, {})
    const report = createSnapFullReportDocument(snap, new Date(), settings.excludedFields)
    const bytes = await renderFullReportPdfBytes(report)

    return { content: Buffer.from(bytes).toString('base64'), byteLength: bytes.byteLength }
  }
})
