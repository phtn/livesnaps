// @vitest-environment happy-dom
import { act, createRoot } from 'octane'
import { afterEach, expect, test, vi } from 'vitest'
import Settings from '../src/pages/citadel-settings-general-page.btsx'
import { REPORT_FIELD_GROUPS } from '../src/lib/snaps/report-settings'
const mocks = vi.hoisted(() => ({ save: vi.fn(), settings: { excludedFields: ['applicant:email'], updatedAt: null } }))
vi.mock('../src/hooks/use-convex-query', () => ({ useConvexQuery: () => mocks.settings }))
vi.mock('../src/lib/snaps/report-settings-client', () => ({ updateReportField: mocks.save }))
let root: ReturnType<typeof createRoot>
let container: HTMLDivElement
async function render() {
  container = document.createElement('div')
  root = createRoot(container)
  await act(async () => { root.render(Settings, {}) })
}
afterEach(async () => { await act(async () => root?.unmount()); vi.resetAllMocks() })

test('renders PDF groups and saves checkbox changes with pending feedback', async () => {
  let finish: (value: unknown) => void = () => {}
  mocks.save.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  await render()
  expect(container.querySelectorAll('input[type=checkbox]').length).toBe(REPORT_FIELD_GROUPS.flatMap(group => group.fields).length)
  expect([...container.querySelectorAll('legend')].map(node => node.textContent)).toEqual(REPORT_FIELD_GROUPS.map(group => group.title))
  const email = [...container.querySelectorAll('label')].find(node => node.textContent?.trim() === 'Email')!.querySelector('input')!
  expect(email.checked).toBe(false)
  await act(async () => { email.checked = true; email.dispatchEvent(new Event('change', { bubbles: true })) })
  expect(mocks.save).toHaveBeenCalledWith('applicant:email', true)
  expect(email.disabled).toBe(true)
  await act(async () => { finish({ excludedFields: [], updatedAt: 1 }) })
  expect(email.disabled).toBe(false)
  expect(email.checked).toBe(true)
  expect(container.textContent).toContain('Saved')
})

test('failed save restores the checkbox and shows the error', async () => {
  mocks.save.mockRejectedValue(new Error('Save failed'))
  await render()
  const checkbox = container.querySelector('input')!
  await act(async () => { checkbox.checked = false; checkbox.dispatchEvent(new Event('change', { bubbles: true })) })
  expect(checkbox.checked).toBe(true)
  expect(container.querySelector('[role=alert]')?.textContent).toContain('Save failed')
})
