import { authenticatedFetch } from '@/lib/firebase'
import { createSnapPhotoPreviewResolver } from './snap-photo-preview-resolver'

export const snapPhotoPreviewResolver = createSnapPhotoPreviewResolver({
  createObjectUrl: (blob) => URL.createObjectURL(blob),
  fetcher: authenticatedFetch,
  revokeObjectUrl: (url) => URL.revokeObjectURL(url)
})

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => snapPhotoPreviewResolver.clear())
}
