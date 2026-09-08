// @vitest-environment happy-dom
import { act, createRoot } from 'octane'
import { afterEach, expect, test, vi } from 'vitest'
import Probe from './fixtures/admin-pages-probe.btsx'

const transport = vi.hoisted(() => ({ requests: [] as { url: string; signal: AbortSignal; resolve: (page: unknown) => void }[] }))
vi.mock('../src/lib/accounts/link-client', () => ({
  workspaceJson: (url: string, { signal }: { signal: AbortSignal }) => new Promise(resolve => transport.requests.push({ url, signal, resolve }))
}))
let root: ReturnType<typeof createRoot> | undefined
let container: HTMLDivElement
async function render(account: string) {
  if (!root) { container = document.createElement('div'); root = createRoot(container) }
  await act(async () => { root!.render(Probe, { path: `/api/admin/snaps?accountId=${account}` }) })
}
async function resolve(index: number, name: string, isDone = false) {
  await act(async () => transport.requests[index].resolve({ page: [{ _id: name, name }], isDone, continueCursor: name }))
}
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; transport.requests.length = 0 })

test('switching Accounts clears previous rows and ignores late pages from the previous Account', async () => {
  await render('a')
  await resolve(0, 'Account A private submission')
  expect(container.textContent).toContain('Account A private submission')
  await act(async () => { container.querySelector('button')!.click() })
  expect(transport.requests[1].url).toContain('accountId=a')
  await render('b')
  expect(container.textContent).not.toContain('Account A private submission')
  expect(transport.requests[1].signal.aborted).toBe(true)
  await resolve(2, 'Account B private submission')
  await resolve(1, 'Account A late submission')
  expect(container.textContent).toContain('Account B private submission')
  expect(container.textContent).not.toContain('Account A')
})

test('unmount aborts a pending account request', async () => {
  await render('a')
  await act(async () => root!.unmount())
  root = undefined
  expect(transport.requests[0].signal.aborted).toBe(true)
  await resolve(0, 'Late private submission')
  expect(container.textContent).not.toContain('Late private submission')
})
