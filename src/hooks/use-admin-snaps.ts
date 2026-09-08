import { useAdminList } from '@/hooks/use-admin-list'
import type { AdminSnapListItem } from '@/lib/snaps/admin-photo-types'
import { accountEndpoint, useWorkspace } from './use-workspace'

export interface AdminSnapsResult {
  error: string | null
  isLoading: boolean
  lastUpdatedAt: number | null
  refresh: () => void
  snaps: AdminSnapListItem[] | undefined
}

export function useAdminSnaps(limit?: number, sourceLinkId?: string): AdminSnapsResult {
  const account = useWorkspace()
  const { error, isLoading, items, lastUpdatedAt, refresh } = useAdminList<AdminSnapListItem>({
    fallbackErrorMessage: 'Unable to load snaps.',
    limit,
    path: accountEndpoint(`/api/admin/snaps${sourceLinkId ? `?sourceLinkId=${encodeURIComponent(sourceLinkId)}` : ''}`, account?.id ?? '')
  })

  return { error, isLoading, lastUpdatedAt, refresh, snaps: items }
}
