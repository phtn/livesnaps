import type { Node } from '@takumi-rs/helpers'
import { container, text } from '@takumi-rs/helpers'
import type { RenderOptions } from 'takumi-pdf/no-init'
import { render } from 'takumi-pdf/no-init'
import type { PdfStyle } from '@/lib/pdf/takumi'
import { createPdfFooter, initializePdfRenderer, loadPdfFonts, pdfTheme } from '@/lib/pdf/takumi'
import type {
  SnapFullReportDocument,
  SnapReportBlock,
  SnapReportEvidenceBlock,
  SnapReportField,
  SnapReportSectionBlock,
  SnapReportTone
} from '@/lib/snaps/full-report'

const NOT_RECORDED = 'Not recorded'

const toneStyle = (tone: SnapReportTone): { backgroundColor: string; color: string } => {
  if (tone === 'success') return { backgroundColor: pdfTheme.color.successWash, color: pdfTheme.color.success }
  if (tone === 'danger') return { backgroundColor: pdfTheme.color.dangerWash, color: pdfTheme.color.danger }
  if (tone === 'info') return { backgroundColor: pdfTheme.color.infoWash, color: pdfTheme.color.info }
  if (tone === 'warning') return { backgroundColor: pdfTheme.color.warningWash, color: pdfTheme.color.warning }
  return { backgroundColor: pdfTheme.color.wash, color: pdfTheme.color.muted }
}

const sectionHeading = ({ description, index, title }: { description?: string; index: string; title: string }): Node =>
  container({
    tagName: 'div',
    style: { alignItems: 'flex-start', display: 'flex', gap: 14, marginBottom: 10, width: '100%' },
    children: [
      text(index, {
        color: pdfTheme.color.accent,
        display: 'flex',
        fontFamily: pdfTheme.font.display,
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.08em',
        paddingTop: 3,
        width: 24
      }),
      container({
        tagName: 'div',
        style: { display: 'flex', flexDirection: 'column', flexGrow: 1, gap: 3 },
        children: [
          // `tagName` is kept on headings so the `outline: true` render option
          // still finds them when building the PDF outline.
          text({
            tagName: 'h2',
            text: title,
            style: {
              color: pdfTheme.color.ink,
              fontFamily: pdfTheme.font.display,
              fontSize: 14,
              fontWeight: 500,
              letterSpacing: '0.018em',
              lineHeight: 1.1,
              margin: 0,
              textTransform: 'capitalize'
            }
          }),
          ...(description
            ? [
                text({
                  tagName: 'p',
                  text: description,
                  style: { color: pdfTheme.color.muted, fontSize: 7.5, lineHeight: 1.35, margin: 0 }
                })
              ]
            : [])
        ]
      })
    ]
  })

const fieldRows = (fields: SnapReportField[]) => {
  const rows: SnapReportField[][] = []
  let pending: SnapReportField[] = []

  for (const field of fields) {
    if (field.span === 2) {
      if (pending.length > 0) rows.push(pending)
      rows.push([field])
      pending = []
      continue
    }

    pending.push(field)
    if (pending.length === 2) {
      rows.push(pending)
      pending = []
    }
  }

  if (pending.length > 0) rows.push(pending)
  return rows
}

const fieldCell = (field: SnapReportField, compact: boolean): Node =>
  container({
    tagName: 'div',
    style: {
      borderTop: `0.5px solid ${pdfTheme.color.rule}`,
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      gap: compact ? 2 : 3,
      minWidth: 0,
      padding: compact ? '6px 8px 6px 4px' : '8px 12px 8px 4px',
      width: field.span === 2 ? '100%' : '50%'
    },
    children: [
      text(field.label, {
        color: pdfTheme.color.muted,
        fontSize: compact ? 6.5 : 7,
        fontWeight: 500,
        letterSpacing: '0.08em',
        textTransform: 'uppercase'
      }),
      text(field.value, {
        color: field.value === NOT_RECORDED ? pdfTheme.color.faint : pdfTheme.color.ink,
        fontFamily: field.mono ? pdfTheme.font.mono : pdfTheme.font.body,
        fontSize: compact ? 9 : 10,
        lineHeight: 1.35,
        overflowWrap: 'break-word',
        whiteSpace: 'pre-wrap'
      })
    ]
  })

const fieldGrid = (fields: SnapReportField[], options?: { compact?: boolean }): Node =>
  container({
    tagName: 'div',
    style: { display: 'flex', flexDirection: 'column', width: '100%' },
    children: fieldRows(fields).map((row) =>
      container({
        tagName: 'div',
        style: { display: 'flex', width: '100%' },
        children: row.map((field) => fieldCell(field, options?.compact === true))
      })
    )
  })

const sectionBlock = (block: SnapReportSectionBlock): Node =>
  container({
    tagName: 'section',
    style: { breakInside: 'avoid', display: 'flex', flexDirection: 'column', marginTop: 25, width: '100%' },
    children: [
      sectionHeading(block),
      container({
        tagName: 'div',
        style: { display: 'flex', flexDirection: 'column', paddingLeft: 38 },
        children: [fieldGrid(block.fields)]
      })
    ]
  })

const evidenceItem = (item: SnapReportEvidenceBlock['items'][number]): Node =>
  container({
    tagName: 'article',
    style: {
      backgroundColor: pdfTheme.color.wash,
      borderLeft: `2px solid ${pdfTheme.color.accent}`,
      breakInside: 'avoid',
      display: 'flex',
      flexDirection: 'column',
      padding: '10px 12px 5px'
    },
    children: [
      container({
        tagName: 'div',
        style: { alignItems: 'baseline', display: 'flex', gap: 9, marginBottom: 6 },
        children: [
          text(item.index, {
            color: pdfTheme.color.accent,
            fontFamily: pdfTheme.font.mono,
            fontSize: 7,
            letterSpacing: '0.08em'
          }),
          text({
            tagName: 'h3',
            text: item.title,
            style: {
              color: pdfTheme.color.ink,
              fontFamily: pdfTheme.font.display,
              fontSize: 10,
              fontWeight: 500,
              margin: 0,
              textTransform: 'capitalize'
            }
          })
        ]
      }),
      fieldGrid(item.fields, { compact: true })
    ]
  })

const evidenceBlock = (block: SnapReportEvidenceBlock): Node =>
  container({
    tagName: 'section',
    style: { display: 'flex', flexDirection: 'column', marginTop: 25, width: '100%' },
    children: [
      sectionHeading(block),
      container({
        tagName: 'div',
        style: { display: 'flex', flexDirection: 'column', paddingLeft: 38 },
        children: [
          fieldGrid(block.fields),
          container({
            tagName: 'div',
            style: { display: 'flex', flexDirection: 'column', gap: 9, marginTop: 11 },
            children:
              block.items.length > 0
                ? block.items.map(evidenceItem)
                : [
                    container({
                      tagName: 'div',
                      style: {
                        backgroundColor: pdfTheme.color.wash,
                        color: pdfTheme.color.muted,
                        display: 'flex',
                        fontSize: 8,
                        padding: 12
                      },
                      children: [text('No evidence items were stored for this record.')]
                    })
                  ]
          })
        ]
      })
    ]
  })

const calloutBlock = (block: Extract<SnapReportBlock, { kind: 'callout' }>): Node =>
  container({
    tagName: 'aside',
    style: {
      backgroundColor: pdfTheme.color.accentWash,
      borderLeft: `3px solid ${pdfTheme.color.accent}`,
      breakInside: 'avoid',
      display: 'flex',
      flexDirection: 'column',
      marginTop: 25,
      padding: '12px 14px',
      width: '100%'
    },
    children: [sectionHeading(block), fieldGrid(block.fields, { compact: true })]
  })

const reportBlock = (block: SnapReportBlock): Node => {
  if (block.kind === 'evidence') return evidenceBlock(block)
  if (block.kind === 'callout') return calloutBlock(block)
  return sectionBlock(block)
}

const wordmarkPart = (word: string, accent: boolean): Node =>
  text(word, {
    ...(accent ? { color: pdfTheme.color.accent } : {}),
    fontFamily: pdfTheme.font.display,
    fontSize: 8,
    fontWeight: 600,
    letterSpacing: '0.08em'
  })

const reportHeader = (document: SnapFullReportDocument): Node =>
  container({
    tagName: 'div',
    style: {
      alignItems: 'center',
      borderBottom: `1px solid ${pdfTheme.color.rule}`,
      color: pdfTheme.color.ink,
      display: 'flex',
      fontFamily: pdfTheme.font.body,
      justifyContent: 'space-between',
      paddingBottom: 9,
      width: '100%'
    },
    children: [
      container({
        tagName: 'div',
        style: { alignItems: 'center', display: 'flex', gap: 9 },
        children: [
          container({
            tagName: 'span',
            style: { backgroundColor: pdfTheme.color.accent, display: 'flex', height: 12, width: 12 }
          }),
          container({
            tagName: 'div',
            style: { display: 'flex', flexDirection: 'column', gap: 1 },
            children: [
              container({
                tagName: 'div',
                style: { display: 'flex', flexDirection: 'row', gap: 0 },
                children: [wordmarkPart('LIVE', false), wordmarkPart('SNAPS', true), wordmarkPart('NOW', false)]
              }),
              text('PROOF EVIDENCE DOSSIER', {
                color: pdfTheme.color.muted,
                fontSize: 6.5,
                letterSpacing: '0.08em'
              })
            ]
          })
        ]
      }),
      container({
        tagName: 'div',
        style: { alignItems: 'flex-end', display: 'flex', flexDirection: 'column', gap: 1, paddingRight: 12 },
        children: [
          text('RECORD ID', { color: pdfTheme.color.muted, fontSize: 6.5, letterSpacing: '0.06em' }),
          text(document.recordId.slice(-16), {
            fontFamily: pdfTheme.font.mono,
            fontSize: 7,
            letterSpacing: '0.07em',
            textTransform: 'uppercase'
          })
        ]
      })
    ]
  })

const metricCell = (
  metric: SnapFullReportDocument['metrics'][number],
  metricIndex: number,
  metricCount: number
): Node => {
  const metricTone = toneStyle(metric.tone)

  return container({
    tagName: 'div',
    style: {
      ...(metricIndex < metricCount - 1 ? { borderRight: `0.5px solid ${pdfTheme.color.rule}` } : {}),
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      padding: '10px 11px',
      width: `${100 / metricCount}%`
    },
    children: [
      text(metric.label, {
        color: pdfTheme.color.muted,
        fontSize: 6.25,
        letterSpacing: '0.08em',
        textTransform: 'uppercase'
      }),
      text(metric.value, {
        color: metricTone.color,
        fontFamily: pdfTheme.font.display,
        fontSize: 10,
        fontWeight: 500,
        textTransform: 'capitalize'
      })
    ]
  })
}

const reportHero = (document: SnapFullReportDocument): Node =>
  container({
    tagName: 'div',
    style: { breakInside: 'avoid', display: 'flex', flexDirection: 'column', paddingBottom: 20, width: '100%' },
    children: [
      container({
        tagName: 'div',
        style: { alignItems: 'center', display: 'flex', justifyContent: 'space-between', marginBottom: 17 },
        children: [
          text('Full Authoritative Report', {
            color: pdfTheme.color.accent,
            fontSize: 7,
            fontWeight: 500,
            letterSpacing: '0.16em',
            textTransform: 'uppercase'
          }),
          text(`${document.generatedAt} · v${document.version}.0`, {
            backgroundColor: pdfTheme.color.wash,
            borderRadius: 999,
            color: pdfTheme.color.muted,
            fontSize: 7,
            fontWeight: 500,
            letterSpacing: '0.08em',
            padding: '5px 9px',
            textTransform: 'uppercase'
          })
        ]
      }),
      text({
        tagName: 'h1',
        text: document.title,
        style: {
          color: pdfTheme.color.ink,
          fontFamily: pdfTheme.font.display,
          fontSize: 31,
          fontWeight: 600,
          letterSpacing: '-0.035em',
          lineHeight: 0.98,
          margin: 0,
          overflowWrap: 'break-word'
        }
      }),
      text({
        tagName: 'p',
        text: document.subtitle,
        style: { color: pdfTheme.color.muted, fontSize: 9, lineHeight: 1.4, margin: '8px 0 0' }
      }),
      container({
        tagName: 'div',
        style: {
          borderBottom: `1px solid ${pdfTheme.color.rule}`,
          borderTop: `1px solid ${pdfTheme.color.rule}`,
          display: 'flex',
          marginTop: 20,
          width: '100%'
        },
        children: document.metrics.map((metric, metricIndex) =>
          metricCell(metric, metricIndex, document.metrics.length)
        )
      }),
      container({
        tagName: 'div',
        style: { color: pdfTheme.color.faint, display: 'flex', fontSize: 6.5, marginTop: 7 },
        children: [text(`Generated ${document.generatedAt} / timestamps in report are UTC`)]
      })
    ]
  })

const mainStyle: PdfStyle = {
  backgroundColor: pdfTheme.color.paper,
  color: pdfTheme.color.ink,
  display: 'flex',
  flexDirection: 'column',
  fontFamily: pdfTheme.font.body,
  width: '100%'
}

export const createSnapFullReportPdfLayout = (
  document: SnapFullReportDocument
): { content: Node; options: RenderOptions } => ({
  content: container({
    tagName: 'main',
    style: mainStyle,
    children: [
      reportHero(document),
      ...document.blocks.map((block) =>
        container({
          tagName: 'div',
          style: { display: 'flex', flexDirection: 'column' },
          children: [reportBlock(block)]
        })
      )
    ]
  }),
  options: {
    fontFamilies: ['OKX', 'sans-serif'],
    footer: createPdfFooter({
      left: 'INTERNAL / Confidential Record',
      reference: document.uploadId
    }),
    header: reportHeader(document),
    lang: 'en-PH',
    margin: { top: 72, right: 44, bottom: 42, left: 44 },
    metadata: {
      authors: ['xpriori'],
      creationDate: document.generatedAt.slice(0, 19),
      creator: 'LiveSnapsNow',
      description: `Full Snap Proof row report for ${document.uploadId}`,
      keywords: ['snap, proof', 'pre-inspection', 'verification'],
      title: `Proof Report - ${document.title}`
    },
    outline: true,
    size: 'a4'
  }
})

export const renderSnapFullReportPdf = async (document: SnapFullReportDocument): Promise<Uint8Array> => {
  const [, fonts] = await Promise.all([initializePdfRenderer(), loadPdfFonts()])
  const { content, options } = createSnapFullReportPdfLayout(document)

  return await render(content, { ...options, ...(fonts ? { fonts } : {}) })
}
