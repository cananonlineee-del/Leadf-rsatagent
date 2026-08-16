import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// ─── Types ──────────────────────────────────────────────��─────────────────────

interface MonitoredLead {
  id: string
  user_id: string
  place_id: string
  sector: string
  city: string
  lead_data: {
    name?: string
    score?: number
    metaAds?: { hasActiveAds?: boolean } | null
  }
  last_score: number | null
  notify_score_drop: boolean
  notify_ig_inactive: boolean
}

// ─── Eş Zamanlı Çalıştırıcı ──────────────────────────────────────────────────

/**
 * items dizisini en fazla `limit` eş zamanlı iş parçacığıyla işler.
 *
 * Sıralı for döngüsüne kıyasla toplam süreyi drastik kısaltır:
 *   Sıralı:   N × 25sn → 40 lead = 1000sn (timeout)
 *   limit=4:  N/4 × 25sn → 40 lead = 250sn (güvenli)
 */
async function runConcurrent<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0

  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i])
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  )
  return results
}

// ─── Tek Lead İşleme ─────────────────────────────────────────────────────────

async function processOne(
  monitored: MonitoredLead,
  opts: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: SupabaseClient<any, any, any>
    baseUrl: string
    cronSecret: string
  },
): Promise<{ id: string; status: string }> {
  const { supabase, baseUrl, cronSecret } = opts

  try {
    const url =
      `${baseUrl}/api/analyze` +
      `?businessName=${encodeURIComponent(monitored.lead_data?.name ?? '')}` +
      `&sector=${encodeURIComponent(monitored.sector)}` +
      `&city=${encodeURIComponent(monitored.city)}`

    // Her lead için bağımsız 55 saniyelik zaman aşımı —
    // bir lead takılsa bile diğerleri bloklanmaz.
    const ctrl  = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 55_000)

    let res: Response
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${cronSecret}` },
        signal: ctrl.signal,
      })
    } finally {
      clearTimeout(timer)
    }

    if (!res.ok) return { id: monitored.id, status: `fetch_error_${res.status}` }

    const data = await res.json() as {
      leads?: Array<{
        score: number
        instagram?: { activity: string } | null
        metaAds?: { hasActiveAds: boolean } | null
      }>
    }
    const freshLead = data.leads?.[0]
    if (!freshLead) return { id: monitored.id, status: 'no_lead' }

    const newScore = freshLead.score
    const oldScore = monitored.last_score
    const now      = new Date().toISOString()

    const notifications: {
      user_id: string
      place_id: string
      business_name: string
      message: string
    }[] = []

    // Skor düşüşü (>10 puan)
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

    // Meta Ads durdu
    const wasActive = monitored.lead_data?.metaAds?.hasActiveAds
    if (wasActive && !freshLead.metaAds?.hasActiveAds) {
      notifications.push({
        user_id:       monitored.user_id,
        place_id:      monitored.place_id,
        business_name: monitored.lead_data?.name ?? 'İşletme',
        message:       `Meta reklamları durdu — reklam bütçesi boşalmış olabilir.`,
      })
    }

    // Bildirim insert + lead güncelleme paralel yaz
    await Promise.all([
      notifications.length > 0
        ? supabase.from('notifications').insert(notifications)
        : Promise.resolve(),
      supabase
        .from('monitored_leads')
        .update({ last_score: newScore, last_checked: now, lead_data: freshLead })
        .eq('id', monitored.id),
    ])

    return { id: monitored.id, status: 'ok' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { id: monitored.id, status: `error: ${msg}` }
  }
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: rows, error } = await supabase.from('monitored_leads').select('*')
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const monitored = (rows ?? []) as MonitoredLead[]
  if (monitored.length === 0) {
    return NextResponse.json({ checked: 0, results: [] })
  }

  const baseUrl    = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  const cronSecret = process.env.CRON_SECRET ?? ''

  // 4 eş zamanlı /api/analyze çağrısı:
  //   Hobby:  4 × 55sn = 220sn < 300sn (5dk) ✓  (~16 lead)
  //   Pro:    4 × 55sn per batch → pratik olarak sınırsız
  const results = await runConcurrent(
    monitored,
    4,
    (m) => processOne(m, { supabase, baseUrl, cronSecret }),
  )

  return NextResponse.json({
    checked: results.length,
    ok:      results.filter(r => r.status === 'ok').length,
    errors:  results.filter(r => r.status !== 'ok' && r.status !== 'no_lead').length,
    results,
  })
}
