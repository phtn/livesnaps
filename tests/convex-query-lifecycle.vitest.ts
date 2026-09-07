// @vitest-environment happy-dom
import { act, createRoot } from 'octane'
import { afterEach, expect, test, vi } from 'vitest'
import Probe from './fixtures/convex-query-probe.btsx'
import Expander from '../src/components/expander.btsx'
import SubmitList from '../src/components/submit-list.btsx'

const transport = vi.hoisted(() => {
  const subscriptions: { name: string; emit: (value: unknown) => void; stop: ReturnType<typeof vi.fn> }[] = []
  const onUpdate = vi.fn((name: string, _args: unknown, emit: (value: unknown) => void) => {
    const stop = vi.fn()
    subscriptions.push({ name, emit, stop })
    return Object.assign(stop, { getCurrentValue: () => undefined })
  })
  const query = vi.fn(async () => ({ imageQuality: 0.8 }))
  let auth = { isAuthenticated: false, isLoading: true, userId: null as string | null }
  const authListeners = new Set<() => void>()
  return { subscriptions, onUpdate, query, getAuth: () => auth, subscribeAuth: (listener: () => void) => { authListeners.add(listener); return () => { authListeners.delete(listener) } }, setAuth: (next: typeof auth) => { auth = next; for (const listener of [...authListeners]) listener() } }
})
vi.mock('../src/lib/convex-client', () => ({ convexClient: { onUpdate: transport.onUpdate, query: transport.query }, getConvexAuthState: transport.getAuth, subscribeToConvexAuthState: transport.subscribeAuth }))
vi.mock('@octanejs/tanstack-router', () => ({ Link: () => null }))
vi.mock('../src/lib/icons', () => ({ Icon: () => null }))
vi.mock('../src/components/captured-photos.btsx', () => ({
  default: () => null,
  MAX_CAPTURED_PHOTOS: 5,
  CAPTURE_SLOTS: [1, 2, 3, 4, 5].map(index => ({ index, label: `Photo ${index}` }))
}))
vi.mock('../src/components/capture-progress.btsx', () => ({ default: () => null }))
vi.mock('../src/components/photo-preview.btsx', () => ({ default: () => null }))
vi.mock('../src/components/guide-panel.btsx', () => ({ default: () => null }))
vi.mock('../src/components/shutter-button.btsx', () => ({ default: () => null }))
vi.mock('../src/components/plate-confirmation-dialog.btsx', () => ({ default: () => null }))
vi.mock('../src/components/camera-statusbar.btsx', () => ({ default: () => null }))


let root: ReturnType<typeof createRoot> | undefined
const render = async (props: { active?: boolean; uploadId?: string; tick?: number }) => {
  if (!root) root = createRoot(document.createElement('div'))
  await act(async () => { root!.render(Probe, props) })
}
afterEach(async () => {
  await act(async () => root?.unmount())
  root = undefined
  transport.subscriptions.length = 0
  transport.onUpdate.mockClear()
})

test('repeated settings responses and unrelated renders keep one subscription', async () => {
  await render({})
  for (let tick = 1; tick <= 50; tick++) {
    await act(async () => transport.subscriptions[0].emit({ imageQuality: 0.8 }))
    await render({ tick })
  }
  expect(transport.onUpdate).toHaveBeenCalledTimes(1)
  expect(transport.subscriptions[0].stop).not.toHaveBeenCalled()
})

test('settings and session subscriptions are independent through skip and ID changes', async () => {
  await render({ active: false })
  expect(transport.onUpdate).not.toHaveBeenCalled()
  await render({ active: true, uploadId: 'a' })
  expect(transport.onUpdate).toHaveBeenCalledTimes(2)
  await render({ active: true, uploadId: 'b' })
  expect(transport.onUpdate).toHaveBeenCalledTimes(3)
  expect(transport.subscriptions[0].stop).not.toHaveBeenCalled()
  await render({ active: false })
  expect(transport.subscriptions.every(s => s.stop.mock.calls.length === 1)).toBe(true)
})


test('the actual expander stays quiet while closed and shares settings across 50 capture opens', async () => {
  root = createRoot(document.createElement('div'))
  const props = {
    cancelSession: vi.fn(), completeSession: vi.fn(), endCompletedSession: vi.fn(),
    getCurrentIdToken: vi.fn(), getCurrentLocation: vi.fn(), isDebugMode: true,
    isLocationPrecise: true, sessionUploadId: 'capture', locationAccuracyMeters: null
  }
  for (let tick = 0; tick < 50; tick++) await act(async () => root!.render(Expander, { ...props, isExpanded: false, locationAccuracyMeters: tick }))
  expect(transport.query).not.toHaveBeenCalled()
  for (let tick = 0; tick < 50; tick++) {
    await act(async () => root!.render(Expander, { ...props, isExpanded: true, locationAccuracyMeters: tick }))
    await act(async () => root!.render(Expander, { ...props, isExpanded: false }))
  }
  expect(transport.query).toHaveBeenCalledTimes(1)
  expect(transport.onUpdate).not.toHaveBeenCalled()
})

test('the actual submission list waits for auth and keeps one live query across rerenders', async () => {
  root = createRoot(document.createElement('div'))
  const props = { authenticatedUserId: 'alice', isAuthenticated: true, isAuthLoading: false }
  await act(async () => root!.render(SubmitList, props))
  expect(transport.onUpdate).not.toHaveBeenCalled()
  await act(async () => transport.setAuth({ isAuthenticated: true, isLoading: false, userId: 'alice' }))
  expect(transport.onUpdate).toHaveBeenCalledTimes(1)
  expect(transport.subscriptions[0].name).toBe('snaps/q:listMine')
  for (let i = 0; i < 50; i++) {
    await act(async () => transport.subscriptions[0].emit([]))
    await act(async () => root!.render(SubmitList, { ...props, heading: `Snaps ${i}` }))
  }
  expect(transport.onUpdate).toHaveBeenCalledTimes(1)
  await act(async () => transport.setAuth({ isAuthenticated: false, isLoading: false, userId: null }))
  expect(transport.subscriptions[0].stop).toHaveBeenCalledTimes(1)
  await act(async () => root!.render(SubmitList, { ...props, authenticatedUserId: 'bob' }))
  expect(transport.onUpdate).toHaveBeenCalledTimes(1)
  await act(async () => transport.setAuth({ isAuthenticated: true, isLoading: false, userId: 'bob' }))
  expect(transport.onUpdate).toHaveBeenCalledTimes(2)
})

test('the actual expander keeps one proof subscription through camera and vision updates', async () => {
  root = createRoot(document.createElement('div'))
  const props = {
    cancelSession: vi.fn(), completeSession: vi.fn(), endCompletedSession: vi.fn(),
    getCurrentIdToken: vi.fn(), getCurrentLocation: vi.fn(), isDebugMode: false,
    isLocationPrecise: true, isExpanded: true, sessionUploadId: 'capture', locationAccuracyMeters: null
  }
  await act(async () => transport.setAuth({ isAuthenticated: false, isLoading: true, userId: null }))
  await act(async () => root!.render(Expander, props))
  expect(transport.onUpdate).not.toHaveBeenCalled()
  await act(async () => transport.setAuth({ isAuthenticated: true, isLoading: false, userId: 'alice' }))
  expect(transport.onUpdate).toHaveBeenCalledTimes(1)
  expect(transport.subscriptions[0].name).toBe('snaps/q:getByUploadId')
  for (let i = 0; i < 50; i++) {
    await act(async () => transport.subscriptions[0].emit({ plate_number: 'ABC1234', make: 'Toyota', model: 'Vios', mileage: 42, updated_at: i }))
    await act(async () => root!.render(Expander, { ...props, locationAccuracyMeters: i }))
  }
  expect(transport.onUpdate).toHaveBeenCalledTimes(1)
  await act(async () => root!.render(Expander, { ...props, isExpanded: false }))
  expect(transport.subscriptions[0].stop).toHaveBeenCalledTimes(1)
})
