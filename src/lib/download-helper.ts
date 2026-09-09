const MODERN_COLOR_FUNCTION = /(?:color(?:-mix)?|lab|lch|oklab|oklch)\(/i
const MAX_CANVAS_DIMENSION = 16_000
const MAX_CANVAS_AREA = 64_000_000
const MAX_ITEM_EXPORT_SCALE = 4

const colorProperties = [
  'accent-color',
  'background-color',
  'border-block-end-color',
  'border-block-start-color',
  'border-bottom-color',
  'border-inline-end-color',
  'border-inline-start-color',
  'border-left-color',
  'border-right-color',
  'border-top-color',
  'caret-color',
  'color',
  'column-rule-color',
  'fill',
  'outline-color',
  'stroke',
  'text-decoration-color',
  '-webkit-text-stroke-color'
] as const

function createColorResolver(documentRef: Document) {
  const canvas = documentRef.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })
  const cache = new Map<string, string>()

  canvas.width = 1
  canvas.height = 1

  return (color: string) => {
    const cached = cache.get(color)
    if (cached) {
      return cached
    }

    if (!context) {
      return 'rgba(0, 0, 0, 1)'
    }

    context.clearRect(0, 0, 1, 1)
    context.fillStyle = 'rgba(0, 0, 0, 0)'
    context.fillStyle = color
    context.fillRect(0, 0, 1, 1)

    const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data
    const resolved = `rgba(${red}, ${green}, ${blue}, ${Number((alpha / 255).toFixed(3))})`
    cache.set(color, resolved)
    return resolved
  }
}

function normalizeExportColors(root: HTMLElement, clonedDocument: Document) {
  const resolveColor = createColorResolver(clonedDocument)
  const elements = [root, ...Array.from(root.querySelectorAll<HTMLElement | SVGElement>('*'))]
  const view = clonedDocument.defaultView

  if (!view) {
    return
  }

  for (const element of elements) {
    const computedStyle = view.getComputedStyle(element)
    const inlineStyle = element.style

    for (const property of colorProperties) {
      const value = computedStyle.getPropertyValue(property)
      if (hasModernColorFunction(value)) {
        inlineStyle.setProperty(property, resolveColor(value), 'important')
      }
    }

    for (const property of ['background-image', 'box-shadow', 'filter', 'text-shadow'] as const) {
      const value = computedStyle.getPropertyValue(property)
      if (hasModernColorFunction(value)) {
        inlineStyle.setProperty(property, 'none', 'important')
      }
    }
  }
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
      } else {
        reject(new Error('Unable to create the ticket PNG.'))
      }
    }, 'image/png')
  })
}

async function waitForExportSurface(element: HTMLElement) {
  await document.fonts?.ready

  const images = Array.from(element.querySelectorAll<HTMLImageElement>('img'))
  await Promise.all(
    images.map(async (image) => {
      if (image.complete) return

      try {
        await image.decode()
      } catch {
        // html2canvas will apply its own fallback for unreadable images.
      }
    })
  )

  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
}

export function hasModernColorFunction(value: string) {
  return MODERN_COLOR_FUNCTION.test(value)
}

export function getItemExportScale(width: number, height: number, requestedScale = MAX_ITEM_EXPORT_SCALE) {
  const safeWidth = Math.max(Math.ceil(width), 1)
  const safeHeight = Math.max(Math.ceil(height), 1)
  const safeRequestedScale =
    Number.isFinite(requestedScale) && requestedScale > 0
      ? Math.min(requestedScale, MAX_ITEM_EXPORT_SCALE)
      : MAX_ITEM_EXPORT_SCALE
  const dimensionScale = MAX_CANVAS_DIMENSION / Math.max(safeWidth, safeHeight)
  const areaScale = Math.sqrt(MAX_CANVAS_AREA / (safeWidth * safeHeight))

  return Math.max(Number.EPSILON, Math.min(safeRequestedScale, dimensionScale, areaScale))
}

export function createPngFilename(label: string, fallback = 'item') {
  const normalized = label
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const normalizedFallback = fallback
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return `${normalized || normalizedFallback || 'item'}.png`
}

export async function renderElementAsPngBlob(element: HTMLElement, requestedScale = MAX_ITEM_EXPORT_SCALE) {
  await waitForExportSurface(element)

  const { default: html2canvas } = await import('html2canvas')
  const exportWidth = Math.max(element.scrollWidth, 1)
  const exportHeight = Math.max(element.scrollHeight, 1)
  const exportScale = getItemExportScale(exportWidth, exportHeight, requestedScale)
  const canvas = await html2canvas(element, {
    allowTaint: false,
    backgroundColor: '#ffffff',
    ignoreElements: (candidate) => candidate.hasAttribute('data-item-export-ignore'),
    logging: false,
    onclone: (clonedDocument, clonedElement) => {
      // html2canvas parses the cloned document backgrounds separately from
      // the requested element. Tailwind's modern theme colors can serialize
      // as lab()/oklab() here, which html2canvas 1.x cannot parse.
      clonedDocument.documentElement.style.setProperty('background-color', '#ffffff', 'important')
      clonedDocument.body.style.setProperty('background-color', '#ffffff', 'important')

      const exportStyles = clonedDocument.createElement('style')
      exportStyles.textContent = `
        [data-ticket-export-root],
        [data-ticket-export-root] * {
          animation: none !important;
          caret-color: transparent !important;
          transition: none !important;
        }
        [data-ticket-export-root] *::before,
        [data-ticket-export-root] *::after {
          background-image: none !important;
          box-shadow: none !important;
          text-shadow: none !important;
        }
        [data-ticket-export-ignore] {
          display: none !important;
        }
      `
      clonedDocument.head.appendChild(exportStyles)
      normalizeExportColors(clonedElement, clonedDocument)
    },
    scale: exportScale,
    useCORS: true
  })
  return await canvasToBlob(canvas)
}

export async function downloadElementAsPng(element: HTMLElement, filename: string) {
  const blob = await renderElementAsPngBlob(element)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.download = filename
  link.href = url
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
