import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ─── Anahtar Kelimeler ────────────────────────────────────────────────────────

const DM_KEYWORDS = [
  'dijital pazarlama',
  'sosyal medya uzmanı',
  'seo uzmanı',
  'google ads uzmanı',
  'performance marketing',
]

// ─── Tipler ───────────────────────────────────────────────────────────────────

interface WarmLeadRow {
  source:       'kariyer' | 'jooble'
  company_name: string
  job_title:    string
  city:         string | null
  posted_at:    string | null
  job_url:      string
  snippet:      string | null
}

// ─── Kariyer.net — Apify Actor ────────────────────────────────────────────────

interface KariyerItem {
  companyName?: string
  title?:       string
  location?:    string
  publishedAt?: string
  url?:         string
  description?: string
}

async function fetchKariyer(
  keyword: string,
  apifyToken: string,
): Promise<WarmLeadRow[]> {
  try {
    const res = await fetch(
      `https://api.apify.com/v2/acts/blackfalcondata~kariyer-scraper/run-sync-get-dataset-items?token=${apifyToken}&timeout=90`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ keyword, maxItems: 50 }),
        signal:  AbortSignal.timeout(100_000),
      },
    )
    if (!res.ok) {
      console.error(`[kariyer] ${keyword}: HTTP ${res.status}`)
      return []
    }
    const items = (await res.json()) as KariyerItem[]
    const rows: WarmLeadRow[] = []
    for (const item of items) {
      if (!item.companyName || !item.url) continue
      rows.push({
        source:       'kariyer',
        company_name: item.companyName.trim(),
        job_title:    item.title?.trim() ?? keyword,
        city:         item.location?.trim() ?? null,
        posted_at:    item.publishedAt ?? null,
        job_url:      item.url,
        snippet:      item.description?.slice(0, 300) ?? null,
      })
    }
    return rows
  } catch (err) {
    console.error(`[kariyer] ${keyword}:`, err)
    return []
  }
}

// ─── Jooble TR — Resmi API ────────────────────────────────────────────────────

interface JoobleJob {
  company?:  string
  title?:    string
  location?: string
  updated?:  string
  link?:     string
  snippet?:  string
}

interface JoobleResponse {
  jobs?: JoobleJob[]
}

async function fetchJooble(
  keyword: string,
  apiKey: string,
): Promise<WarmLeadRow[]> {
  try {
    const res = await fetch(
      `https://tr.jooble.org/api/${apiKey}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ keywords: keyword, location: '' }),
        signal:  AbortSignal.timeout(30_000),
      },
    )
    if (!res.ok) {
      console.error(`[jooble] ${keyword}: HTTP ${res.status}`)
      return []
    }
    const data = (await res.json()) as JoobleResponse
    const rows: WarmLeadRow[] = []
    for (const job of data.jobs ?? []) {
      if (!job.company || !job.link) continue
      // Jooble link'i redirect URL — dedup için yeterince benzersiz
      rows.push({
        source:       'jooble',
        company_name: job.company.trim(),
        job_title:    job.title?.trim() ?? keyword,
        city:         job.location?.trim() ?? null,
        posted_at:    job.updated ?? null,
        job_url:      job.link,
        snippet:      job.snippet ?? null,
      })
    }
    return rows
  } catch (err) {
    console.error(`[jooble] ${keyword}:`, err)
    return []
  }
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apifyToken = process.env.APIFY_TOKEN    ?? null
  const joobleKey  = process.env.JOOBLE_API_KEY ?? null

  if (!apifyToken && !joobleKey) {
    return NextResponse.json({ error: 'No API keys configured' }, { status: 500 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Her kaynaktan tüm keyword'leri paralel çek
  const kariyerResults = apifyToken
    ? await Promise.all(DM_KEYWORDS.map(kw => fetchKariyer(kw, apifyToken)))
    : []

  const joobleResults = joobleKey
    ? await Promise.all(DM_KEYWORDS.map(kw => fetchJooble(kw, joobleKey)))
    : []

  const allRows = [
    ...kariyerResults.flat(),
    ...joobleResults.flat(),
  ]

  if (allRows.length === 0) {
    return NextResponse.json({ inserted: 0, total: 0 })
  }

  // Upsert — aynı (source, job_url) çifti varsa atla
  const { data, error } = await supabase
    .from('warm_leads')
    .upsert(allRows, { onConflict: 'source,job_url', ignoreDuplicates: true })
    .select('id')

  if (error) {
    console.error('[warm-leads cron]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    inserted: data?.length ?? 0,
    total:    allRows.length,
    sources: {
      kariyer: kariyerResults.flat().length,
      jooble:  joobleResults.flat().length,
    },
  })
}
