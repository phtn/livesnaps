// @vitest-environment happy-dom
import { act, createRoot } from 'octane'
import { afterEach, expect, test, vi } from 'vitest'
import SubmitList from '../src/components/submit-list.btsx'

// Browsers mark the `finished` promise as handled when an animation is
// cancelled (per the Web Animations spec); happy-dom doesn't, so every row
// animation that motion stops would surface as an unhandled AbortError.
const cancelAnimation = Animation.prototype.cancel
Animation.prototype.cancel = function (this: Animation) {
  this.finished.catch(() => undefined)
  return cancelAnimation.call(this)
}

const state = vi.hoisted(() => ({ submissions: undefined as unknown[] | undefined }))

vi.mock('../src/hooks/use-convex-query', () => ({ useConvexQuery: () => state.submissions }))
vi.mock('../src/hooks/use-convex-auth', () => ({
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false, userId: 'uid-1' })
}))
vi.mock('@octanejs/tanstack-router', async () => ({ Link: (await import('./fixtures/link-stub.btsx')).default }))

const snap = (id: string, plateNumber: string, minutesAgo: number) => ({
  _id: id,
  make: 'Toyota',
  model: 'Vios',
  photoCount: 5,
  plateNumber,
  startedAt: Date.now() - minutesAgo * 60_000,
  status: 'completed',
  year: 2021
})

let root: ReturnType<typeof createRoot> | undefined
let container: HTMLDivElement

async function render(submissions: unknown[] | undefined) {
  state.submissions = submissions
  if (!root) {
    container = document.createElement('div')
    root = createRoot(container)
  }
  await act(async () => {
    root!.render(SubmitList, { authenticatedUserId: 'uid-1', isAuthenticated: true, isAuthLoading: false, limit: 6 })
  })
}

afterEach(async () => {
  await act(async () => root?.unmount())
  root = undefined
  vi.restoreAllMocks()
})

/** Records each row's opacity entrance (motion hands opacity to `element.animate`). */
function recordEntrances() {
  const entrances: { plate: string; delay: number }[] = []
  const animate = Element.prototype.animate
  vi.spyOn(Element.prototype, 'animate').mockImplementation(function (this: Element, keyframes, options) {
    const opacity = (keyframes as Record<string, unknown> | null)?.opacity
    if (this.tagName === 'LI' && Array.isArray(opacity) && opacity.at(-1) === 1) {
      const plate = this.querySelector('p')?.textContent ?? ''
      // `+ 0` folds motion's `-0` start delay into a plain 0.
      entrances.push({ plate, delay: Number((options as KeyframeAnimationOptions).delay ?? 0) + 0 })
    }
    return animate.call(this, keyframes, options)
  })
  return entrances
}

test('renders each submission as one list item with its row inside', async () => {
  await render([snap('a', 'ABC 1234', 5), snap('b', 'XYZ 9876', 180)])

  const items = container.querySelectorAll('ul.divide-y > li')
  expect(items).toHaveLength(2)
  expect(container.querySelectorAll('li li')).toHaveLength(0)
  expect(items[0].textContent).toContain('ABC 1234')
  expect(items[0].textContent).toContain('5 minutes ago')
  expect(items[1].textContent).toContain('XYZ 9876')
  expect(items[1].textContent).toContain('3 hours ago')
})

test('keeps existing rows in place when a new submission arrives at the top', async () => {
  await render([snap('a', 'ABC 1234', 5)])
  const firstRow = container.querySelector('ul.divide-y > li')

  await render([snap('c', 'NEW 0001', 0), snap('a', 'ABC 1234', 5)])

  const items = container.querySelectorAll('ul.divide-y > li')
  expect(items).toHaveLength(2)
  expect(items[0].textContent).toContain('NEW 0001')
  // Keyed by `_id`, so the existing row's element is reused rather than rebuilt.
  expect(items[1]).toBe(firstRow)
})

test('staggers the first load top to bottom, then starts a new arrival immediately without replaying the rest', async () => {
  const entrances = recordEntrances()

  await render([snap('a', 'AAA 0001', 1), snap('b', 'BBB 0002', 2), snap('c', 'CCC 0003', 3)])
  const firstLoad = entrances.splice(0)
  expect(firstLoad.map((entry) => entry.plate)).toEqual(['AAA 0001', 'BBB 0002', 'CCC 0003'])
  const [first, second, third] = firstLoad.map((entry) => entry.delay)
  expect(first).toBe(0)
  expect(second).toBeGreaterThan(first)
  expect(third - second).toBeCloseTo(second - first)

  await render([snap('n', 'NEW 0004', 0), snap('a', 'AAA 0001', 1), snap('b', 'BBB 0002', 2), snap('c', 'CCC 0003', 3)])
  expect(entrances).toEqual([{ plate: 'NEW 0004', delay: 0 }])
})

test('shows the empty state when there are no submissions', async () => {
  await render([])
  expect(container.querySelector('ul.divide-y')).toBeNull()
  expect(container.textContent).toContain('No snaps yet.')
})
