import { createClient } from './supabase/client'
import type { Lead } from '../app/api/analyze/route'

export interface MessageTemplate {
  id: string
  user_id: string
  name: string
  sector: string | null
  short_template: string
  long_template: string
  created_at: string
}

export async function listTemplates(sector?: string): Promise<MessageTemplate[]> {
  const supabase = createClient()
  let query = supabase
    .from('message_templates')
    .select('*')
    .order('created_at', { ascending: false })

  if (sector) {
    query = query.or(`sector.is.null,sector.eq.${sector}`)
  }

  const { data } = await query
  return (data as MessageTemplate[]) ?? []
}

export async function saveTemplate(
  t: Omit<MessageTemplate, 'id' | 'user_id' | 'created_at'>
): Promise<void> {
  const supabase = createClient()
  await supabase.from('message_templates').insert(t)
}

export async function deleteTemplate(id: string): Promise<void> {
  const supabase = createClient()
  await supabase.from('message_templates').delete().eq('id', id)
}

export function applyTemplate(
  template: string,
  lead: Lead,
  sender: { name: string; agency: string; website: string }
): string {
  const gap1 = lead.gaps[0] ?? ''
  const gap2 = lead.gaps[1] ?? ''

  return template
    .replace(/\{\{işletmeAdı\}\}/g, lead.name)
    .replace(/\{\{sektör\}\}/g, lead.primaryType ?? '')
    .replace(/\{\{gap1\}\}/g, gap1)
    .replace(/\{\{gap2\}\}/g, gap2)
    .replace(/\{\{gönderenAd\}\}/g, sender.name)
    .replace(/\{\{ajansAd\}\}/g, sender.agency)
    .replace(/\{\{ajansWeb\}\}/g, sender.website)
}
