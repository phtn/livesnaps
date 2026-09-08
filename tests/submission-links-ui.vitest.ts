// @vitest-environment happy-dom
import { act, createRoot } from 'octane'
import { afterEach, expect, test, vi } from 'vitest'
import LinksPage from '../src/pages/admin-links-page.btsx'

const state = vi.hoisted(() => ({ canManage: true, writes: vi.fn(async () => ({})) }))
vi.mock('../src/hooks/use-workspace', () => ({
  useWorkspace: () => ({ id: 'account-a', name: 'Account A', slug: 'org-1' }),
  accountEndpoint: (path: string, id: string) => `${path}${path.includes('?') ? '&' : '?'}accountId=${id}`
}))
vi.mock('../src/lib/accounts/link-client', () => ({
  submissionShareUrl: (account: string, slug = '') => `https://livesnapsnow.com/${account}${slug ? `/${slug}` : ''}`,
  writeWorkspaceJson: state.writes,
  workspaceJson: async (url: string) => url.includes('submission-analytics') ? {
    fromDay: '2026-09-01', toDay: '2026-09-08',
    totals: { started: 4, completed: 2, abandoned: 1, cancelled: 0, invalidated: 0 },
    days: [{ day: '2026-09-01', started: 4, completed: 2 }],
    links: [{ linkId: 'link-a', started: 4, completed: 2, abandoned: 1 }]
  } : { canManage: state.canManage, links: [{ _id: 'link-a', slug: 'team-a', label: 'Team A', enabled: true }] }
}))
let root: ReturnType<typeof createRoot> | undefined
let container: HTMLDivElement
async function render() {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => { root!.render(LinksPage, {}) })
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
}
const button = (text: string) => [...container.querySelectorAll('button')].find(el => el.textContent === text)!
async function input(element: HTMLInputElement, value: string) {
  await act(async () => { element.value = value; element.dispatchEvent(new Event('input', { bubbles: true })) })
}
afterEach(async () => {
  await act(async () => root?.unmount())
  container?.remove()
  state.canManage = true
  state.writes.mockClear()
})

test('owners can create nested links, rename labels and disable without changing the slug', async () => {
  await render()
  expect(container.textContent).toContain('Submission links')
  expect(container.textContent).toContain('50%')
  expect(button('Create link').disabled).toBe(true)
  await input(container.querySelector('input[placeholder="Team A"]')!, 'Campaign B')
  await input(container.querySelector('input[placeholder="team-a"]')!, 'CAMPAIGN-B')
  expect(button('Create link').disabled).toBe(false)
  await act(async () => { button('Create link').click(); await new Promise(resolve => setTimeout(resolve, 0)) })
  expect(state.writes).toHaveBeenCalledWith('/api/admin/submission-links?accountId=account-a', {
    action: 'create', slug: 'campaign-b', label: 'Campaign B'
  })
  expect((container.querySelector('input[placeholder="team-a"]') as HTMLInputElement).value).toBe('')
  await input(container.querySelector('input[aria-label="Display label for team-a"]')!, 'Renamed team')
  await act(async () => { button('Save label').click(); await new Promise(resolve => setTimeout(resolve, 0)) })
  expect(state.writes).toHaveBeenCalledWith(expect.any(String), { action: 'update', linkId: 'link-a', label: 'Renamed team' })
  await act(async () => { button('Disable').click(); await new Promise(resolve => setTimeout(resolve, 0)) })
  expect(state.writes).toHaveBeenCalledWith(expect.any(String), { action: 'update', linkId: 'link-a', enabled: false })
})

test('viewers can read analytics and follow source links but cannot manage links', async () => {
  state.canManage = false
  await render()
  expect(container.textContent).toContain('Team A')
  expect(container.textContent).toContain('50%')
  expect(button('Create link')).toBeUndefined()
  expect(button('Save label')).toBeUndefined()
  expect(button('Disable')).toBeUndefined()
  expect(container.querySelector('a[target="_blank"]')?.getAttribute('href')).toBe('https://livesnapsnow.com/org-1/team-a')
  expect(container.querySelector('a[href^="/admin-snaps"]')?.getAttribute('href')).toBe('/admin-snaps?sourceLinkId=link-a')
})

test('invalid analytics date ranges are rejected visibly', async () => {
  await render()
  const dates = container.querySelectorAll<HTMLInputElement>('input[type="date"]')
  await input(dates[0], '2026-01-01')
  await input(dates[1], '2026-09-08')
  await act(async () => { button('Apply dates').click(); await new Promise(resolve => setTimeout(resolve, 0)) })
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('1–90 days')
})
