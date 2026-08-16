import { createClient } from './supabase/client'
import type { Lead } from '../app/api/analyze/route'

export interface SavedSearch {
  id: string
  name: string | null
  sector: string
  city: string
  leads: Lead[]
  lead_count: number
  created_at: string
}

export async function saveSearch(
  sector: string,
  city: string,
  leads: Lead[],
  name?: string
): Promise<SavedSearch> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('saved_searches')
    .insert({
      sector,
      city,
      leads,
      lead_count: leads.length,
      name: name ?? null,
    })
    .select()
    .single()

  if (error) throw error
  return data as SavedSearch
}

export async function listSearches(): Promise<SavedSearch[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('saved_searches')
    .select('id, name, sector, city, lead_count, created_at')
    .order('created_at', { ascending: false })
    .limit(20)
  return (data as SavedSearch[]) ?? []
}

export async function loadSearch(id: string): Promise<SavedSearch | null> {
  const supabase = createClient()
  const { data } = await supabase
    .from('saved_searches')
    .select('*')
    .eq('id', id)
    .single()
  return data as SavedSearch | null
}

export async function deleteSearch(id: string): Promise<void> {
  const supabase = createClient()
  await supabase.from('saved_searches').delete().eq('id', id)
}
