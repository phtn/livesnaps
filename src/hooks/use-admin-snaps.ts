import { useAdminList } from '@/hooks/use-admin-list'
import type { AdminSnapListItem } from '@/lib/snaps/admin-photo-types'

export interface AdminSnapsResult {
  error: string | null
  isLoading: boolean
  lastUpdatedAt: number | null
  refresh: () => void
  snaps: AdminSnapListItem[] | undefined
}

export function useAdminSnaps(limit?: number): AdminSnapsResult {
  const { error, isLoading, items, lastUpdatedAt, refresh } = useAdminList<AdminSnapListItem>({
    fallbackErrorMessage: 'Unable to load snaps.',
    limit,
    path: '/api/admin/snaps'
  })

  return { error, isLoading, lastUpdatedAt, refresh, snaps: items }
}
