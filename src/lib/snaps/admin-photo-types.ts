import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../../convex/_generated/api'

export type AdminSnapListItem = FunctionReturnType<typeof api.snaps.q.listForAdmin>[number]
export type AdminSnapPhoto = AdminSnapListItem['photos'][number]

export interface SnapPhotoGallery {
  photos: readonly AdminSnapPhoto[]
  title: string
  uploadId: string
}
