// @vitest-environment happy-dom
import { act, createRoot } from 'octane'
import { afterEach, expect, test } from 'vitest'
import JsonViewer from '../src/components/json-viewer.btsx'

let root: ReturnType<typeof createRoot> | undefined
let container: HTMLDivElement

async function renderViewer(props: Record<string, unknown>) {
  if (root) {
    await act(async () => root!.unmount())
    root = undefined
    container.remove()
  }
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(JsonViewer as never, props as never)
  })
  return container
}

afterEach(async () => {
  await act(async () => root?.unmount())
  root = undefined
  container?.remove()
})

const car = {
  classification: 'car',
  make: 'Toyota',
  model: 'Vios',
  year: 2021,
  color: null,
  plate: 'ABC 1234',
  damages: ['scratch'],
  misc: [] as string[]
}

const buttons = () => Array.from(container.querySelectorAll('button'))

test('renders vision car keys and scalar values in tree mode', async () => {
  const el = await renderViewer({ data: car })
  const text = el.textContent ?? ''
  expect(text).toContain('make')
  expect(text).toContain('Toyota')
  expect(text).toContain('plate')
  expect(text).toContain('ABC 1234')
  expect(text).toContain('2021')
  expect(text).toContain('null')
  expect(text).toContain('damages')
  expect(text).toContain('[]')
})

test('collapses nested arrays by default and expands on toggle', async () => {
  const el = await renderViewer({ data: car })
  expect(el.textContent).toContain('1 item')
  expect(el.textContent).not.toContain('scratch')

  const damagesToggle = buttons()[1]
  await act(async () => {
    damagesToggle.click()
  })
  expect(el.textContent).toContain('scratch')

  await act(async () => {
    damagesToggle.click()
  })
  expect(el.textContent).not.toContain('scratch')
  expect(el.textContent).toContain('1 item')
})

test('collapses the root node on toggle', async () => {
  const el = await renderViewer({ data: car })
  expect(el.textContent).toContain('Toyota')

  await act(async () => {
    buttons()[0].click()
  })
  const text = el.textContent ?? ''
  expect(text).toContain('8 keys')
  expect(text).not.toContain('Toyota')

  await act(async () => {
    buttons()[0].click()
  })
  expect(el.textContent).toContain('Toyota')
})

test('shows No data for null', async () => {
  const el = await renderViewer({ data: null })
  expect(el.textContent).toContain('No data')
})

test('renders children header label', async () => {
  const el = await renderViewer({ data: car, children: 'Structured vehicle recognition' })
  expect(el.textContent).toContain('Structured vehicle recognition')
})

test('toolbar switches between tree and raw modes', async () => {
  const el = await renderViewer({ data: car, withToolbar: true })
  const labels = buttons().map((button) => button.textContent)
  expect(labels).toContain('tree')
  expect(labels).toContain('raw')
  expect(labels).toContain('copy')

  const rawButton = buttons().find((button) => button.textContent === 'raw')!
  await act(async () => {
    rawButton.click()
  })
  expect(el.textContent).toContain('"plate": "ABC 1234"')
})

test('truncates long strings in tree mode', async () => {
  const long = 'x'.repeat(150)
  const el = await renderViewer({ data: { note: long } })
  const text = el.textContent ?? ''
  expect(text).toContain('x'.repeat(100))
  expect(text).toContain('...')
  expect(text).not.toContain(long)
})

test('renders a plain string payload', async () => {
  const el = await renderViewer({ data: 'not json {' })
  expect(el.textContent).toContain('not json {')
})
