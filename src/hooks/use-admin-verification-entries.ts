import { useAdminList } from '@/hooks/use-admin-list'
import type { VerificationEntryRow } from '@/components/admin/data'

export interface AdminVerificationEntriesResult {
  entries: VerificationEntryRow[] | undefined
  error: string | null
  isLoading: boolean
  lastUpdatedAt: number | null
  refresh: () => void
}

export function useAdminVerificationEntries(limit?: number): AdminVerificationEntriesResult {
  const { error, isLoading, items, lastUpdatedAt, refresh } = useAdminList<VerificationEntryRow>({
    fallbackErrorMessage: 'Unable to load verification entries.',
    limit,
    path: '/api/admin/verification-entries'
  })

  return { entries: items, error, isLoading, lastUpdatedAt, refresh }
}
