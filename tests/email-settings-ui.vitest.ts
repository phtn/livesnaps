// @vitest-environment happy-dom
import { act, createRoot } from 'octane'
import { afterEach, expect, test, vi } from 'vitest'
import EmailSettings from '../src/pages/citadel-settings-email-page.btsx'

const mocks = vi.hoisted(() => ({ send: vi.fn(), query: vi.fn() }))
vi.mock('../src/lib/convex-client', () => ({ convexClient: { action: mocks.send } }))
vi.mock('../src/hooks/use-convex', () => ({ useConvexAuth: () => ({ isAuthenticated: true, userId: 'god' }) }))
vi.mock('../src/hooks/use-convex-query', () => ({ useConvexQuery: mocks.query }))
let root: ReturnType<typeof createRoot>
let container: HTMLDivElement
const button = (text: string) => [...container.querySelectorAll('button')].find(node => node.textContent?.includes(text))!
async function render() {
  mocks.query.mockReturnValue({ page: [], isDone: true, continueCursor: '' })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root.render(EmailSettings, {}))
}
afterEach(async () => { await act(async () => root?.unmount()); container?.remove(); vi.resetAllMocks() })

test('switches real previews, validates recipient, and sends the selected template', async () => {
  mocks.send.mockResolvedValue(null)
  await render()
  expect(container.querySelector('iframe')?.getAttribute('sandbox')).toBe('')
  expect(container.querySelector('iframe')?.getAttribute('srcdoc')).toContain('/f_png/')
  expect(button('Send test email').disabled).toBe(true)
  await act(async () => button('Submission link').click())
  expect(container.querySelector('iframe')?.getAttribute('srcdoc')).toContain('A secure submission link for you')
  await act(async () => button('Show plain text').click())
  expect(container.querySelector('pre')?.textContent).toContain('No submission is required')
  const recipient = container.querySelector('input')!
  await act(async () => {
    recipient.value = 'test@example.com'
    recipient.dispatchEvent(new Event('input', { bubbles: true }))
  })
  expect(button('Send test email').disabled).toBe(false)
  await act(async () => {
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
  expect(mocks.send).toHaveBeenCalledWith(expect.anything(), { template: 'submission-link', recipient: 'test@example.com' })
  expect(container.textContent).toContain('Test accepted for sending')
})

test('shows send errors and resets webhook pagination on filter changes', async () => {
  mocks.send.mockRejectedValue(new Error('Provider unavailable'))
  await render()
  const recipient = container.querySelector('input')!
  await act(async () => {
    recipient.value = 'test@example.com'
    recipient.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => { container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
  expect(container.querySelector('[role=alert]')?.textContent).toContain('Provider unavailable')
  const select = container.querySelector('select')!
  await act(async () => { select.value = 'email.failed'; select.dispatchEvent(new Event('change', { bubbles: true })) })
  expect(mocks.query).toHaveBeenLastCalledWith(expect.anything(), { eventType: 'email.failed', paginationOpts: { numItems: 20, cursor: null } }, 'god')
  expect(container.textContent).toContain('No received webhooks match')
})
