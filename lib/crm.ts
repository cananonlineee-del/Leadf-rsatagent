import { createClient } from './supabase/client'
import type { Lead } from '../app/api/analyze/route'

export type CRMStatus = 'new' | 'contacted' | 'in_progress' | 'closed' | 'rejected'

export interface CRMEntry {
  status: CRMStatus
  note: string
}

export async function getCRMStatuses(placeIds: string[]): Promise<Record<string, CRMEntry>> {
  if (placeIds.length === 0) return {}
  const supabase = createClient()
  const { data } = await supabase
    .from('crm_leads')
    .select('place_id, status, note')
    .in('place_id', placeIds)

  const result: Record<string, CRMEntry> = {}
  for (const row of data ?? []) {
    result[row.place_id] = { status: row.status as CRMStatus, note: row.note ?? '' }
  }
  return result
}

export async function upsertCRMStatus(
  placeId: string,
  lead: Lead,
  status: CRMStatus,
  note?: string
): Promise<void> {
  const supabase = createClient()
  await supabase.from('crm_leads').upsert({
    place_id: placeId,
    lead_data: lead,
    status,
    note: note ?? '',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,place_id' })
}

export const CRM_STATUS_LABELS: Record<CRMStatus, string> = {
  new:         'Yeni',
  contacted:   'İletişildi',
  in_progress: 'Görüşülüyor',
  closed:      'Kapandı',
  rejected:    'Reddetti',
}

export interface CRMRow {
  place_id: string
  status: CRMStatus
  note: string
  updated_at: string
  lead_data: {
    name?: string
    sector?: string
    city?: string
    address?: string
    phone?: string
    score?: number
    siteAnalysis?: { emailAddress?: string } | null
  }
}

export async function listCRMLeads(): Promise<CRMRow[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('crm_leads')
    .select('place_id, status, note, updated_at, lead_data')
    .not('status', 'eq', 'new')          // 'new' = henüz dokunulmamış, CRM listesinde gösterme
    .order('updated_at', { ascending: false })
  return (data as CRMRow[]) ?? []
}

export const CRM_STATUS_BADGE: Record<CRMStatus, string> = {
  new:         'bg-zinc-800 text-zinc-400',
  contacted:   'bg-blue-500/15 text-blue-400',
  in_progress: 'bg-amber-500/15 text-amber-400',
  closed:      'bg-emerald-500/15 text-emerald-400',
  rejected:    'bg-red-500/10 text-red-600',
}
