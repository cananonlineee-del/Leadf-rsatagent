import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Tüm aktif takipler
  const { data: leads, error } = await supabase
    .from('monitored_leads')
    .select('*')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const results: { id: string; status: string }[] = []

  for (const monitored of leads ?? []) {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
      const url = `${baseUrl}/api/analyze?businessName=${encodeURIComponent(monitored.lead_data?.name ?? '')}&sector=${encodeURIComponent(monitored.sector)}&city=${encodeURIComponent(monitored.city)}`

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${process.env.CRON_SECRET}`,
        },
      })
      if (!res.ok) { results.push({ id: monitored.id, status: 'fetch_error' }); continue }

      const data = await res.json()
      const freshLead = data.leads?.[0]
      if (!freshLead) { results.push({ id: monitored.id, status: 'no_lead' }); continue }

      const newScore   = freshLead.score
      const oldScore   = monitored.last_score
      const notifications: { user_id: string; place_id: string; business_name: string; message: string }[] = []

      // Skor düşüşü
      if (monitored.notify_score_drop && oldScore !== null && newScore < oldScore - 10) {
        notifications.push({
          user_id:       monitored.user_id,
          place_id:      monitored.place_id,
          business_name: monitored.lead_data?.name ?? 'İşletme',
          message:       `Skor ${oldScore}'den ${newScore}'e düştü — dijital varlık zayıflamış olabilir.`,
        })
      }

      // Instagram inaktif
      if (monitored.notify_ig_inactive && freshLead.instagram?.activity === 'neglected') {
        notifications.push({
          user_id:       monitored.user_id,
          place_id:      monitored.place_id,
          business_name: monitored.lead_data?.name ?? 'İşletme',
          message:       `Instagram hesabı inaktif duruma geçti — iletişim için iyi bir fırsat.`,
        })
      }

      // Meta Ads durumu değişimi
      const wasActive = monitored.lead_data?.metaAds?.hasActiveAds
      if (wasActive && !freshLead.metaAds?.hasActiveAds) {
        notifications.push({
          user_id:       monitored.user_id,
          place_id:      monitored.place_id,
          business_name: monitored.lead_data?.name ?? 'İşletme',
          message:       `Meta reklamları durdu — reklam bütçesi boşalmış olabilir.`,
        })
      }

      if (notifications.length > 0) {
        await supabase.from('notifications').insert(notifications)
      }

      await supabase
        .from('monitored_leads')
        .update({
          last_score:   newScore,
          last_checked: new Date().toISOString(),
          lead_data:    freshLead,
        })
        .eq('id', monitored.id)

      results.push({ id: monitored.id, status: 'ok' })
    } catch (err) {
      results.push({ id: monitored.id, status: 'error: ' + String(err) })
    }
  }

  return NextResponse.json({ checked: results.length, results })
}
