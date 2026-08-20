import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ─── Anahtar Kelimeler ────────────────────────────────────────────────────────

const DM_KEYWORDS = [
  'dijital pazarlama uzmanı',
  'sosyal medya yöneticisi',
  'seo uzmanı',
  'google ads uzmanı',
  'performance marketing uzmanı',
]

// ─── Lead Filtresi ────────────────────────────────────────────────────────────

/**
 * Türkiye'de tanınan büyük zincir / kurumsal marka isimleri.
 * Küçük harf, normalizasyon gerekmez — includes() ile kontrol edilir.
 */
const LARGE_CO_BLOCKLIST = new Set([
  // Perakende zincirleri
  'migros', 'bim ', 'a101', 'şok ', 'carrefour', 'metro market', 'makromarket', 'file market',
  // Telekom
  'turkcell', 'türk telekom', 'vodafone', 'türknet', 'superonline',
  // Bankalar
  'garanti', 'iş bankası', 'yapı kredi', 'ziraat bankası', 'halkbank',
  'vakıfbank', 'akbank', 'finansbank', 'qnb', 'denizbank', 'ıng bank',
  // Giyim / moda zincirleri
  'lc waikiki', 'mavi jeans', 'koton', 'defacto', 'ipekyol', 'collezione',
  'zara', 'h&m', 'pull&bear', 'bershka', 'stradivarius',
  // Elektronik
  'arçelik', 'vestel', 'beko', 'bosch', 'siemens', 'samsung', 'apple', 'lenovo',
  // Gıda / FMCG
  'ülker', 'eti ', 'pınar', 'sütaş', 'anadolu efes', 'eczacıbaşı', 'unilever',
  // Holdinglar
  'sabancı', 'koç ', 'doğuş', 'alarko', 'limak', 'zorlu', 'ülker grubu',
  // E-ticaret / teknoloji
  'hepsiburada', 'trendyol', 'amazon', 'gittigidiyor', 'n11',
  // Ulaşım / havayolu
  'thy ', 'turkish airlines', 'pegasus', 'sunexpress', 'anadolu jet',
  // Sigorta
  'axa sigorta', 'allianz', 'mapfre', 'güneş sigorta', 'ray sigorta',
  // Akaryakıt
  'shell', 'bp ', 'opet', 'total ', 'petrol ofisi',
  // Gayrimenkul zincirleri
  'remax', 're/max', 'century 21', 'century21',
])

/**
 * Kurumsal yapı sinyalleri — şirket adında geçiyorsa büyük kurumsal şirket.
 * Küçük ölçekli A.Ş.'leri ezmemek için dikkatli seçildi.
 */
const CORPORATE_PATTERN = /\b(holding|group\b|grubu|bank\b|banka\b|telekom\b|tekstil a\.ş\.|global a\.ş\.|uluslararası a\.ş\.|international\b)\b/i

/**
 * Yerel işletme sektör sinyalleri — şirket adı veya snippet'te varsa KESIN tut.
 * Bu listede olan şirketler her zaman dahil edilir (filtreden geçer).
 */
const LOCAL_BIZ_PATTERN = /kuaför|güzellik\s+merkez|spa\b|nail\b|epilasyon|dövme|piercing|estetik klinik|diş klinik|ağız.diş|fizyoterapi|psikolog|veteriner|optik\b|eczane|restoran|kafeterya|pastane|fırın|köfteci|kebap|pide\b|butik otel|pansiyon|tatil\s+köy|oto\s+servis|lastik\s+servis|araç\s+bakım|halı\s+yıkama|kuru temizleme|nakliye\s+firma|çiçekçi|kuyumcu|pet\s+shop|anaokulu|kreş\b|etüt\s+merkez|dil\s+kursu|sürücü\s+kursu|müzik\s+okul|sigorta\s+acentesi|muhasebe\s+bürosu|hukuk\s+bürosu/i

/**
 * Kabul edilen iş unvanları — dijital pazarlama ile doğrudan ilgili roller.
 * Bu kalıpların HİÇBİRİNİ içermeyen iş unvanları kesinlikle filtrelenir.
 */
const RELEVANT_JOB_PATTERN = /dijital\s*pazarlama|sosyal\s*medya|social\s*media|\bseo\b|\bsem\b|arama\s*motoru|google\s*ads|google\s*reklam|performance\s*market|performans\s*pazarlama|içerik\s*uzman|content\s*market|web\s*tasarım|web\s*geliştir|reklam\s*uzman|medya\s*planlama|influencer|e[\s-]?ticaret\s*uzman|growth\s*hack|\bppc\b|\bcro\b|e[\s-]?mail\s*market|affiliate|brand\s*manager|marka\s*uzman|dijital\s*medya|dijital\s*reklam|online\s*pazarlama/i

/**
 * Bir warm lead'in veritabanına eklenip eklenmeyeceğini belirler.
 *
 * Tutma mantığı (öncelik sırası):
 * 0. İş unvanı dijital pazarlamayla alakasız (muhasebe, finans vb.) → KESİN FİLTRELE
 * 1. Şirket adı veya snippet'te yerel işletme sinyali → KESIN TUT
 * 2. Bilinen büyük marka bloklist eşleşmesi → FİLTRELE
 * 3. Kurumsal yapı sinyali → FİLTRELE
 * 4. Belirsiz → TUT (aşırı filtrelemeyi önle)
 */
function shouldKeepLead(row: WarmLeadRow): boolean {
  // 0. İş unvanı alakasız → kesinlikle çıkar (en yüksek öncelik)
  if (!RELEVANT_JOB_PATTERN.test(row.job_title)) return false

  const nameLower = row.company_name.toLowerCase()
  const text = `${row.company_name} ${row.snippet ?? ''}`.toLowerCase()

  // 1. Yerel işletme sinyali varsa kesinlikle tut
  if (LOCAL_BIZ_PATTERN.test(text)) return true

  // 2. Bilinen büyük marka bloklist kontrolü
  for (const brand of LARGE_CO_BLOCKLIST) {
    if (nameLower.includes(brand.trim())) return false
  }

  // 3. Kurumsal yapı sinyali kontrolü
  if (CORPORATE_PATTERN.test(row.company_name)) return false

  // 4. Belirsiz → tut
  return true
}

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

// ─── Kariyer.net — Google Search aktörü üzerinden ────────────────────────────
//
// Eski `blackfalcondata~kariyer-scraper` aktörü tutarsız sonuçlar veriyordu.
// Yerine zaten kullandığımız `apify~google-search-scraper` aktörüyle
// `site:kariyer.net "<keyword>"` sorgusu çalıştırıyoruz.

const APIFY_GOOGLE_SEARCH_ACTOR = 'apify~google-search-scraper'

/** Kariyer.net başlığından şirket adı ve iş unvanını çıkarır.
 *
 * Desteklenen formatlar:
 *   "Şirket Adı - Pozisyon | kariyer.net"
 *   "Pozisyon - Şirket Adı | kariyer.net"
 *   "DD.MM.YYYY - Şirket Pozisyon İş İlanı | kariyer.net"
 *   "Şirket Pozisyon İş İlanı | kariyer.net"
 */
function parseKariyerTitle(
  title:   string,
  keyword: string,
): { company: string; jobTitle: string } {
  // 1. kariyer.net suffix'ini kaldır
  let cleaned = title.replace(/\s*\|?\s*kariyer\.net\s*$/i, '').trim()

  // 2. Tarih token'larını kaldır (DD.MM.YYYY formatı)
  cleaned = cleaned
    .replace(/\b\d{2}\.\d{2}\.\d{4}\b\s*[-–]?\s*/g, '')
    .replace(/\s*[-–]\s*$/, '')
    .trim()

  // 3. Tire/em-dash ile ayır; tarih gibi görünen parçaları filtrele
  const parts = cleaned
    .split(/\s*[-–]\s*/)
    .map(p => p.trim())
    .filter(p => p && !/^\d{2}\.\d{2}\.\d{4}$/.test(p))

  if (parts.length >= 2) {
    const kwWord = keyword.split(' ')[0].toLowerCase()
    if (parts[0].toLowerCase().includes(kwWord)) {
      return { jobTitle: parts[0], company: parts.slice(1).join(' - ') }
    }
    return { company: parts[0], jobTitle: parts.slice(1).join(' - ') }
  }

  // 4. Tek parça: keyword'ün başlangıç noktasında böl
  if (parts.length === 1) {
    const txt      = parts[0]
    const txtLower = txt.toLowerCase()
    const kwWord   = keyword.split(' ')[0].toLowerCase()
    const idx      = txtLower.indexOf(kwWord)

    if (idx > 2) {
      const company = txt.slice(0, idx).trim().replace(/[-–\s]+$/, '')
      // "İş İlanı" suffixini temizle
      const jobRaw  = txt.slice(idx).replace(/\s+[İi]ş\s+[İi]lan[ıi]\s*$/i, '').trim()
      if (company.length >= 2) return { company, jobTitle: jobRaw || keyword }
    }

    // Son çare: "İş İlanı" suffix'ini kırp, tamamını şirket adı say
    return {
      company:  txt.replace(/\s+[İi]ş\s+[İi]lan[ıi]\s*$/i, '').trim(),
      jobTitle: keyword,
    }
  }

  return { company: cleaned, jobTitle: keyword }
}

/** Şehir adını snippet veya başlıktan çıkarmaya çalışır */
function extractCity(text: string): string | null {
  const CITIES = [
    'İstanbul', 'Ankara', 'İzmir', 'Bursa', 'Antalya', 'Adana', 'Konya',
    'Gaziantep', 'Şanlıurfa', 'Kocaeli', 'Mersin', 'Diyarbakır', 'Hatay',
    'Manisa', 'Kayseri', 'Samsun', 'Balıkesir', 'Denizli', 'Eskişehir',
    'Sakarya', 'Erzurum', 'Malatya', 'Trabzon', 'Kahramanmaraş',
  ]
  for (const city of CITIES) {
    if (text.includes(city)) return city
  }
  return null
}

async function fetchKariyer(
  keyword: string,
  apifyToken: string,
): Promise<WarmLeadRow[]> {
  try {
    const res = await fetch(
      `https://api.apify.com/v2/acts/${APIFY_GOOGLE_SEARCH_ACTOR}/run-sync-get-dataset-items?token=${apifyToken}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queries:          `site:kariyer.net "${keyword}"`,
          maxPagesPerQuery: 2,
          resultsPerPage:   10,
          countryCode:      'tr',
          languageCode:     'tr',
        }),
        signal: AbortSignal.timeout(45_000),
      },
    )
    if (!res.ok) {
      console.error(`[kariyer] ${keyword}: HTTP ${res.status}`)
      return []
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: any[] = await res.json()
    if (!Array.isArray(raw)) return []

    const rows: WarmLeadRow[] = []
    for (const item of raw) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const organicResults: any[] = item.organicResults ?? []
      for (const r of organicResults) {
        const url: string = r.url ?? ''
        // Sadece kariyer.net iş ilanı URL'leri
        if (!url.includes('kariyer.net/is-ilani/')) continue

        const title: string = r.title ?? ''
        const snippet: string = r.description ?? ''

        const { company, jobTitle } = parseKariyerTitle(title, keyword)
        if (!company || company.length < 2) continue

        const combinedText = `${title} ${snippet}`
        const city = extractCity(combinedText)

        rows.push({
          source:       'kariyer',
          company_name: company,
          job_title:    jobTitle || keyword,
          city,
          posted_at:    null, // Google snippet tarih bilgisi güvenilmez
          job_url:      url,
          snippet:      snippet.slice(0, 300) || null,
        })
      }
    }

    console.log(`[kariyer] "${keyword}" → ${rows.length} ilan`)
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

  const allRaw = [
    ...kariyerResults.flat(),
    ...joobleResults.flat(),
  ]

  // ── Filtrele: büyük kurumsal şirketleri çıkar, yerel işletmeleri tut ──
  const allRows = allRaw.filter(shouldKeepLead)

  console.log(`[warm-leads] ham: ${allRaw.length} → filtre sonrası: ${allRows.length}`)

  if (allRows.length === 0) {
    return NextResponse.json({ inserted: 0, total: 0, filtered: allRaw.length })
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
    filtered_out: allRaw.length - allRows.length,
    sources: {
      kariyer: kariyerResults.flat().filter(shouldKeepLead).length,
      jooble:  joobleResults.flat().filter(shouldKeepLead).length,
    },
  })
}
