import { createClient } from './supabase/client'

export interface Notification {
  id: string
  place_id: string
  business_name: string
  message: string
  is_read: boolean
  created_at: string
}

export async function listNotifications(): Promise<Notification[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)
  return (data as Notification[]) ?? []
}

export async function markAllRead(): Promise<void> {
  const supabase = createClient()
  await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('is_read', false)
}

export async function markRead(id: string): Promise<void> {
  const supabase = createClient()
  await supabase.from('notifications').update({ is_read: true }).eq('id', id)
}

export async function unreadCount(): Promise<number> {
  const supabase = createClient()
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('is_read', false)
  return count ?? 0
}
