// @vitest-environment happy-dom
import { act, createRoot } from 'octane'
import { afterEach, expect, test, vi } from 'vitest'
import Viewer from '../src/components/admin/verification-photo-viewer.btsx'
import { buildSnapObjectKey } from '../src/lib/r2/snap-images'
import { photoReviewSnapshot } from '../src/lib/verifications/photo-review'
import type { PhotoReviewData } from '../src/lib/verifications/admin-writes'

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), save: vi.fn(), toast: vi.fn() }))
vi.mock('../src/lib/verifications/admin-writes', () => ({ fetchPhotoReview: mocks.fetch, savePhotoReview: mocks.save }))
vi.mock('../src/lib/toast', () => ({ onSuccess: mocks.toast }))
vi.mock('../src/hooks/use-back-dismiss', () => ({ useBackDismiss: vi.fn() }))
// Exercise our workflow with a lightweight dialog shell; Base UI's source hooks
// require the application bundler's dependency transforms, absent from Vitest.
vi.mock('@octanejs/base-ui/dialog', async () => ({ Dialog: (await import('./fixtures/verification-dialog-stub.btsx')).TestDialog }))

const uploadId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const captureId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const photos = ([1, 2] as const).map(slot => ({ slot, label: slot === 1 ? 'front' : 'back', captured_at: 1000, content_type: 'image/webp' as const, size: 1024, r2_key: buildSnapObjectKey(uploadId, slot, captureId) }))
const data = () => ({
  entry: { _id: 'entry-1', status: 'draft', plateNumber: 'ABC123', applicant: 'Applicant' },
  snap: { metadata: { photos }, location_session: { status: 'completed', address: { full_address: 'Session address' } } }
}) as unknown as PhotoReviewData
let root: ReturnType<typeof createRoot> | undefined
let container: HTMLDivElement
const onClose = vi.fn()
const onSaved = vi.fn()
const button = (label: string) => [...document.querySelectorAll('button')].find(node => node.textContent?.trim() === label || node.getAttribute('aria-label') === label)!
const click = async (label: string) => { await act(async () => button(label).click()) }
const load = async () => { await act(async () => document.querySelector('img')!.dispatchEvent(new Event('load'))) }
async function render(value = data()) {
  mocks.fetch.mockResolvedValue(value)
  mocks.save.mockResolvedValue({ status: 'active' })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => { root!.render(Viewer, { entryId: 'entry-1', onClose, onSaved }) })
}
afterEach(async () => {
  await act(async () => root?.unmount())
  root = undefined
  container?.remove()
  vi.resetAllMocks()
})

test('requires a loaded photo, stamps verification, then unlocks Next', async () => {
  await render()
  expect(button('Mark as verified').disabled).toBe(true)
  expect(button('Next photo').disabled).toBe(true)
  expect(document.body.textContent).toContain('Captured at')
  expect(document.body.textContent).toContain('Not recorded for this photo')
  await load()
  await click('Mark as verified')
  expect(document.querySelector('.verification-stamp')?.textContent).toBe('Verified')
  expect(button('Next photo').disabled).toBe(false)
  expect(mocks.save).not.toHaveBeenCalled()
  await click('Next photo')
  expect(document.querySelector('img')?.getAttribute('alt')).toContain('back')
  expect(button('Mark as verified').disabled).toBe(true)
  expect(button('Review summary').disabled).toBe(true)
})

test('Skip advances without a verified stamp and saves partial progress', async () => {
  await render()
  await click('Skip')
  expect(document.querySelector('img')?.getAttribute('alt')).toContain('back')
  await load()
  await click('Mark as verified')
  await click('Review summary')
  expect(document.body.textContent).toContain('1 verified · 1 skipped')
  await click('Save & exit')
  expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 0, decisions: [
    { photoKey: photos[0].r2_key, status: 'skipped' }, { photoKey: photos[1].r2_key, status: 'verified' }
  ] }))
  expect(onSaved).toHaveBeenCalledOnce()
  expect(onClose).toHaveBeenCalledOnce()
})

test('exit requires a choice and discard never saves', async () => {
  await render()
  await load()
  await click('Mark as verified')
  await click('Exit verification')
  expect(document.body.textContent).toContain('Save your progress?')
  await click('Keep reviewing')
  expect(onClose).not.toHaveBeenCalled()
  await click('Exit verification')
  await click('Discard')
  expect(onClose).toHaveBeenCalledOnce()
  expect(mocks.save).not.toHaveBeenCalled()
})

test('resumes the saved photo and keeps prior decisions', async () => {
  const value = data()
  value.entry.photoReview = { revision: 3, savedAt: 1, snapshot: photoReviewSnapshot(photos), currentPhotoKey: photos[1].r2_key, decisions: [{ photoKey: photos[0].r2_key, status: 'verified', reviewedAt: 1, reviewedBy: 'member' }] }
  await render(value)
  expect(document.querySelector('img')?.getAttribute('alt')).toContain('back')
  expect(document.body.textContent).toContain('1 of 2 verified')
  await load()
  await click('Mark as verified')
  await click('Review summary')
  expect(button('Finish verification')).toBeDefined()
  await click('Finish verification')
  expect(mocks.save.mock.calls[0][0]).toMatchObject({ expectedRevision: 3, decisions: photos.map(photo => ({ photoKey: photo.r2_key, status: 'verified' })) })
})

test('load failures cannot be verified; retry can recover', async () => {
  await render()
  await act(async () => document.querySelector('img')!.dispatchEvent(new Event('error')))
  expect(button('Mark as verified').disabled).toBe(true)
  expect(document.body.textContent).toContain('could not be loaded')
  await click('Retry photo')
  await load()
  expect(button('Mark as verified').disabled).toBe(false)
})

test('failed save keeps the review open and retains local decisions', async () => {
  await render()
  mocks.save.mockRejectedValue(new Error('Another verifier saved progress.'))
  await load()
  await click('Mark as verified')
  await click('Save & exit')
  expect(document.body.textContent).toContain('Another verifier saved progress.')
  expect(document.querySelector('.verification-stamp')).not.toBeNull()
  expect(onClose).not.toHaveBeenCalled()
})
