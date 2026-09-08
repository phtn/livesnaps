import { api } from '../../../convex/_generated/api'
import { convexClient } from '@/lib/convex-client'
import type { ReportSettings } from './report-settings'

export async function fetchReportSettings(): Promise<ReportSettings> {
  if (!convexClient) throw new Error('Report settings are unavailable. Please try again.')
  return convexClient.query(api.snapSettings.q.getReport, {})
}
export async function updateReportField(key: string, included: boolean): Promise<ReportSettings> {
  const response = await fetch('/api/gods/report-settings', {
    method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key, included })
  })
  if (!response.ok) throw new Error('Could not save this change. Please try again.')
  return response.json()
}
