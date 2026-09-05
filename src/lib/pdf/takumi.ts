import type { Node, NodeMetadata } from '@takumi-rs/helpers'
import { container, text } from '@takumi-rs/helpers'
import type { FontLoader } from 'takumi-pdf/no-init'
import initializeTakumiPdf from 'takumi-pdf/no-init'
import * as takumiPdfWasmAsset from 'takumi-pdf/takumi_pdf_wasm_bg.wasm'

/**
 * Styles accepted by a Takumi node. Sourced from the node types rather than
 * `react`, which this project does not render with.
 */
export type PdfStyle = NonNullable<NodeMetadata['style']>

type TakumiPdfInitInput = Parameters<typeof initializeTakumiPdf>[0]

const getWasmAssetUrl = (asset: unknown): string => {
  if (typeof asset === 'object' && asset !== null && 'default' in asset && typeof asset.default === 'string') {
    return asset.default
  }

  throw new TypeError('Takumi PDF WebAssembly asset URL is unavailable')
}

const takumiPdfWasmUrl = getWasmAssetUrl(takumiPdfWasmAsset)
let takumiPdfInitialization: Promise<void> | undefined

export const initializePdfRenderer = (
  moduleOrPath: TakumiPdfInitInput = { module_or_path: takumiPdfWasmUrl }
): Promise<void> => {
  takumiPdfInitialization ??= initializeTakumiPdf(moduleOrPath)
    .then(() => undefined)
    .catch((error: unknown) => {
      takumiPdfInitialization = undefined
      throw error
    })

  return takumiPdfInitialization
}

export const pdfTheme = {
  color: {
    accent: '#e8783d',
    accentWash: '#fff3e9',
    danger: '#b42318',
    dangerWash: '#fef3f2',
    faint: '#9298a1',
    info: '#4338ca',
    infoWash: '#eef2ff',
    ink: '#17191d',
    muted: '#69707a',
    paper: '#ffffff',
    rule: '#daddd8',
    success: '#047857',
    successWash: '#ecfdf5',
    warning: '#b45309',
    warningWash: '#fffbeb',
    wash: '#f6f5f1'
  },
  font: {
    body: 'Okxs, sans-serif',
    display: 'Polys, Okxs, sans-serif',
    mono: 'Ios, monospace'
  }
} as const

const fetchFont = async (path: string) => {
  const response = await fetch(path)

  if (!response.ok) {
    throw new Error(`Unable to load PDF font (${response.status}).`)
  }

  return await response.arrayBuffer()
}

let pdfFonts: Promise<FontLoader[] | undefined> | undefined

/**
 * Loads the app's local brand faces only when rendering in the browser. PDF
 * generation remains functional with Takumi's fallbacks if a font request fails.
 */
export const loadPdfFonts = (): Promise<FontLoader[] | undefined> => {
  if (typeof window === 'undefined') {
    return Promise.resolve(undefined)
  }

  pdfFonts ??= Promise.all([
    fetchFont('/fonts/okxs-regular.woff2'),
    fetchFont('/fonts/okxs-medium.woff2'),
    fetchFont('/fonts/PolySansTrial-MedianWide.otf'),
    fetchFont('/fonts/PolySansTrial-BulkyWide.otf'),
    fetchFont('/fonts/IoskeleyMono-Regular.woff2')
  ])
    .then(([bodyRegular, bodyMedium, displayMedium, displayBold, mono]): FontLoader[] => [
      { data: bodyRegular, name: 'Okxs', weight: 400 },
      { data: bodyMedium, name: 'Okxs', weight: 500 },
      { data: displayMedium, name: 'Polys', weight: 500 },
      { data: displayBold, name: 'Polys', weight: 600 },
      { data: mono, name: 'Ios', weight: 300 }
    ])
    .catch(() => undefined)

  return pdfFonts
}

const footerStyle: PdfStyle = {
  alignItems: 'center',
  color: pdfTheme.color.muted,
  display: 'flex',
  fontFamily: pdfTheme.font.body,
  fontSize: 7,
  justifyContent: 'space-between',
  letterSpacing: '0.02em',
  width: '100%'
}

/**
 * `pageNumber` / `totalPages` are the class hooks Takumi substitutes per page —
 * the same markup its React `PageNumber`/`TotalPages` primitives emit.
 */
const pageCounter = (hook: 'pageNumber' | 'totalPages'): Node =>
  container({ tagName: 'span', className: `${hook} decimal-leading-zero` })

export const createPdfFooter = ({ left, reference }: { left: string; reference?: string }): Node =>
  container({
    tagName: 'div',
    style: footerStyle,
    children: [
      container({
        tagName: 'div',
        style: { alignItems: 'center', display: 'flex', gap: 8 },
        children: [
          container({
            tagName: 'span',
            style: { backgroundColor: pdfTheme.color.accent, display: 'flex', height: 2, width: 18 }
          }),
          text(left)
        ]
      }),
      container({
        tagName: 'div',
        style: { alignItems: 'center', display: 'flex', gap: 14, paddingRight: 12 },
        children: [
          ...(reference ? [text(reference, { fontFamily: pdfTheme.font.mono })] : []),
          container({
            tagName: 'span',
            style: { display: 'flex' },
            children: [pageCounter('pageNumber'), text(' / '), pageCounter('totalPages')]
          })
        ]
      })
    ]
  })
