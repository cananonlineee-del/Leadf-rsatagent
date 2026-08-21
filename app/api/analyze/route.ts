import { type NextRequest } from 'next/server'
import { createClient as createServerSupabaseClient } from '../../../lib/supabase/server'

// ─── Rate Limit (kullanıcı başına dakikada 10 istek) ──────────────────────────
// Serverless ortamında her instance bağımsız çalışır; bu yüzden bu global Map
// yalnızca bir instance'ın memory'sini sınırlar. Auth kontrolüyle birlikte
// kullanıldığında yeterli bir birincil koruma sağlar.
const _rateLimit = new Map<string, { count: number; resetAt: number }>()

// ─── Types ────────────────────────────────────────────────────────────────────

interface Phase1Place {
  id: string
  displayName?: { text: string }
  formattedAddress?: string
  rating?: number
  userRatingCount?: number
  businessStatus?: string
  websiteUri?: string
}

interface Candidate {
  placeId: string
  name: string
  address: string
  rating?: number
  reviewCount: number
  businessStatus: string
  hasWebsite: boolean
}

interface PlaceDetailsV1 {
  nationalPhoneNumber?: string
  websiteUri?: string
  regularOpeningHours?: { weekdayDescriptions?: string[] }
  photos?: Array<{ name: string }>
  priceLevel?: string
  primaryType?: string
  googleMapsUri?: string
  reviews?: Array<{ rating?: number; publishTime?: string }>
  editorialSummary?: { text?: string }
}

export interface SiteAnalysis {
  ssl: boolean
  mobileScore: number | null
  /** Google PageSpeed masaüstü performans skoru (0-100) */
  desktopScore: number | null
  /** Lighthouse SEO skoru (0-100) — başlık, meta açıklama, canonical, hreflang vb. */
  lighthouseSeoScore: number | null
  /** Largest Contentful Paint — saniye cinsinden (≤2.5 iyi, ≤4 orta, >4 kötü) */
  lcp: number | null
  /** Cumulative Layout Shift — (≤0.1 iyi, ≤0.25 orta, >0.25 kötü) */
  cls: number | null
  /** Total Blocking Time — ms cinsinden (≤200 iyi, ≤600 orta, >600 kötü) */
  tbt: number | null
  hasPixel: boolean
  /** Gerçek Google Ads dönüşüm/yeniden pazarlama kodu (AW-, googleadservices, Ad Manager) */
  hasGoogleAds: boolean
  /** Google Analytics (GA4 G-ID, UA-ID, analytics.js) — reklam değil, ölçüm */
  hasAnalytics: boolean
  hasSocialLinks: boolean
  instagramHandle: string | null
  emailAddress: string | null
  hasCorpEmail: boolean | null
  hasWhatsApp: boolean
  hasClickablePhone: boolean
  hasBookingSystem: boolean
  hasContactForm: boolean
  hasLocalBusinessSchema: boolean
  pageTitle: string | null
  hasMetaDesc: boolean
  pageHasPhone: boolean
  facebookHandle: string | null
  tiktokHandle: string | null
  /** Online ödeme entegrasyonu (iyzico, PayTR, Stripe, WooCommerce vb.) */
  hasOnlinePayment: boolean
  /** Canlı chat / chatbot widget'ı (Tawk.to, Tidio, Intercom vb.) */
  hasLiveChat: boolean
  /** Google Tag Manager container */
  hasGTM: boolean
  /** E-posta bülteni / liste toplama widget'ı (Mailchimp, Klaviyo vb.) */
  hasNewsletter: boolean
  /** İletişim formunda telefon alanı var mı */
  contactFormHasPhone: boolean
  /** Sitedeki YouTube kanal URL'si */
  youtubeHandle: string | null
}

export interface InstagramData {
  handle: string
  followersCount: number | null
  postsCount: number | null
  bio: string | null
  lastPostDate: string | null
  isPrivate: boolean
  activity: 'active' | 'dormant' | 'neglected' | 'private' | 'unknown'
  /**
   * 'definitive' — site linkinden veya telefon eşleşmesiyle bulundu
   * 'likely'     — şehir + isim benzerliğiyle doğrulandı
   * 'possible'   — kısmi isim benzerliği; doğrulama önerilir
   */
  confidence: 'definitive' | 'likely' | 'possible'
  /** Güven seviyesinin nedeni */
  confidenceReason: string
  /** Haftalık ortalama paylaşım sayısı (latestPosts'tan hesaplanır; null = yetersiz veri) */
  weeklyPostFreq: number | null
  /** Reels içeriği kullanılıyor mu? (null = bilinmiyor) */
  usesReels: boolean | null
  /** (ortalama likes+comments) / followers × 100; null = yetersiz veri */
  engagementRate: number | null
  bioHasPhone: boolean
  bioHasUrl: boolean
  bioLength: number | null
}

/**
 * Sektör/kategori bazlı kanal ağırlık profili.
 * 1 = önemsiz, 5 = bu sektör için kritik.
 */
export interface CategoryProfile {
  website: number      // web sitesi varlığı/kalitesi
  googleReview: number // Google yorum sayısı + puan
  seo: number          // Google Business profil dolgunluğu
  instagram: number    // Instagram varlığı + aktivite
  ads: number          // Meta / Google Ads
}

export interface DomainInfo {
  /** Alan adının kayıt tarihi (ISO 8601) */
  registeredAt: string
  /** Tam yıl olarak domain yaşı */
  ageYears: number
}

export interface MetaAdData {
  hasActiveAds: boolean
  hasHistoricalAds: boolean
  activeAdCount: number
  totalAdCount: number
  /** En eski reklamın başlangıç tarihi (ISO) — Meta Ads yaşı hesabı için */
  oldestAdDate: string | null
  /**
   * 'definitive' — doğrulanmış Instagram köprüsüyle eşleştirildi
   * 'likely'     — işletme adı benzerliğiyle doğrulandı
   */
  confidence: 'definitive' | 'likely'
  /** Güven seviyesinin nedeni */
  confidenceReason: string
}

export interface FacebookData {
  handle: string
  pageUrl: string
  followersCount: number | null
  likesCount: number | null
  lastPostDate: string | null
  activity: 'active' | 'dormant' | 'neglected' | 'unknown'
  confidence: 'definitive' | 'likely' | 'possible'
  confidenceReason: string
}

export interface TikTokData {
  handle: string
  followersCount: number | null
  likesCount: number | null
  videosCount: number | null
  lastPostDate: string | null
  activity: 'active' | 'dormant' | 'neglected' | 'unknown'
  confidence: 'definitive' | 'likely' | 'possible'
  confidenceReason: string
}

export interface PlatformPresence {
  /** Yemeksepeti'nde listelenmiş mi — null = bu sektörde ilgisiz */
  yemeksepeti: boolean | null
  /** Getir veya Trendyol Yemek'te listelenmiş mi — null = bu sektörde ilgisiz */
  getir: boolean | null
  /** Tripadvisor veya Booking.com'da sayfası var mı — null = bu sektörde ilgisiz */
  tripadvisor: boolean | null
  /** Sahibinden / Hepsiburada / Trendyol'da mağazası var mı — null = bu sektörde ilgisiz */
  marketplace: boolean | null
  /**
   * Sektöre özgü online randevu platformunda listelenmiş mi — null = bu sektörde ilgisiz
   * Sağlık → doktortakvimi.com / randevu.com
   * Güzellik → treatwell.com / fresha.com / bookamat.com
   * Konaklama → booking.com (tripadvisor ile örtüşür, burası ayrı tutulur)
   * Diğer hizmet/eğitim → calendly / setmore
   */
  bookingPlatform: boolean | null
  /** YouTube kanal URL'si (site HTML'i veya Google Search'ten) */
  youtubeHandle: string | null
  /** Google yerel 3-paketinde (local pack) görünüyor mu */
  inLocalPack: boolean
  /** Google arama sonuçlarından çıkarılan e-posta adresi (site HTML'inden bulunamadıysa) */
  emailFromSearch: string | null
  /** LinkedIn şirket/profil URL'si */
  linkedinUrl: string | null
}

export interface Lead {
  placeId: string
  name: string
  address: string
  phone: string | null
  /** E-posta: site HTML'inden veya Google arama sonuçlarından birleştirilir */
  email: string | null
  website: string | null
  websiteSource: 'google' | 'discovered' | 'none'
  rating: number | null
  reviewCount: number
  businessStatus: string
  photoCount: number
  hasOpeningHours: boolean
  priceLevel: string | null
  primaryType: string | null
  googleMapsUri: string | null
  siteAnalysis: SiteAnalysis | null
  instagramHandle: string | null
  instagram: InstagramData | null
  facebookHandle: string | null
  facebook: FacebookData | null
  tiktokHandle: string | null
  tiktok: TikTokData | null
  metaAds: MetaAdData | null
  score: number
  odemeGucu: number
  acikSiddeti: number
  gaps: string[]
  pitch: string
  categoryProfile: CategoryProfile
  domainInfo: DomainInfo | null
  topCompetitor: { name: string; reviewCount: number; rating: number | null } | null
  lastReviewDate: string | null
  negativeReviewRate: number | null
  hasGoogleDescription: boolean
  /** Google Business profil tamamlanma skoru (0-100) */
  googleBusinessScore: number
  /** YouTube kanal URL'si (site HTML'i veya Google Search'ten) */
  youtubeHandle: string | null
  /** Teslimat / seyahat / marketplace platform varlığı */
  platforms: PlatformPresence | null
  /** "{sector} {city}" Google aramasında rakiplerin ücretli reklam verip vermediği */
  competitorGoogleAds: boolean | null
  _preScore: number
  _candidateCount: number
}

// ─── Phase 1 — Geniş, Ucuz Tarama ────────────────────────────────────────────

const PHASE1_FIELDS = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.rating',
  'places.userRatingCount',
  'places.businessStatus',
  'places.websiteUri',
].join(',')

async function fetchCandidates(
  query: string,
  apiKey: string,
): Promise<{ candidates: Candidate[]; pagesFetched: number }> {
  const allPlaces: Phase1Place[] = []
  let pageToken: string | undefined
  let pagesFetched = 0

  for (let page = 0; page < 3; page++) {
    const body: Record<string, unknown> = { textQuery: query, maxResultCount: 20 }
    if (pageToken) body.pageToken = pageToken

    let data: { places?: Phase1Place[]; nextPageToken?: string } = {}
    let fetchOk = false
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (attempt > 0) await new Promise<void>(r => setTimeout(r, 1000 * attempt))
        const res = await fetch(
          `https://places.googleapis.com/v1/places:searchText?key=${apiKey}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-FieldMask': PHASE1_FIELDS,
            },
            body: JSON.stringify(body),
            cache: 'no-store',
          },
        )
        data = await res.json()
        fetchOk = true
        break
      } catch {
        // retry
      }
    }
    if (!fetchOk) break

    const batch = data.places ?? []
    allPlaces.push(...batch)
    pagesFetched++

    if (!data.nextPageToken || batch.length < 20) break
    pageToken = data.nextPageToken
    if (page < 2) await new Promise<void>((r) => setTimeout(r, 1_000))
  }

  const candidates = allPlaces.map((p): Candidate => ({
    placeId: p.id,
    name: p.displayName?.text ?? '',
    address: p.formattedAddress ?? '',
    rating: p.rating,
    reviewCount: p.userRatingCount ?? 0,
    businessStatus: p.businessStatus ?? 'UNKNOWN',
    hasWebsite: !!p.websiteUri,
  }))

  return { candidates, pagesFetched }
}

// ─── Batch İstatistikleri — Rekabetçi Konum Sinyali ─────────────────────────

interface BatchStats {
  /** Toplu aramadaki işletmelerin yorum sayısı medyanı (outlier'a dayanıklı) */
  medianReviews: number
  /** Toplu aramadaki işletmelerin ortalama puanı */
  avgRating: number
}

/**
 * Tüm adayların yorum/puan istatistiklerini hesaplar.
 * Medyan kullanılır; tek bir büyük işletmenin etkisini sınırlar.
 */
function computeBatchStats(candidates: Candidate[]): BatchStats {
  const withReviews = candidates.filter(c => c.reviewCount > 0)
  const withRating = candidates.filter(c => c.rating !== undefined)

  const sorted = [...withReviews].sort((a, b) => a.reviewCount - b.reviewCount)
  const medianReviews = sorted.length > 0
    ? sorted[Math.floor(sorted.length / 2)].reviewCount
    : 0

  const avgRating = withRating.length > 0
    ? withRating.reduce((sum, c) => sum + (c.rating ?? 0), 0) / withRating.length
    : 0

  return { medianReviews, avgRating }
}

/**
 * Finalist ön eleme skoru.
 *
 * Hedef: "ödeme gücü olan (yorum/puan) AMA dijitalde geride kalmış" işletmeleri öne çıkar.
 *
 * Sinyaller:
 * 1. Yorum sayısı tiers — işletmenin oturmuşluğunu (ödeme gücünü) temsil eder
 * 2. Site yok / zayıf puan — dijital eksikliği temsil eder
 * 3. Rekabetçi konum (batch-relative) — aynı aramadaki rakiplerinin gerisinde kalıyorsa bonus
 *    → Sadece 10+ yorumu olan işletmelere uygulanır (düşük kapasiteli mikro işletmeleri filtreler)
 *
 * Maliyet: sıfır ek API çağrısı — zaten elimizdeki Phase 1 verisi kullanılır.
 */
function preScore(c: Candidate, stats?: BatchStats): number {
  if (c.businessStatus === 'CLOSED_PERMANENTLY') return 0
  let s = 0

  // ── 1. Yorum sayısı tiers (ödeme gücü proxy'si) ──
  if (c.reviewCount >= 500) s += 50
  else if (c.reviewCount >= 200) s += 42
  else if (c.reviewCount >= 100) s += 35
  else if (c.reviewCount >= 50) s += 27
  else if (c.reviewCount >= 20) s += 18
  else if (c.reviewCount >= 5) s += 10
  else s += 2

  // ── 2. Dijital eksiklik sinyalleri ──
  if (!c.hasWebsite) s += 35
  if (c.rating === undefined) s += 15
  else if (c.rating < 3.5) s += 20
  else if (c.rating < 4.0) s += 12

  // ── 3. Rekabetçi konum: batch ortalamasına göre geride kalan bonusu ──
  if (stats && c.reviewCount >= 10) {
    // Yorum sayısı gerisindeyse: "rakipler daha görünür"
    if (stats.medianReviews > 0) {
      if (c.reviewCount < stats.medianReviews * 0.6) s += 20 // belirgin geride
      else if (c.reviewCount < stats.medianReviews) s += 10   // biraz geride
    }
    // Puan gerisindeyse: "itibar açığı var"
    if (c.rating !== undefined && stats.avgRating > 0) {
      const gap = stats.avgRating - c.rating
      if (gap >= 0.5) s += 15       // belirgin itibar sorunu
      else if (gap >= 0.2) s += 7   // ortalama altı
    }
  }

  return s
}

// ─── Phase 2 — Sadece Finalistlere Detaylı Analiz ────────────────────────────

const DETAIL_FIELD_MASK = [
  'nationalPhoneNumber',
  'websiteUri',
  'regularOpeningHours',
  'photos',
  'priceLevel',
  'primaryType',
  'googleMapsUri',
  'reviews.rating',
  'reviews.publishTime',
  'editorialSummary.text',
].join(',')

async function fetchPlaceDetails(placeId: string, apiKey: string): Promise<PlaceDetailsV1> {
  try {
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${placeId}?key=${apiKey}`,
      { headers: { 'X-Goog-FieldMask': DETAIL_FIELD_MASK }, cache: 'no-store' },
    )
    return (await res.json()) as PlaceDetailsV1
  } catch {
    return {}
  }
}

// ─── Domain Tahmini ───────────────────────────────────────────────────────────

function normalizeDomainSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[ıİ]/g, 'i')
    .replace(/[şŞ]/g, 's')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[üÜ]/g, 'u')
    .replace(/[öÖ]/g, 'o')
    .replace(/[çÇ]/g, 'c')
    .replace(/[^a-z0-9]/g, '')
}

/** "Güzel Saç Kuaför" → "guzel-sac-kuafor" (tire'li versiyon) */
function normalizeDomainSlugHyphenated(name: string): string {
  return name
    .toLowerCase()
    .replace(/[ıİ]/g, 'i')
    .replace(/[şŞ]/g, 's')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[üÜ]/g, 'u')
    .replace(/[öÖ]/g, 'o')
    .replace(/[çÇ]/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function checkUrl(url: string): Promise<string | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 5_000)
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LeadAgent/1.0)' },
    })
    clearTimeout(timer)
    return res.status < 500 ? url : null
  } catch {
    clearTimeout(timer)
    return null
  }
}

async function guessAndCheckDomain(name: string): Promise<string | null> {
  const slug = normalizeDomainSlug(name)
  if (slug.length < 3) return null
  const hyphen = normalizeDomainSlugHyphenated(name)

  // Tüm varyasyonları paralel kontrol et
  const candidates: string[] = [
    `https://${slug}.com.tr`,
    `https://${slug}.com`,
    `https://${slug}.net.tr`,
    `https://${slug}.net`,
  ]
  // Tire'li slug concat ile aynıysa (tek kelime) tekrar ekleme
  if (hyphen !== slug) {
    candidates.push(
      `https://${hyphen}.com.tr`,
      `https://${hyphen}.com`,
      `https://${hyphen}.net.tr`,
    )
  }

  const results = await Promise.all(candidates.map(checkUrl))
  return results.find(r => r !== null) ?? null
}

/**
 * RDAP (ücretsiz WHOIS) aracılığıyla domain kayıt tarihini alır.
 * Ek ücret veya Apify gerektirmez.
 */
async function fetchDomainAge(domain: string): Promise<DomainInfo | null> {
  // Strip protocol and path, keep only the registrable domain
  const bare = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 6_000)
  try {
    const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(bare)}`, {
      signal: ctrl.signal,
      headers: { Accept: 'application/rdap+json' },
      cache: 'no-store',
    })
    clearTimeout(timer)
    if (!res.ok) return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await res.json() as any
    const events: Array<{ eventAction: string; eventDate: string }> = data.events ?? []
    const reg = events.find(e => e.eventAction === 'registration')
    if (!reg?.eventDate) return null
    const ageYears = Math.floor(
      (Date.now() - new Date(reg.eventDate).getTime()) / (1000 * 60 * 60 * 24 * 365.25),
    )
    return { registeredAt: reg.eventDate, ageYears }
  } catch {
    clearTimeout(timer)
    return null
  }
}

// ─── Site Analizi ─────────────────────────────────────────────────────────────

function extractInstagramHandle(html: string): string | null {
  const SYSTEM_PATHS = new Set([
    'p', 'reel', 'reels', 'explore', 'accounts', 'stories', 'tv', 'hashtag',
    'ar', 'about', 'legal', 'help', 'press', 'api', 'blog', 'jobs',
    'privacy', 'safety', 'terms', 'directory', 'challenge', 'badges',
    'business', 'creators', 'developer', 'download', 'lite', 'login',
    'signup', 'oauth', 'embed', 'features', 'transparencyreport',
  ])
  const re = /instagram\.com\/([a-zA-Z0-9._]{1,30})(?:\/|\?|#|"|'|\s|$)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const handle = m[1]
    if (!SYSTEM_PATHS.has(handle.toLowerCase())) return handle
  }
  return null
}

function extractFacebookHandle(html: string): string | null {
  const SYSTEM_PATHS = new Set([
    'sharer', 'share', 'dialog', 'groups', 'events', 'ads', 'business',
    'help', 'policies', 'privacy', 'legal', 'about', 'login', 'signup',
    'recover', 'messages', 'notifications', 'watch', 'marketplace',
    'stories', 'directory', 'pages', 'hashtag', 'gaming', 'video',
  ])
  const re = /facebook\.com\/([a-zA-Z0-9._-]{3,80})(?:\/|\?|#|"|'|\s|$)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const handle = m[1]
    if (!SYSTEM_PATHS.has(handle.toLowerCase()) && !handle.startsWith('profile.php')) {
      return handle
    }
  }
  return null
}

function extractTiktokHandle(html: string): string | null {
  const re = /tiktok\.com\/@([a-zA-Z0-9._-]{1,30})(?:\/|\?|#|"|'|\s|$)/g
  const m = re.exec(html)
  return m ? m[1] : null
}

/**
 * HTML'den ilk e-posta adresini çıkarır ve kurumsal olup olmadığını belirler.
 * Ücretsiz; ek API çağrısı gerektirmez.
 */
function extractEmailFromHtml(html: string): { emailAddress: string | null; hasCorpEmail: boolean | null } {
  const FREE_DOMAINS = new Set([
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com',
    'yandex.com', 'yandex.ru', 'icloud.com', 'me.com', 'windowslive.com',
    'msn.com', 'yahoo.com.tr', 'hotmail.com.tr', 'mynet.com', 'superonline.com',
  ])
  const emailRe = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g
  const match = emailRe.exec(html)
  if (!match) return { emailAddress: null, hasCorpEmail: null }
  const emailAddress = match[0].toLowerCase()
  const domain = emailAddress.split('@')[1]
  return { emailAddress, hasCorpEmail: !FREE_DOMAINS.has(domain) }
}

async function fetchSiteHtml(url: string): Promise<string> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 6_000)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LeadAgent/1.0)' },
    })
    clearTimeout(timer)
    return (await res.text()).slice(0, 60_000)
  } catch {
    clearTimeout(timer)
    return ''
  }
}

interface PageSpeedData {
  mobileScore: number | null
  desktopScore: number | null
  lighthouseSeoScore: number | null
  lcp: number | null   // saniye
  cls: number | null   // 0-∞
  tbt: number | null   // ms
}

/**
 * Mobil + masaüstü PageSpeed skorlarını, Lighthouse SEO skorunu ve
 * Core Web Vitals verilerini tek seferde paralel olarak çeker.
 * Mevcut Google Maps API anahtarı kullanılır — ek maliyet yok.
 */
async function fetchPageSpeedData(siteUrl: string, _apiKey: string): Promise<PageSpeedData> {
  const psKey = process.env.PAGESPEED_API_KEY ?? ''
  const base =
    `https://www.googleapis.com/pagespeedonline/v5/runPagespeed` +
    `?url=${encodeURIComponent(siteUrl)}${psKey ? `&key=${psKey}` : ''}`

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 28_000)

  const empty: PageSpeedData = {
    mobileScore: null, desktopScore: null,
    lighthouseSeoScore: null, lcp: null, cls: null, tbt: null,
  }

  try {
    const [mRes, dRes] = await Promise.all([
      fetch(`${base}&strategy=mobile&category=performance&category=seo`,  { signal: ctrl.signal, cache: 'no-store' }),
      fetch(`${base}&strategy=desktop&category=performance`, { signal: ctrl.signal, cache: 'no-store' }),
    ])
    clearTimeout(timer)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let md: any = {}
    if (mRes.ok) { md = await mRes.json() }
    else { const t = await mRes.text(); console.error('[PageSpeed] mobile error', mRes.status, t.slice(0, 200)) }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let dd: any = {}
    if (dRes.ok) { dd = await dRes.json() }
    else { const t = await dRes.text(); console.error('[PageSpeed] desktop error', dRes.status, t.slice(0, 200)) }

    const lr = md?.lighthouseResult
    const mobileScore = lr?.categories?.performance?.score != null
      ? Math.round(lr.categories.performance.score * 100) : null
    const lighthouseSeoScore = lr?.categories?.seo?.score != null
      ? Math.round(lr.categories.seo.score * 100) : null
    const lcpMs: number | null = lr?.audits?.['largest-contentful-paint']?.numericValue ?? null
    const clsRaw: number | null = lr?.audits?.['cumulative-layout-shift']?.numericValue ?? null
    const tbtRaw: number | null = lr?.audits?.['total-blocking-time']?.numericValue ?? null

    const desktopScore = dd?.lighthouseResult?.categories?.performance?.score != null
      ? Math.round(dd.lighthouseResult.categories.performance.score * 100) : null

    return {
      mobileScore,
      desktopScore,
      lighthouseSeoScore,
      lcp: lcpMs !== null ? Math.round(lcpMs) / 1000 : null,      // ms → saniye
      cls: clsRaw !== null ? Math.round(clsRaw * 100) / 100 : null, // 2 ondalık
      tbt: tbtRaw !== null ? Math.round(tbtRaw) : null,             // ms
    }
  } catch {
    clearTimeout(timer)
    return empty
  }
}

/**
 * Google Places'ten gelen websiteUri'nin gerçek bir web sitesi olup olmadığını kontrol eder.
 * WhatsApp, sosyal medya ve link-in-bio servisleri elenecek; domain araması yapılacak.
 */
function isRealWebsite(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase()
    const BLOCKED_HOSTS = new Set([
      'api.whatsapp.com', 'wa.me',
      'facebook.com', 'm.facebook.com',
      'instagram.com',
      'tiktok.com', 'vm.tiktok.com',
      'twitter.com', 'x.com',
      'youtube.com', 'youtu.be',
      'linkedin.com',
      'linktr.ee', 'taplink.cc', 'bio.link', 'beacons.ai',
    ])
    return !BLOCKED_HOSTS.has(host) && !Array.from(BLOCKED_HOSTS).some(b => host.endsWith('.' + b))
  } catch {
    return false
  }
}

async function analyzeSite(websiteUri: string, apiKey: string): Promise<SiteAnalysis> {
  const [html, pageSpeed] = await Promise.all([
    fetchSiteHtml(websiteUri),
    fetchPageSpeedData(websiteUri, apiKey),
  ])
  const { mobileScore, desktopScore, lighthouseSeoScore, lcp, cls, tbt } = pageSpeed
  // SSL: URL https ile başlıyor VE sayfa HTML döndürdü (boş = sertifika hatası)
  const ssl = websiteUri.startsWith('https://') && html.length > 0
  const { emailAddress, hasCorpEmail } = extractEmailFromHtml(html)
  const pageTitleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i)
  const pageTitle = pageTitleMatch ? (pageTitleMatch[1].trim() || null) : null

  // YouTube kanal linki
  const ytMatch = html.match(/(?:https?:\/\/(?:www\.)?youtube\.com\/(?:channel\/|@|c\/)([a-zA-Z0-9_.-]{2,100}))/i)
  const youtubeHandle = ytMatch ? ytMatch[0] : null

  // İletişim formunda telefon alanı var mı
  const formBlocks = html.match(/<form[\s\S]{0,3000}?<\/form>/gi) ?? []
  const contactFormHasPhone = formBlocks.some(f => /type=["']tel["']|name=["'][^"']*(?:tel|phone|telefon)[^"']*["']/i.test(f))

  return {
    ssl,
    mobileScore,
    desktopScore,
    lighthouseSeoScore,
    lcp,
    cls,
    tbt,
    hasPixel: /fbevents\.js|connect\.facebook\.net\/[a-z_]+\/fbevents|fbq\s*\(['"](?:track|init|trackCustom)/.test(html),
    // Gerçek Google Ads: dönüşüm ID (AW-), Google Ad Manager (pubads), Ads piksel (googleadservices)
    hasGoogleAds: /googleadservices\.com|googletag\.pubads\(\)|["']AW-\d{6,}["']/.test(html),
    // Google Analytics: GA4 ölçüm ID (G-), Universal Analytics (UA-), analytics.js
    hasAnalytics: /google-analytics\.com\/analytics\.js|["']G-[A-Z0-9]{6,}["']|["']UA-\d{4,}-\d/.test(html),
    hasSocialLinks: /href=["']https?:\/\/(?:www\.)?(?:instagram\.com|facebook\.com|twitter\.com|x\.com|tiktok\.com|linkedin\.com)/.test(html),
    instagramHandle: extractInstagramHandle(html),
    emailAddress,
    hasCorpEmail,
    hasWhatsApp: /wa\.me\/|api\.whatsapp\.com\/send/.test(html),
    hasClickablePhone: /href=["']tel:/i.test(html),
    hasBookingSystem: /planity|fresha|treatwell|calendly|setmore|doktortakvimi|bookamat|randevu\.com|simplybook|bookeo|acuityscheduling|appointy|mindbody|phorest|salonized|timely\.app|rezervasyon/i.test(html),
    // İletişim formu: "iletisim", "contact", "mesaj" içeren form veya textarea + submit kombinasyonu
    hasContactForm: /<form[^>]*(?:contact|iletisim|mesaj|form)[^>]*>[\s\S]{0,3000}?(?:textarea|<input[^>]*type=["'](?:text|email|tel))/i.test(html),
    hasLocalBusinessSchema: /"@type"\s*:\s*["']LocalBusiness["']/.test(html),
    pageTitle,
    hasMetaDesc: /<meta\s[^>]*name=["']description["'][^>]*content=["']([^"']{10,})/i.test(html),
    pageHasPhone: /(?<!\d)(?:\+?(?:00)?90[\s.\-]?|0)?(?:5\d{2}|[234]\d{2})[\s.\-]?\d{3}[\s.\-]?\d{2}[\s.\-]?\d{2}(?!\d)/.test(html),
    facebookHandle: extractFacebookHandle(html),
    tiktokHandle: extractTiktokHandle(html),
    hasOnlinePayment: /iyzico|paytr|stripe\.com\/v|woocommerce|shopify|iyzipay|payu\.com|paygate|param\.com\.tr|craftgate|papara|nkolay|vallet\.com\.tr|sipay\.com\.tr|tosla/i.test(html),
    hasLiveChat: /tawk\.to|tidio|intercom\.io|drift\.com|livechatinc|crisp\.chat|olark|zopim|freshchat|userlike|jivochat|smartsupp|chatra\.io|liveagent|customerly/i.test(html),
    hasGTM: /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]{4,}/i.test(html),
    hasNewsletter: /mailchimp|klaviyo|getresponse|mailerlite|sendinblue|brevo|convertkit|list-manage\.com|activehosted|sendpulse|omnisend|moosend|drip\.com|aweber|constantcontact|iletimerkezi/i.test(html),
    contactFormHasPhone,
    youtubeHandle,
  }
}

// ─── Instagram Arama & Çapraz Doğrulama ──────────────────────────────────────

/** Türkçe karakter normalizasyonu — boşlukları korur (domain slug'dan farklı) */
function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ıİ]/g, 'i')
    .replace(/[şŞ]/g, 's')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[üÜ]/g, 'u')
    .replace(/[öÖ]/g, 'o')
    .replace(/[çÇ]/g, 'c')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Ülke kodu ve sıfırı kaldırarak saf hane normalizer */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('90') && digits.length > 10) return digits.slice(2)
  if (digits.startsWith('0')) return digits.slice(1)
  return digits
}

/** Bio metninden Türkçe telefon numaralarını çıkarır */
function extractPhonesFromBio(bio: string): string[] {
  const matches = bio.match(
    /(?:\+?(?:00)?90[\s.\-]?|0)?(?:5\d{2})[\s.\-]?\d{3}[\s.\-]?\d{2}[\s.\-]?\d{2}/g,
  )
  return (matches ?? []).map(m => normalizePhone(m)).filter(p => p.length >= 9)
}

/**
 * Sabitlenmiş (pinned) gönderileri filtreler ve tarih'e göre azalan sıraya dizer.
 *
 * Apify instagram-profile-scraper sabitlenmiş gönderileri dizinin başına koyar;
 * bu yüzden post[0].timestamp yanlış (eski) bir "son gönderi" tarihi verir.
 * Filtre + sıralama ikili güvence sağlar:
 *   1. isPinned/pinned/is_pinned alanlarından herhangi biri true → at
 *   2. Kalan gönderiler timestamp'e göre azalan sıraya dizilir → gerçek en yeni önce
 */
function preparePostsArray(posts: unknown[]): unknown[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = (p: unknown) => p as any

  const unpinned = posts.filter(p => {
    const x = a(p)
    return !x?.isPinned && !x?.pinned && !x?.is_pinned
  })

  // Pinned field hiç yoksa veya hepsi filtrelendiyse orijinali kullan (güvenlik ağı)
  const pool = unpinned.length > 0 ? unpinned : posts

  return pool.slice().sort((pa, pb) => {
    const tsA = a(pa)?.timestamp ?? a(pa)?.taken_at_timestamp ?? 0
    const tsB = a(pb)?.timestamp ?? a(pb)?.taken_at_timestamp ?? 0
    const msA = typeof tsA === 'number' ? tsA * 1000 : new Date(String(tsA)).getTime()
    const msB = typeof tsB === 'number' ? tsB * 1000 : new Date(String(tsB)).getTime()
    return msB - msA  // azalan: en yeni önce
  })
}

/** Son gönderi tarihini latestPosts dizisinden çıkarır (pinned gönderi dışlanmış, sıralı) */
function extractLastPostDate(posts: unknown[]): string | null {
  if (!posts.length) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ts = (posts[0] as any)?.timestamp ?? (posts[0] as any)?.taken_at_timestamp
  if (typeof ts === 'number') return new Date(ts * 1000).toISOString()
  if (typeof ts === 'string') return new Date(ts).toISOString()
  return null
}

// ─── Instagram — Google Search ile Keşif ─────────────────────────────────────

// ─── Google Custom Search API ─────────────────────────────────────────────────

interface GSearchResult { url: string; title: string; description: string }

/**
 * Google Custom Search API üzerinden arama yapar.
 * Apify Google Search Scraper'ın yerine — ücretsiz (günde 100 sorgu), ~5× daha hızlı.
 * Requires: GOOGLE_CSE_KEY + GOOGLE_CSE_CX env vars.
 */
async function googleCSESearch(
  query: string,
  key: string,
  cx: string,
  num = 10,
): Promise<GSearchResult[]> {
  if (!key || !cx) return []
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 10_000)
  try {
    const res = await fetch(
      `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(key)}&cx=${encodeURIComponent(cx)}&q=${encodeURIComponent(query)}&num=${Math.min(num, 10)}&gl=tr&hl=tr`,
      { signal: ctrl.signal, cache: 'no-store' },
    )
    clearTimeout(timer)
    if (!res.ok) {
      console.error(`[CSE] "${query.slice(0, 60)}" HTTP ${res.status}`)
      return []
    }
    const data = await res.json() as { items?: Array<{ title: string; link: string; snippet: string }> }
    return (data.items ?? []).map(i => ({ url: i.link ?? '', title: i.title ?? '', description: i.snippet ?? '' }))
  } catch (err) {
    clearTimeout(timer)
    console.error(`[CSE] "${query.slice(0, 60)}" catch:`, err instanceof Error ? err.message : err)
    return []
  }
}

/** Google Search snippet'inden yaklaşık beğeni/like sayısını ayrıştırmaya çalışır (Facebook) */
function parseLikesFromSnippet(text: string): number | null {
  // "1,234 people like this" / "1.2K people like this"
  const peopleMatch = text.match(/(\d[\d,.]*)([KkMm]?)\s+people\s+like/)
  if (peopleMatch) {
    const num = parseFloat(peopleMatch[1].replace(/,/g, ''))
    if (!isNaN(num)) {
      const mult = peopleMatch[2].toLowerCase()
      if (mult === 'k') return Math.round(num * 1_000)
      if (mult === 'm') return Math.round(num * 1_000_000)
      return Math.round(num)
    }
  }
  // "1,234 Likes" / "1.2K Likes"
  const likesMatch = text.match(/(\d[\d,.]*)([KkMm]?)\s+[Ll]ikes?/)
  if (likesMatch) {
    const num = parseFloat(likesMatch[1].replace(/,/g, ''))
    if (!isNaN(num)) {
      const mult = likesMatch[2].toLowerCase()
      if (mult === 'k') return Math.round(num * 1_000)
      if (mult === 'm') return Math.round(num * 1_000_000)
      return Math.round(num)
    }
  }
  return null
}

/** Google Search snippet'inden yaklaşık takipçi sayısını ayrıştırmaya çalışır */
function parseFollowersFromSnippet(text: string): number | null {
  // İngilizce: "1.2K Followers" veya "1,234 followers"
  const engMatch = text.match(/(\d[\d,.]*)([KkMm]?)\s+[Ff]ollowers?/)
  if (engMatch) {
    const num = parseFloat(engMatch[1].replace(/,/g, ''))
    if (!isNaN(num)) {
      const mult = engMatch[2].toLowerCase()
      if (mult === 'k') return Math.round(num * 1_000)
      if (mult === 'm') return Math.round(num * 1_000_000)
      return Math.round(num)
    }
  }
  // Türkçe: "1.234 takipçi"
  const trMatch = text.match(/(\d[\d.]+)\s+takipçi/)
  if (trMatch) {
    const n = parseInt(trMatch[1].replace(/\./g, ''))
    return isNaN(n) ? null : n
  }
  return null
}

/** Google Search snippet'inden son paylaşım tarihini yaklaşık olarak çıkarır */
function parseLastPostDateFromSnippet(text: string): string | null {
  const now = Date.now()

  // Türkçe göreceli tarihler
  const trDay = text.match(/(\d+)\s+gün\s+önce/i)
  if (trDay) return new Date(now - parseInt(trDay[1]) * 86_400_000).toISOString()

  const trWeek = text.match(/(\d+)\s+hafta\s+önce/i)
  if (trWeek) return new Date(now - parseInt(trWeek[1]) * 7 * 86_400_000).toISOString()

  const trMonth = text.match(/(\d+)\s+ay\s+önce/i)
  if (trMonth) return new Date(now - parseInt(trMonth[1]) * 30 * 86_400_000).toISOString()

  const trYear = text.match(/(\d+)\s+yıl\s+önce/i)
  if (trYear) return new Date(now - parseInt(trYear[1]) * 365 * 86_400_000).toISOString()

  if (/\bdün\b/i.test(text)) return new Date(now - 86_400_000).toISOString()

  // İngilizce göreceli tarihler
  const enDay = text.match(/(\d+)\s+days?\s+ago/i)
  if (enDay) return new Date(now - parseInt(enDay[1]) * 86_400_000).toISOString()

  const enWeek = text.match(/(\d+)\s+weeks?\s+ago/i)
  if (enWeek) return new Date(now - parseInt(enWeek[1]) * 7 * 86_400_000).toISOString()

  const enMonth = text.match(/(\d+)\s+months?\s+ago/i)
  if (enMonth) return new Date(now - parseInt(enMonth[1]) * 30 * 86_400_000).toISOString()

  const enYear = text.match(/(\d+)\s+years?\s+ago/i)
  if (enYear) return new Date(now - parseInt(enYear[1]) * 365 * 86_400_000).toISOString()

  if (/\byesterday\b/i.test(text)) return new Date(now - 86_400_000).toISOString()

  // Türkçe mutlak tarihler: "16 Ağustos 2024", "3 Ocak 2025"
  const TR_MONTHS: Record<string, number> = {
    ocak: 0, şubat: 1, mart: 2, nisan: 3, mayis: 4, mayıs: 4,
    haziran: 5, temmuz: 6, agustos: 7, ağustos: 7, eylul: 8, eylül: 8,
    ekim: 9, kasim: 10, kasım: 10, aralik: 11, aralık: 11,
  }
  const absDate = text.match(/(\d{1,2})\s+([\wşğüöçıİŞĞÜÖÇ]+)\s+(20\d{2})/i)
  if (absDate) {
    const monthKey = absDate[2].toLowerCase()
    const monthIdx = TR_MONTHS[monthKey]
    if (monthIdx !== undefined) {
      const d = new Date(parseInt(absDate[3]), monthIdx, parseInt(absDate[1]))
      if (!isNaN(d.getTime())) return d.toISOString()
    }
  }

  return null
}

/**
 * Google Search sonucundan çıkarılan handle'ı işletme verisiyle doğrular.
 *
 * Güven seviyeleri:
 *   definitive — telefon numarası snippet/başlıkta eşleşti
 *   likely     — şehir + güçlü isim benzerliği (≥ %50 kelime)
 *   possible   — kısmi isim benzerliği (≥ %30) veya handle eşleşmesi; doğrulama önerilir
 *   null       — hiçbir makul ipucu yok, reddedildi
 */
function validateGoogleSearchCandidate(
  handle: string,
  title: string,
  snippet: string,
  businessName: string,
  cityQuery: string,
  phone: string | null,
): { confidence: 'definitive' | 'likely' | 'possible'; reason: string } | null {
  const rawText = `${title} ${snippet}`
  const combined = normalizeForComparison(rawText)
  const normHandle = normalizeForComparison(handle.replace(/[._]/g, ' '))
  const businessWords = normalizeForComparison(businessName).split(' ').filter(w => w.length >= 3)

  // ── Sinyal 1: Telefon eşleşmesi (en güçlü kanıt) ──
  if (phone) {
    const snippetPhones = extractPhonesFromBio(rawText)
    const normPhone = normalizePhone(phone)
    const hit = snippetPhones.some(bp => {
      const len = Math.min(normPhone.length, bp.length, 8)
      return len >= 7 && normPhone.slice(-len) === bp.slice(-len)
    })
    if (hit) return { confidence: 'definitive', reason: 'Telefon numarası arama sonucunda eşleşti' }
  }

  // ── İsim benzerliği: hem combined metin hem handle ──
  const matchedInText   = businessWords.filter(w => combined.includes(w))
  const matchedInHandle = businessWords.filter(w => normHandle.includes(w))
  const textSim   = businessWords.length > 0 ? matchedInText.length   / businessWords.length : 0
  const handleSim = businessWords.length > 0 ? matchedInHandle.length / businessWords.length : 0
  const bestSim   = Math.max(textSim, handleSim)

  // ── Sinyal 2: Güçlü handle benzerliği (şehir bağımsız) ──
  if (handleSim >= 0.6) {
    return { confidence: 'likely', reason: `Handle güçlü isim benzerliği (%${Math.round(handleSim * 100)})` }
  }

  // ── Sinyal 3: Şehir/ilçe + isim benzerliği ──
  const cityParts = normalizeForComparison(cityQuery).split(' ').filter(w => w.length >= 4)
  const cityMatched = cityParts.find(p => combined.includes(p))
  if (cityMatched && bestSim >= 0.4) {
    const label = cityMatched.charAt(0).toUpperCase() + cityMatched.slice(1)
    return { confidence: 'likely', reason: `${label} + isim benzerliği eşleşti` }
  }

  // ── Sinyal 4: Güçlü metin benzerliği (şehir bağımsız) ──
  if (textSim >= 0.5) {
    return { confidence: 'likely', reason: `Metin güçlü isim benzerliği (%${Math.round(textSim * 100)})` }
  }

  // ── Sinyal 5: Kısmi eşleşme → tahmini (doğrulama önerilir) ──
  if (bestSim >= 0.25) {
    const source = handleSim >= textSim ? 'handle' : 'arama metni'
    return { confidence: 'possible', reason: `Kısmi isim benzerliği (${source}) — doğrulayın` }
  }

  return null // Reddedildi
}

/**
 * Apify Google Search ile "{işletme adı} {şehir} instagram" aratır.
 * Bulunan instagram.com linklerini validate ederek InstagramData döner.
 *
 * Ek Instagram profil çağrısı yapmaz — sadece snippet/başlık verisi kullanılır.
 * Aktivite/gönderi verisi olmadığından activity: 'unknown' olur; bu dürüsttür.
 */
async function googleSearchInstagram(
  businessName: string,
  cityQuery: string,
  phone: string | null,
  cseKey: string,
  cseCx: string,
  apifyToken: string | null,
): Promise<InstagramData | null> {
  try {
    const results = await googleCSESearch(`${businessName} ${cityQuery} instagram`, cseKey, cseCx, 10)
    if (results.length === 0) return null

    console.log(`[IG SEARCH] "${businessName}" → ${results.length} total results, ${results.filter(r => r.url.includes('instagram.com')).length} IG URLs`)

    // instagram.com URL'lerinden handle çıkar, doğrula
    const IG_URL_RE = /instagram\.com\/([a-zA-Z0-9._]{1,30})(?:\/|\?|#|$)/
    const SYSTEM_PATHS = new Set([
      'p', 'reel', 'reels', 'explore', 'accounts', 'stories', 'tv', 'hashtag',
      'ar', 'about', 'legal', 'help', 'press', 'login', 'signup', 'oauth',
      'embed', 'features', 'business', 'creators', 'developer', 'download',
    ])

    for (const result of results) {
      const m = IG_URL_RE.exec(result.url)
      if (!m) continue
      const handle = m[1]
      if (SYSTEM_PATHS.has(handle.toLowerCase())) continue

      const validation = validateGoogleSearchCandidate(
        handle, result.title, result.description,
        businessName, cityQuery, phone,
      )
      if (!validation) {
        console.log(`[IG SEARCH] @${handle} rejected — title="${result.title.slice(0, 60)}"`)
        continue
      }

      console.log(`[IG SEARCH] @${handle} validated (${validation.confidence}) — fetching profile for activity...`)
      // Handle bulundu; gerçek aktivite verisini almak için profil scraper'ı çağır
      const profile = apifyToken
        ? await fetchInstagramProfile(handle, apifyToken, validation.confidence, validation.reason)
        : null
      if (profile) {
        console.log(`[IG SEARCH] @${handle} profile fetched — activity=${profile.activity} lastPost=${profile.lastPostDate ?? 'null'}`)
        return profile
      }
      // Profil fetch başarısız → snippet verisine geri dön
      const combinedText = `${result.title} ${result.description}`
      console.log(`[IG SEARCH] @${handle} profile fetch failed — returning snippet-only (activity=unknown)`)
      return {
        handle,
        followersCount: parseFollowersFromSnippet(combinedText),
        postsCount: null,
        bio: result.description || null,
        lastPostDate: null,
        isPrivate: false,
        activity: 'unknown',
        confidence: validation.confidence,
        confidenceReason: validation.reason,
        weeklyPostFreq: null,
        usesReels: null,
        engagementRate: null,
        bioHasPhone: false,
        bioHasUrl: false,
        bioLength: null,
      }
    }

    return null // Hiçbir IG linki doğrulanamadı
  } catch (err) {
    console.error(`[IG SEARCH] "${businessName}" catch:`, err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * Fallback: site:instagram.com arama ile direkt Instagram sayfası bul.
 * Ana arama başarısız olduğunda, Google'ın Instagram index'i üzerinden
 * işletme adıyla doğrudan arama yapar — çok daha yüksek recall.
 */
async function googleSearchInstagramFallback(
  businessName: string,
  phone: string | null,
  cseKey: string,
  cseCx: string,
  apifyToken: string | null,
): Promise<InstagramData | null> {
  try {
    const results = await googleCSESearch(`site:instagram.com "${businessName}"`, cseKey, cseCx, 5)
    if (results.length === 0) return null

    console.log(`[IG FALLBACK] "${businessName}" site:instagram.com → ${results.length} results`)

    const IG_URL_RE = /instagram\.com\/([a-zA-Z0-9._]{1,30})(?:\/|\?|#|$)/
    const SYSTEM_PATHS = new Set(['p', 'reel', 'reels', 'explore', 'accounts', 'stories', 'tv', 'hashtag', 'ar', 'about', 'legal', 'help', 'press', 'login', 'signup', 'oauth', 'embed', 'features', 'business', 'creators', 'developer', 'download'])

    for (const result of results) {
      const m = IG_URL_RE.exec(result.url)
      if (!m) continue
      const handle = m[1]
      if (SYSTEM_PATHS.has(handle.toLowerCase())) continue

      // site:instagram.com arama zaten Instagram sayfalarını döndürür;
      // doğrulama daha permissive — ilk sonuç en alakalı
      const validation = validateGoogleSearchCandidate(handle, result.title, result.description, businessName, '', phone)
      const confidence = validation?.confidence ?? 'possible'
      const reason = validation?.reason ?? 'site:instagram.com aramasında ilk sonuç'

      console.log(`[IG FALLBACK] @${handle} → confidence=${confidence}`)
      const profile = apifyToken
        ? await fetchInstagramProfile(handle, apifyToken, confidence, reason)
        : null
      if (profile) return profile

      // Profil çekilemedi → snippet verisi ile dön
      return {
        handle,
        followersCount: parseFollowersFromSnippet(`${result.title} ${result.description}`),
        postsCount: null,
        bio: result.description || null,
        lastPostDate: null,
        isPrivate: false,
        activity: 'unknown',
        confidence,
        confidenceReason: reason,
        weeklyPostFreq: null,
        usesReels: null,
        engagementRate: null,
        bioHasPhone: false,
        bioHasUrl: false,
        bioLength: null,
      }
    }
    return null
  } catch {
    return null
  }
}

// ─── Apify — Instagram Profil (site linkinden bulunanlar için) ────────────────

/**
 * Mevcut `latestPosts` dizisinden haftalık paylaşım sıklığı ve Reels kullanımını hesaplar.
 * Ek Apify çağrısı gerektirmez — profil scraper'ın döndürdüğü veriyle çalışır.
 */
function analyzeInstagramPosts(
  posts: unknown[],
  followersCount: number | null,
): { weeklyPostFreq: number | null; usesReels: boolean | null; engagementRate: number | null } {
  if (posts.length === 0) return { weeklyPostFreq: null, usesReels: null, engagementRate: null }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = (p: unknown) => p as any

  // Reels tespiti: type, productType veya videoViewCount varlığı
  const usesReels = posts.some(p => {
    const x = a(p)
    return x.type === 'Video' || x.productType === 'clips' || x.videoViewCount != null
  })

  // Etkileşim oranı hesapla
  let engagementRate: number | null = null
  if (followersCount != null && followersCount > 0) {
    const totalInteractions = posts.reduce<number>((sum, p) => {
      const x = a(p)
      return sum + (x.likesCount ?? 0) + (x.commentsCount ?? 0)
    }, 0)
    engagementRate = Math.round((totalInteractions / posts.length / followersCount) * 1000) / 10
  }

  // Zaman damgalarını topla
  const dates: Date[] = []
  for (const p of posts) {
    const x = a(p)
    const ts = x.timestamp ?? x.taken_at_timestamp
    if (typeof ts === 'number') dates.push(new Date(ts * 1000))
    else if (typeof ts === 'string' && ts) dates.push(new Date(ts))
  }

  if (dates.length < 2) return { weeklyPostFreq: null, usesReels, engagementRate }

  dates.sort((x, y) => x.getTime() - y.getTime())
  const rangeWeeks =
    (dates[dates.length - 1].getTime() - dates[0].getTime()) / (7 * 24 * 60 * 60 * 1000)
  if (rangeWeeks < 0.5) return { weeklyPostFreq: null, usesReels, engagementRate }

  const weeklyPostFreq = Math.round((dates.length / rangeWeeks) * 10) / 10
  return { weeklyPostFreq, usesReels, engagementRate }
}

function classifyActivity(lastPostDate: string | null): 'active' | 'dormant' | 'neglected' | 'unknown' {
  if (!lastPostDate) return 'unknown'
  const daysSince = (Date.now() - new Date(lastPostDate).getTime()) / 86_400_000
  if (daysSince <= 30) return 'active'
  if (daysSince <= 90) return 'dormant'
  return 'neglected'
}

function classifyInstagramActivity(
  isPrivate: boolean,
  lastPostDate: string | null,
): InstagramData['activity'] {
  if (isPrivate) return 'private'
  return classifyActivity(lastPostDate)
}

async function fetchInstagramProfile(
  handle: string,
  token: string,
  confidence: InstagramData['confidence'],
  confidenceReason: string,
): Promise<InstagramData | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 30_000)
  try {
    const res = await fetch(
      `https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items?token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernames: [handle] }),
        signal: ctrl.signal,
        cache: 'no-store',
      },
    )
    clearTimeout(timer)
    if (!res.ok) return null

    const items: unknown[] = await res.json()
    console.log(`[IG PROFILE] @${handle} → ${items.length} item(s) returned`)
    if (!Array.isArray(items) || items.length === 0) return null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = items[0] as any
    const rawPostsArr: unknown[] = p.latestPosts ?? p.timeline?.posts ?? []
    const latestPostsArr = preparePostsArray(rawPostsArr)
    const pinnedCount = rawPostsArr.length - latestPostsArr.length
    console.log(
      `[IG PROFILE] @${handle} → followersCount=${p.followersCount ?? 'n/a'}` +
      ` postsCount=${p.postsCount ?? p.mediaCount ?? 'n/a'}` +
      ` rawPosts=${rawPostsArr.length} pinnedFiltered=${pinnedCount}` +
      ` isPrivate=${p.isPrivate ?? 'n/a'}`,
    )
    const isPrivate: boolean = p.isPrivate ?? false
    const lastPostDate = extractLastPostDate(latestPostsArr)
    const { weeklyPostFreq, usesReels, engagementRate } = analyzeInstagramPosts(latestPostsArr, p.followersCount ?? null)
    console.log(`[IG PROFILE] @${handle} → lastPostDate=${lastPostDate ?? 'null'} activity=${classifyInstagramActivity(isPrivate, lastPostDate)} weeklyFreq=${weeklyPostFreq ?? 'n/a'} reels=${usesReels ?? 'n/a'} engagementRate=${engagementRate ?? 'n/a'}`)

    const bio: string | null = p.biography ?? p.bio ?? null
    const bioHasPhone = bio ? extractPhonesFromBio(bio).length > 0 : false
    const bioHasUrl   = bio ? /https?:\/\/|www\./i.test(bio) : false
    const bioLength   = bio !== null ? bio.length : null
    return {
      handle,
      followersCount: p.followersCount ?? null,
      postsCount: p.postsCount ?? p.mediaCount ?? null,
      bio,
      lastPostDate,
      isPrivate,
      activity: classifyInstagramActivity(isPrivate, lastPostDate),
      confidence,
      confidenceReason,
      weeklyPostFreq,
      usesReels,
      engagementRate,
      bioHasPhone,
      bioHasUrl,
      bioLength,
    }

  } catch {
    clearTimeout(timer)
    return null
  }
}

// ─── Facebook — snippet-only (ücretsiz) ──────────────────────────────────────

async function googleSearchFacebook(
  businessName: string,
  cityQuery: string,
  phone: string | null,
  cseKey: string,
  cseCx: string,
): Promise<FacebookData | null> {
  try {
    const results = await googleCSESearch(`${businessName} ${cityQuery} facebook`, cseKey, cseCx, 10)
    if (results.length === 0) return null

    const FB_URL_RE = /facebook\.com\/([a-zA-Z0-9._-]{3,80})(?:\/|\?|#|$)/
    const FB_SYSTEM = new Set([
      'sharer', 'share', 'dialog', 'ads', 'business', 'help', 'policies',
      'privacy', 'legal', 'about', 'login', 'signup', 'pages', 'groups', 'events', 'watch',
    ])

    console.log(`[FB SEARCH] "${businessName}" → ${results.length} total results, ${results.filter(r => r.url.includes('facebook.com')).length} FB URLs`)

    for (const result of results) {
      const m = FB_URL_RE.exec(result.url)
      if (!m) continue
      const handle = m[1]
      if (FB_SYSTEM.has(handle.toLowerCase())) continue

      const validation = validateGoogleSearchCandidate(
        handle, result.title, result.description, businessName, cityQuery, phone,
      )
      if (!validation) {
        console.log(`[FB SEARCH] @${handle} rejected — title="${result.title.slice(0, 60)}"`)
        continue
      }

      // Snippet'ten takipçi, beğeni ve son paylaşım tarihini çözümle (ek Apify çağrısı yok)
      const combinedText = `${result.title} ${result.description}`
      const followersCount = parseFollowersFromSnippet(combinedText)
      const likesCount = parseLikesFromSnippet(combinedText)
      const lastPostDate = parseLastPostDateFromSnippet(combinedText)
      const activity = classifyActivity(lastPostDate)

      console.log(`[FB SEARCH] @${handle} validated (${validation.confidence}) followers=${followersCount ?? 'n/a'} likes=${likesCount ?? 'n/a'} lastPost=${lastPostDate ?? 'n/a'} activity=${activity}`)
      return {
        handle,
        pageUrl: `https://www.facebook.com/${handle}`,
        followersCount,
        likesCount,
        lastPostDate,
        activity,
        confidence: validation.confidence,
        confidenceReason: validation.reason,
      }
    }
    return null
  } catch (err) {
    console.error(`[FB SEARCH] "${businessName}" catch:`, err instanceof Error ? err.message : err)
    return null
  }
}

// ─── Apify — TikTok Profil Verisi ────────────────────────────────────────────

const APIFY_TIKTOK_ACTOR = 'clockworks~free-tiktok-scraper'

async function fetchTiktokProfile(
  handle: string,
  token: string,
  confidence: TikTokData['confidence'],
  confidenceReason: string,
): Promise<TikTokData | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 35_000)
  try {
    const res = await fetch(
      `https://api.apify.com/v2/acts/${APIFY_TIKTOK_ACTOR}/run-sync-get-dataset-items?token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profiles: [handle],
          resultsPerPage: 5,
        }),
        signal: ctrl.signal,
        cache: 'no-store',
      },
    )
    clearTimeout(timer)
    if (!res.ok) return null
    const items: unknown[] = await res.json()
    if (!Array.isArray(items) || items.length === 0) return null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const first = items[0] as any
    // authorMeta varsa video listesi, yoksa doğrudan profil objesi
    const meta = first.authorMeta ?? first

    const followersCount: number | null = meta.fans ?? meta.followersCount ?? meta.followers ?? null
    const likesCount: number | null     = meta.heart ?? meta.hearts ?? meta.diggCount ?? null
    const videosCount: number | null    = meta.video ?? meta.videoCount ?? meta.videos ?? null

    // Son video tarihi
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createTimes = (items as any[])
      .map(v => v.createTime ?? v.createTimeISO)
      .filter(Boolean)
      .sort((a, b) => {
        const msA = typeof a === 'number' ? a * 1000 : new Date(String(a)).getTime()
        const msB = typeof b === 'number' ? b * 1000 : new Date(String(b)).getTime()
        return msB - msA
      })

    let lastPostDate: string | null = null
    if (createTimes.length > 0) {
      const latest = createTimes[0]
      lastPostDate = typeof latest === 'number'
        ? new Date(latest * 1000).toISOString()
        : new Date(String(latest)).toISOString()
    }

    console.log(`[TT PROFILE] @${handle} → followers=${followersCount ?? 'n/a'} likes=${likesCount ?? 'n/a'} videos=${videosCount ?? 'n/a'} lastPost=${lastPostDate ?? 'null'}`)
    return {
      handle,
      followersCount,
      likesCount,
      videosCount,
      lastPostDate,
      activity: classifyActivity(lastPostDate),
      confidence,
      confidenceReason,
    }
  } catch {
    clearTimeout(timer)
    return null
  }
}

async function googleSearchTiktok(
  businessName: string,
  cityQuery: string,
  phone: string | null,
  cseKey: string,
  cseCx: string,
  apifyToken: string | null,
): Promise<TikTokData | null> {
  try {
    const results = await googleCSESearch(`${businessName} ${cityQuery} tiktok`, cseKey, cseCx, 10)
    if (results.length === 0) return null

    console.log(`[TT SEARCH] "${businessName}" → ${results.length} total results, ${results.filter(r => r.url.includes('tiktok.com')).length} TT URLs`)

    const TT_URL_RE = /tiktok\.com\/@([a-zA-Z0-9._-]{1,30})(?:\/|\?|#|$)/

    for (const result of results) {
      const m = TT_URL_RE.exec(result.url)
      if (!m) continue
      const handle = m[1]

      const validation = validateGoogleSearchCandidate(
        handle, result.title, result.description, businessName, cityQuery, phone,
      )
      if (!validation) {
        console.log(`[TT SEARCH] @${handle} rejected — title="${result.title.slice(0, 60)}"`)
        continue
      }

      console.log(`[TT SEARCH] @${handle} validated (${validation.confidence}) — fetching profile...`)
      const profile = apifyToken
        ? await fetchTiktokProfile(handle, apifyToken, validation.confidence, validation.reason)
        : null
      if (profile) return profile

      console.log(`[TT SEARCH] @${handle} profile fetch failed — returning snippet-only`)
      return {
        handle,
        followersCount: null,
        likesCount: null,
        videosCount: null,
        lastPostDate: null,
        activity: 'unknown',
        confidence: validation.confidence,
        confidenceReason: validation.reason,
      }
    }
    return null
  } catch (err) {
    console.error(`[TT SEARCH] "${businessName}" catch:`, err instanceof Error ? err.message : err)
    return null
  }
}

/** Fallback: site:facebook.com araması ile direkt Facebook sayfası bul. */
async function googleSearchFacebookFallback(
  businessName: string,
  phone: string | null,
  cseKey: string,
  cseCx: string,
): Promise<FacebookData | null> {
  try {
    const results = await googleCSESearch(`site:facebook.com "${businessName}"`, cseKey, cseCx, 5)
    if (results.length === 0) return null

    const FB_URL_RE = /facebook\.com\/([a-zA-Z0-9._-]{3,80})(?:\/|\?|#|$)/
    const FB_SYSTEM = new Set(['sharer', 'share', 'dialog', 'ads', 'business', 'help', 'policies', 'privacy', 'legal', 'about', 'login', 'signup', 'pages', 'groups', 'events', 'watch'])

    console.log(`[FB FALLBACK] "${businessName}" site:facebook.com → ${results.length} results`)

    for (const result of results) {
      const m = FB_URL_RE.exec(result.url)
      if (!m) continue
      const handle = m[1]
      if (FB_SYSTEM.has(handle.toLowerCase())) continue

      const validation = validateGoogleSearchCandidate(handle, result.title, result.description, businessName, '', phone)
      const confidence = validation?.confidence ?? 'possible'
      const reason = validation?.reason ?? 'site:facebook.com aramasında ilk sonuç'

      const combinedText = `${result.title} ${result.description}`
      const followersCount = parseFollowersFromSnippet(combinedText)
      const likesCount = parseLikesFromSnippet(combinedText)
      const lastPostDate = parseLastPostDateFromSnippet(combinedText)
      const activity = classifyActivity(lastPostDate)

      console.log(`[FB FALLBACK] @${handle} → confidence=${confidence}`)
      return { handle, pageUrl: `https://www.facebook.com/${handle}`, followersCount, likesCount, lastPostDate, activity, confidence, confidenceReason: reason }
    }
    return null
  } catch {
    return null
  }
}

/** Fallback: site:tiktok.com araması ile direkt TikTok hesabı bul. */
async function googleSearchTiktokFallback(
  businessName: string,
  phone: string | null,
  cseKey: string,
  cseCx: string,
  apifyToken: string | null,
): Promise<TikTokData | null> {
  try {
    const results = await googleCSESearch(`site:tiktok.com "${businessName}"`, cseKey, cseCx, 5)
    if (results.length === 0) return null

    const TT_URL_RE = /tiktok\.com\/@([a-zA-Z0-9._-]{1,30})(?:\/|\?|#|$)/

    console.log(`[TT FALLBACK] "${businessName}" site:tiktok.com → ${results.length} results`)

    for (const result of results) {
      const m = TT_URL_RE.exec(result.url)
      if (!m) continue
      const handle = m[1]

      const validation = validateGoogleSearchCandidate(handle, result.title, result.description, businessName, '', phone)
      const confidence = validation?.confidence ?? 'possible'
      const reason = validation?.reason ?? 'site:tiktok.com aramasında ilk sonuç'

      console.log(`[TT FALLBACK] @${handle} → confidence=${confidence}`)
      const profile = apifyToken
        ? await fetchTiktokProfile(handle, apifyToken, confidence, reason)
        : null
      if (profile) return profile

      return { handle, followersCount: null, likesCount: null, videosCount: null, lastPostDate: null, activity: 'unknown', confidence, confidenceReason: reason }
    }
    return null
  } catch {
    return null
  }
}

// ─── Apify — Google Ads Rakip Tespiti ────────────────────────────────────────

/**
 * "{sector} {city}" aramasında paidResults (ücretli reklamlar) var mı kontrol eder.
 * Rakipler Google Ads kullanıyorsa true döner — "rakipler reklam veriyor, siz vermiyorsunuz" sinyali için.
 */
// fetchCompetitorGoogleAds: Google Custom Search API ücretli sonuçları (paidResults)
// ayırt etmediğinden bu sinyal CSE ile tespit edilemiyor. Gelecekte SerpAPI gibi
// bir servis entegre edildiğinde yeniden etkinleştirilebilir.
async function fetchCompetitorGoogleAds(
  _sector: string,
  _city: string,
): Promise<boolean | null> {
  return null
}

// ─── Apify — Meta Ad Library ──────────────────────────────────────────────────

const APIFY_META_ADS_ACTOR = 'apify~facebook-ads-scraper'

/**
 * Tek başına Meta sayfası eşleşmesi için yetersiz sayılan generik sektör/tür kelimeleri.
 * Bu listeden en az bir kelime dışı (ayırt edici) kelime her iki tarafta da bulunmalıdır.
 */
const META_GENERIC_WORDS = new Set([
  'kuafor', 'guzellik', 'salon', 'salonu', 'berber', 'sac', 'hair',
  'studio', 'studyo', 'estetik', 'spa', 'klinik', 'clinic', 'merkezi',
  'center', 'saglik', 'hizmetleri', 'hizmet', 'servis', 'bakim',
  'kozmetik', 'masaj', 'manikur', 'pedikur', 'coiffeur', 'lazer',
  'doktor', 'doctor', 'hastane', 'eczane', 'dis', 'goz', 'cilt',
])

/**
 * Bir Meta reklamı sayfasının adını işletme ve Instagram bilgisiyle doğrular.
 *
 * Çift yönlü kelime eşitliği benzerliği kullanır (substring değil, tam kelime).
 * Instagram bridge yalnızca 'definitive' güven seviyesinde aktif olur.
 */
function validateMetaPage(
  pageName: string,
  businessName: string,
  igHandle: string | null, // null → köprü yok, sadece işletme adıyla eşleştir
): { confidence: 'definitive' | 'likely'; reason: string } | null {
  const normPage = normalizeForComparison(pageName)

  /** Çift yönlü kelime eşitliği: (A→B + B→A) / 2. Substring değil, tam kelime. */
  function bidirectional(a: string, b: string): number {
    const wa = normalizeForComparison(a).split(' ').filter(w => w.length >= 3)
    const wb = normalizeForComparison(b).split(' ').filter(w => w.length >= 3)
    if (wa.length === 0 || wb.length === 0) return 0
    const setB = new Set(wb)
    const setA = new Set(wa)
    const aToB = wa.filter(w => setB.has(w)).length / wa.length
    const bToA = wb.filter(w => setA.has(w)).length / wb.length
    return (aToB + bToA) / 2
  }

  /**
   * Generik sektör kelimeleri dışında en az bir ayırt edici kelime eşleşmeli.
   * - Her iki taraf da sadece generik kelimelerden oluşuyorsa → kabul (eşit belirsizlik)
   * - Bir tarafta ayırt edici kelime varken diğerinde yoksa → reddet
   * - Her iki tarafta ayırt edici kelime varsa → en az biri eşleşmeli
   */
  function hasDistinctiveMatch(a: string, b: string): boolean {
    const wa = normalizeForComparison(a).split(' ').filter(w => w.length >= 3 && !META_GENERIC_WORDS.has(w))
    const wb = normalizeForComparison(b).split(' ').filter(w => w.length >= 3 && !META_GENERIC_WORDS.has(w))
    if (wa.length === 0 && wb.length === 0) return true  // her iki taraf da sadece generik kelime
    if (wa.length === 0 || wb.length === 0) return false // bir tarafta ayırt edici kelime var, diğerinde yok
    const setB = new Set(wb)
    return wa.some(w => setB.has(w))
  }

  /**
   * Instagram handle'ını sayfa adıyla karşılaştırır.
   * Hem ayraçlı handle'ları (dr.klinik.istanbul → kelimeler) hem
   * tek blok handle'ları (drklinikistanbul → substring) destekler.
   */
  function handleMatchesPage(handle: string): boolean {
    // Strateji 1: nokta/alt çizgiyle ayrılmış parçalar → kelime eşitliği
    const parts = handle
      .split(/[._]/)
      .filter(p => p.length >= 3)
      .map(p => normalizeForComparison(p))
    if (parts.length > 0) {
      const pageWordSet = new Set(normPage.split(' ').filter(w => w.length >= 3))
      if (parts.filter(p => pageWordSet.has(p)).length / parts.length >= 0.5) return true
    }
    // Strateji 2: birleşik handle → sayfa kelimelerini slug içinde ara
    const slug = normalizeForComparison(handle.replace(/[._]/g, ''))
    const pageWords = normPage.split(' ').filter(w => w.length >= 4)
    if (
      pageWords.length > 0 &&
      pageWords.filter(w => slug.includes(w)).length / pageWords.length >= 0.5
    ) return true
    return false
  }

  const simToBusiness = bidirectional(normPage, businessName)
  const distinctive = hasDistinctiveMatch(pageName, businessName)

  // ── Instagram köprüsüyle kesin eşleşme (köprü varsa yükseltir; yoksa normal akış) ──
  if (igHandle && (simToBusiness >= 0.5 || handleMatchesPage(igHandle))) {
    if (!distinctive) return null // Sadece generik kelimeler eşleşti, ayırt edici yok → reddet
    return {
      confidence: 'definitive',
      reason: `Doğrulanmış @${igHandle} köprüsüyle eşleşti`,
    }
  }

  // ── Sadece işletme adıyla eşleştirme (köprü olmasa veya eşleşmese de) ──
  if (simToBusiness >= 0.5 && distinctive) {
    return {
      confidence: 'likely',
      reason: `İsim eşleşmesiyle doğrulandı (${pageName})`,
    }
  }

  return null
}

/**
 * Meta Ad Library'den ham reklam öğelerini çeker — doğrulama yapmaz.
 * Instagram ve paralel çalışması için bağımsız tutulmuştur.
 */
async function fetchMetaAdsRaw(
  businessName: string,
  token: string,
): Promise<unknown[] | null> {
  const searchUrl =
    'https://www.facebook.com/ads/library/' +
    `?active_status=all&ad_type=all&country=TR` +
    `&search_type=keyword_unordered&q=${encodeURIComponent(businessName)}`

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 30_000)
  try {
    const res = await fetch(
      `https://api.apify.com/v2/acts/${APIFY_META_ADS_ACTOR}/run-sync-get-dataset-items?token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startUrls: [{ url: searchUrl }],
          resultsLimit: 3,
          activeStatus: '', // '' = hem aktif hem geçmiş reklamlar
        }),
        signal: ctrl.signal,
        cache: 'no-store',
      },
    )
    clearTimeout(timer)
    if (!res.ok) {
      console.log(`[META RAW] "${businessName}" → HTTP ${res.status} — actor failed`)
      return null
    }
    const items: unknown[] = await res.json()
    console.log(`[META RAW] "${businessName}" → ${Array.isArray(items) ? items.length : 'non-array'} item(s) returned`)
    return Array.isArray(items) ? items : null
  } catch {
    clearTimeout(timer)
    console.log(`[META RAW] "${businessName}" → fetch aborted or network error`)
    return null
  }
}

/**
 * Ham reklam listesini Instagram köprüsüyle çapraz doğrular ve MetaAdData oluşturur.
 *
 * - Instagram 'definitive' ise: handle köprüsü kullanılır → confidence: 'definitive'
 * - Sadece işletme adı eşleşirse → confidence: 'likely'
 * - Hiçbir sayfa doğrulanamıyorsa null döner; yanlış veri ASLA gösterilmez.
 */
function buildMetaAdData(
  items: unknown[],
  businessName: string,
  instagram: InstagramData | null,
): MetaAdData | null {
  if (items.length === 0) {
    console.log(`[META BUILD] "${businessName}" → 0 items, skipping`)
    return null
  }

  // Yalnızca definitively doğrulanmış Instagram handle'ı köprü olarak kullan
  const igHandle =
    instagram?.confidence === 'definitive' ? instagram.handle : null
  console.log(`[META BUILD] "${businessName}" → ${items.length} items, igHandle=${igHandle ?? 'none'}`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cast = items as any[]

  // Sayfa adına göre grupla (her grup = bir Facebook sayfası)
  const pageGroups = new Map<string, { totalCount: number; activeCount: number }>()
  let emptyPageNameCount = 0
  for (const item of cast) {
    // Öncelik sırası: pageName → advertiserName → page.name → snapshot.page_name
    const pageName: string =
      item.pageName ??
      item.advertiserName ??
      item.page?.name ??
      item.snapshot?.page_name ??
      ''
    if (!pageName) { emptyPageNameCount++; continue }
    if (!pageGroups.has(pageName)) pageGroups.set(pageName, { totalCount: 0, activeCount: 0 })
    const g = pageGroups.get(pageName)!
    g.totalCount++
    if (item.isActive === true) g.activeCount++
  }
  if (emptyPageNameCount > 0) {
    console.log(`[META BUILD] "${businessName}" → ${emptyPageNameCount} item(s) skipped (sayfa adı/reklamcı adı boş)`)
  }

  // En eski reklam tarihini bul
  const adDates: string[] = cast
    .map((item: Record<string, unknown>) => item.startDate ?? item.startedAt ?? item.adDeliveryStartTime)
    .filter((d): d is string => typeof d === 'string' && d.length > 0)
  adDates.sort()
  const oldestAdDate = adDates[0] ?? null

  // İlk doğrulanan sayfanın verilerini döndür
  for (const [pageName, group] of pageGroups) {
    const validation = validateMetaPage(pageName, businessName, igHandle)
    console.log(`[META BUILD]   page="${pageName}" → ${validation ? `ACCEPTED (${validation.confidence})` : 'REJECTED'}`)
    if (!validation) continue
    return {
      hasActiveAds: group.activeCount > 0,
      hasHistoricalAds: group.totalCount > 0,
      activeAdCount: group.activeCount,
      totalAdCount: group.totalCount,
      oldestAdDate,
      confidence: validation.confidence,
      confidenceReason: validation.reason,
    }
  }

  console.log(`[META BUILD] "${businessName}" → all pages rejected`)
  return null // Hiçbir sayfa doğrulanamadı
}

// ─── Kategori Profilleri ──────────────────────────────────────────────────────

const CATEGORY_PROFILES = {
  saglik:      { website: 5, googleReview: 5, seo: 4, instagram: 3, ads: 3 },
  guzellik:    { website: 2, googleReview: 4, seo: 2, instagram: 5, ads: 3 },
  yemeicme:    { website: 2, googleReview: 5, seo: 2, instagram: 4, ads: 3 },
  konaklama:   { website: 5, googleReview: 5, seo: 4, instagram: 3, ads: 4 },
  hizmet:      { website: 3, googleReview: 5, seo: 4, instagram: 2, ads: 3 },
  profesyonel: { website: 5, googleReview: 3, seo: 5, instagram: 1, ads: 2 },
  perakende:   { website: 3, googleReview: 4, seo: 3, instagram: 4, ads: 4 },
  egitim:      { website: 4, googleReview: 5, seo: 4, instagram: 3, ads: 3 },
} satisfies Record<string, CategoryProfile>

/**
 * Sektör arama terimini (dropdown'dan gelen `search` değeri) kategori profiline çevirir.
 * normalizeForComparison ile Türkçe karakterleri ASCII'ye indirger, sonra regex eşleştirme yapar.
 */
function getCategoryProfile(sector: string): CategoryProfile {
  const s = normalizeForComparison(sector)
  if (/dis|klinik|poliklinik|fizyoterapi|diyet|veteriner|optik|psikolog/.test(s))
    return CATEGORY_PROFILES.saglik
  if (/kuafor|berber|guzellik|cilt bakim|nail|epilasyon|dovme|masaj/.test(s))
    return CATEGORY_PROFILES.guzellik
  if (/restoran|kafe|pastane|fast food|catering/.test(s) || s === 'bar')
    return CATEGORY_PROFILES.yemeicme
  if (/otel|pansiyon|tatil|seyahat|acente/.test(s))
    return CATEGORY_PROFILES.konaklama
  if (/emlak ofisi|oto servis|hali yikama|kuru temizleme|nakliyat|tesisatci|cilingir|peyzaj/.test(s))
    return CATEGORY_PROFILES.hizmet
  if (/avukat|mali musavir|muhasebe|sigorta|danisma|mimar/.test(s))
    return CATEGORY_PROFILES.profesyonel
  if (/giyim|mobilya|cicekci|kuyumcu|pet shop|spor salonu/.test(s))
    return CATEGORY_PROFILES.perakende
  if (/ozel ders|dil kursu|surucu|muzik kursu|anaokulu/.test(s))
    return CATEGORY_PROFILES.egitim
  // Varsayılan: dengeli profil
  return { website: 3, googleReview: 4, seo: 3, instagram: 3, ads: 3 }
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

function priceLevelBonus(level: string | undefined): number {
  if (level === 'PRICE_LEVEL_VERY_EXPENSIVE') return 15
  if (level === 'PRICE_LEVEL_EXPENSIVE') return 12
  if (level === 'PRICE_LEVEL_MODERATE') return 7
  if (level === 'PRICE_LEVEL_INEXPENSIVE') return 3
  return 0
}

function computeEstablishment(
  reviewCount: number,
  rating: number | undefined,
  photoCount: number,
  hasOpeningHours: boolean,
  websiteSource: 'google' | 'discovered' | 'none',
  priceLevel: string | undefined,
  site: SiteAnalysis | null,
  domainInfo: DomainInfo | null,
): number {
  let s = 0
  if (reviewCount >= 500) s += 50
  else if (reviewCount >= 200) s += 42
  else if (reviewCount >= 100) s += 35
  else if (reviewCount >= 50) s += 27
  else if (reviewCount >= 20) s += 18
  else if (reviewCount >= 5) s += 10
  else s += 2
  if (rating !== undefined) {
    if (rating >= 4.5) s += 10
    else if (rating >= 4.0) s += 6
    else if (rating >= 3.5) s += 3
  }
  s += priceLevelBonus(priceLevel)
  if (photoCount >= 10) s += 8
  else if (photoCount >= 5) s += 5
  else if (photoCount >= 1) s += 2
  if (hasOpeningHours) s += 5
  if (websiteSource !== 'none') s += 5
  if (site?.hasPixel || site?.hasGoogleAds) s += 10
  else if (site?.hasGTM) s += 7        // GTM üzerinden Pixel/Ads yüklenmiş olabilir
  else if (site?.hasAnalytics) s += 4  // GA4/Analytics var ama reklam kodu yok
  // Domain yaşı bonusu (RDAP)
  if (domainInfo) {
    if (domainInfo.ageYears >= 5) s += 10
    else if (domainInfo.ageYears >= 2) s += 5
  }
  // Kurumsal e-posta bonusu
  if (site?.hasCorpEmail === true) s += 5
  return Math.min(s, 100)
}

function computeGap(
  websiteSource: 'google' | 'discovered' | 'none',
  reviewCount: number,
  rating: number | undefined,
  photoCount: number,
  hasOpeningHours: boolean,
  businessStatus: string,
  site: SiteAnalysis | null,
  instagram: InstagramData | null,
  facebook: FacebookData | null,
  tiktok: TikTokData | null,
  metaAds: MetaAdData | null,
  profile: CategoryProfile,
  lastReviewDate: string | null,
  negativeReviewRate: number | null,
  hasGoogleDescription: boolean,
  platforms: PlatformPresence | null,
  googleBusinessScore: number,
  competitorGoogleAds: boolean | null,
): number {
  if (businessStatus === 'CLOSED_PERMANENTLY') return 0

  // Kanal ağırlık çarpanları: 1-5 ağırlık → 0.2-1.0 çarpan
  const wSite    = profile.website      / 5
  const wReview  = profile.googleReview / 5
  const wSeo     = profile.seo          / 5
  const wIg      = profile.instagram    / 5
  const wAds     = profile.ads          / 5

  let s = 0

  // ── Web sitesi kanalı ──
  if (websiteSource === 'none') {
    s += Math.round(45 * wSite)
  } else {
    if (websiteSource === 'discovered') s += Math.round(10 * wSite)
    if (site) {
      if (!site.ssl) s += Math.round(20 * wSite)
      if (site.mobileScore !== null) {
        if (site.mobileScore < 50) s += Math.round(15 * wSite)
        else if (site.mobileScore < 70) s += Math.round(8 * wSite)
      }
      if (!site.hasPixel && !site.hasGoogleAds) s += Math.round(12 * wAds)
      if (!site.hasSocialLinks) s += Math.round(5 * wIg)
      if (!site.hasWhatsApp) s += Math.round(8 * wAds)
      if (!site.hasBookingSystem) s += Math.round(6 * wSite)
    }
  }

  // ── Google yorum / puan kanalı ──
  if (reviewCount < 10) s += Math.round(18 * wReview)
  else if (reviewCount < 50) s += Math.round(10 * wReview)
  if (rating === undefined) s += Math.round(10 * wReview)
  else if (rating < 3.5) s += Math.round(18 * wReview)
  else if (rating < 4.0) s += Math.round(8 * wReview)

  // ── Google Business / SEO kanalı ──
  if (photoCount === 0) s += Math.round(8 * wSeo)
  else if (photoCount < 5) s += Math.round(4 * wSeo)
  if (!hasOpeningHours) s += Math.round(5 * wSeo)

  // ── Instagram kanalı ──
  // 'possible' güven seviyesi (~%40 doğruluk): skorlamaya dahil etme
  if (instagram?.confidence !== 'possible') {
    if (instagram?.activity === 'neglected') s += Math.round(10 * wIg)
    else if (instagram?.activity === 'dormant') s += Math.round(6 * wIg)
    if (instagram?.engagementRate != null && instagram.engagementRate < 1) s += Math.round(8 * wIg)
    if (instagram?.weeklyPostFreq != null && instagram.weeklyPostFreq < 1 && instagram.activity === 'active') s += Math.round(5 * wIg)
    if (instagram?.followersCount != null && instagram.followersCount < 500) s += Math.round(5 * wIg)
  }

  // ── Meta Ads kanalı ──
  if (metaAds?.hasHistoricalAds && !metaAds.hasActiveAds) s += Math.round(12 * wAds)

  // ── Facebook kanalı ──
  // Snippet parse ile bulunan Facebook verisi güvenilmez; aktivite cezası yalnızca
  // 'definitive' eşleşmede uygulanır. "Yok" cezası her zaman geçerli.
  const wFb = (profile.ads + profile.instagram) / 2 / 5
  if (!facebook) s += Math.round(10 * wFb)
  else if (facebook.confidence === 'definitive') {
    if (facebook.activity === 'neglected') s += Math.round(12 * wFb)
    else if (facebook.activity === 'dormant') s += Math.round(6 * wFb)
    if (facebook.followersCount != null && facebook.followersCount < 500) s += Math.round(4 * wFb)
  }

  // ── TikTok kanalı ──
  // Yalnızca web sitesinde bulunan handle (yüksek güven) skora girer.
  // Google aramasıyla bulunan TikTok çok yüksek yanlış eşleşme riski taşır.
  const wTt = profile.instagram / 5
  const tiktokOnSite = tiktok?.confidenceReason?.includes('site') ?? false
  if (!tiktok && profile.instagram >= 3) s += Math.round(8 * wTt)
  else if (tiktok && tiktokOnSite) {
    if (tiktok.activity === 'neglected') s += Math.round(10 * wTt)
    else if (tiktok.activity === 'dormant') s += Math.round(5 * wTt)
    if (tiktok.videosCount != null && tiktok.videosCount < 10) s += Math.round(3 * wTt)
    if (tiktok.followersCount != null && tiktok.followersCount < 500) s += Math.round(4 * wTt)
  }

  // ── Tek platform sinyali ──
  const activePlatformCount = [instagram, facebook, tiktok].filter(p => p !== null).length
  if (activePlatformCount === 1) s += Math.round(5 * (profile.instagram / 5))

  // ── Site içerik kalitesi (site varsa) ──
  if (site) {
    if (!site.hasMetaDesc) s += Math.round(4 * wSite)
    if (site.pageTitle !== null && site.pageTitle.length < 20) s += Math.round(5 * wSite)
    if (!site.pageHasPhone) s += Math.round(3 * wSite)
  }

  // ── Yorum kalitesi ──
  if (lastReviewDate && daysSinceStr(lastReviewDate) > 90) s += Math.round(8 * wReview)
  // negativeReviewRate skorlamadan ve UI'dan çıkarıldı: Google Places max 5 yorum döndürür,
  // bu örneklem istatistiksel anlamsız ve skoru yanıltır. Gap mesajı %50+ eşiğiyle korunuyor.

  // ── Google Business açıklaması ──
  if (!hasGoogleDescription) s += Math.round(3 * wSeo)

  // ── Instagram bio kalitesi (yalnızca doğrulanmış eşleşmelerde) ──
  if (instagram?.confidence !== 'possible') {
    if (instagram?.bioLength !== null && instagram?.bioLength !== undefined && instagram.bioLength < 30)
      s += Math.round(4 * wIg)
    if (instagram?.bio && !instagram.bioHasPhone && !instagram.bioHasUrl)
      s += Math.round(5 * wIg)
  }

  // ── Google Business profil dolgunluğu ──
  if (googleBusinessScore < 50) s += Math.round(10 * wSeo)
  else if (googleBusinessScore < 75) s += Math.round(5 * wSeo)

  // ── Dönüşüm altyapısı (site varsa) ──
  if (site) {
    if (!site.hasOnlinePayment && profile.website >= 3) s += Math.round(6 * wSite)
    if (!site.hasGTM && (site.hasPixel || site.hasGoogleAds || site.hasAnalytics)) s += Math.round(3 * wAds)
  }
  // Not: hasLiveChat (~%65) ve hasNewsletter (~%60) JS-render bağımlı — güven eşiği altında, kaldırıldı.
  // Not: Platform varlığı (Yemeksepeti, Getir vb.) Google arama tabanlı (~%60) — güven eşiği altında, kaldırıldı.

  // ── Rakip Google Ads ──
  if (competitorGoogleAds && !site?.hasGoogleAds) s += Math.round(10 * wAds)

  return Math.min(s, 100)
}

// ─── Gap Detection & Pitch ────────────────────────────────────────────────────

function daysSinceStr(isoDate: string): number {
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / 86_400_000)
}

function detectGaps(
  websiteSource: 'google' | 'discovered' | 'none',
  rating: number | undefined,
  reviewCount: number,
  businessStatus: string,
  photoCount: number,
  hasOpeningHours: boolean,
  site: SiteAnalysis | null,
  instagram: InstagramData | null,
  facebook: FacebookData | null,
  tiktok: TikTokData | null,
  metaAds: MetaAdData | null,
  profile: CategoryProfile,
  topCompetitor: { name: string; reviewCount: number; rating: number | null } | null,
  lastReviewDate: string | null,
  negativeReviewRate: number | null,
  hasGoogleDescription: boolean,
  platforms: PlatformPresence | null,
  googleBusinessScore: number,
  metaAdsAge: number | null,
  competitorGoogleAds: boolean | null,
): string[] {
  if (businessStatus === 'CLOSED_PERMANENTLY') return ['İşletme kalıcı olarak kapalı']

  // Her eksik metni + sektöre göre ağırlığı birlikte tutuyoruz
  const weighted: { text: string; w: number }[] = []
  const add = (text: string, w: number) => weighted.push({ text, w })

  if (businessStatus === 'CLOSED_TEMPORARILY')
    add('İşletme geçici olarak kapalı', 50)

  // ── Web sitesi ──
  const wS = profile.website
  if (websiteSource === 'none') {
    add('Google profilinde site linki yok; domain tahmini de yanıt vermedi (doğrulanmalı)', wS * 9)
  } else if (websiteSource === 'discovered') {
    add('Google profilinde site linki yok (tahmini domain bulundu — profile eklenmeli)', wS * 7)
    if (site) {
      if (!site.ssl)  add('Web sitesi güvensiz (HTTP — SSL yok)', wS * 4)
      if (site.mobileScore !== null && site.mobileScore < 50)
        add(`Mobil performans kritik (${site.mobileScore}/100)`, wS * 3)
      else if (site.mobileScore !== null && site.mobileScore < 70)
        add(`Mobil performans zayıf (${site.mobileScore}/100)`, wS * 2)
      if (!site.hasPixel && !site.hasGoogleAds)
        add(site.hasAnalytics ? 'Sitede Meta Pixel ve Google Ads kodu yok (yalnızca Analytics)' : 'Sitede reklam/dönüşüm takip kodu yok', profile.ads * 2)
      if (!site.hasSocialLinks) add('Sitede sosyal medya bağlantısı yok', profile.instagram)
    }
  } else if (site) {
    if (!site.ssl)  add('Web sitesi güvensiz (HTTP — SSL yok)', wS * 4)
    if (site.mobileScore !== null && site.mobileScore < 50)
      add(`Mobil performans kritik (${site.mobileScore}/100)`, wS * 3)
    else if (site.mobileScore !== null && site.mobileScore < 70)
      add(`Mobil performans zayıf (${site.mobileScore}/100)`, wS * 2)
    // Masaüstü hız skoru
    if (site.desktopScore !== null && site.desktopScore < 50)
      add(`Masaüstü skor kritik (${site.desktopScore}/100) — kurumsal müşteriler bilgisayardan giriyor`, wS * 2)
    else if (site.desktopScore !== null && site.desktopScore < 70)
      add(`Masaüstü skor düşük (${site.desktopScore}/100)`, wS)
    // LCP (en büyük içerik yüklenme süresi)
    if (site.lcp !== null && site.lcp > 4)
      add(`Sayfa çok yavaş açılıyor: en büyük içerik ${site.lcp.toFixed(1)} saniyede yükleniyor (LCP) — ziyaretçiler sayfayı terk ediyor`, wS * 3)
    else if (site.lcp !== null && site.lcp > 2.5)
      add(`Sayfa açılış hızı ortalama: LCP ${site.lcp.toFixed(1)}s — iyileştirme potansiyeli var`, wS)
    // CLS (görsel stabilite)
    if (site.cls !== null && site.cls > 0.25)
      add(`Sayfa düzeni atlıyor (CLS: ${site.cls.toFixed(2)}) — kullanıcı yanlış yere tıklıyor, sepet/form kayıpları olabilir`, wS * 2)
    // Lighthouse SEO skoru
    if (site.lighthouseSeoScore !== null && site.lighthouseSeoScore < 70)
      add(`Google SEO teknik skoru düşük (${site.lighthouseSeoScore}/100) — arama sıralaması olumsuz etkileniyor`, profile.seo * 2)
    if (!site.hasPixel && !site.hasGoogleAds)
      add(site.hasAnalytics ? 'Sitede Meta Pixel ve Google Ads kodu yok (yalnızca Analytics)' : 'Sitede reklam/dönüşüm takip kodu yok', profile.ads * 2)
    if (!site.hasSocialLinks) add('Sitede sosyal medya bağlantısı yok', profile.instagram)
  }

  // ── Google yorum / puan ──
  const wR = profile.googleReview
  if (reviewCount === 0)       add("Google'da hiç müşteri yorumu yok", wR * 9)
  else if (reviewCount < 10)   add(`Çok az müşteri yorumu (${reviewCount})`, wR * 5)
  else if (reviewCount < 50)   add(`Sınırlı müşteri yorumu (${reviewCount})`, wR * 3)
  if (rating === undefined)    add('Google puanı oluşmamış', wR * 4)
  else if (rating < 3.5)       add(`Düşük Google puanı (${rating.toFixed(1)}/5)`, wR * 5)
  else if (rating < 4.0)       add(`Ortalama Google puanı (${rating.toFixed(1)}/5)`, wR * 3)

  // ── Google Business / SEO ──
  const wSeo = profile.seo
  if (photoCount === 0)        add('Google profilinde fotoğraf yok', wSeo * 2)
  else if (photoCount < 5)     add(`Çok az profil fotoğrafı (${photoCount} adet)`, wSeo)
  if (!hasOpeningHours)        add('Çalışma saatleri Google profilinde belirtilmemiş', wSeo)

  // ── Instagram ──
  // 'possible' güven seviyeli hesaplar UI'da gösterilir ama gap mesajı üretilmez
  const wIg = profile.instagram
  const igConfident = instagram?.confidence !== 'possible'
  if (igConfident && instagram?.activity === 'neglected') {
    const days = instagram.lastPostDate ? daysSinceStr(instagram.lastPostDate) : 90
    add(`Instagram hesabı var ama ${days}+ gündür paylaşım yok`, wIg * 4)
  } else if (igConfident && instagram?.activity === 'dormant') {
    add('Instagram hesabı son 30-90 günde güncellenmemiş', wIg * 2)
  }
  // Haftalık paylaşım sıklığı — düşükse extra sinyal
  if (igConfident && instagram?.weeklyPostFreq != null && instagram.weeklyPostFreq < 1 && instagram.activity === 'active') {
    add(`Haftada ${instagram.weeklyPostFreq} paylaşım — içerik sıklığı artırılabilir`, wIg)
  }
  // Reels kullanmıyorsa (aktif hesap için)
  if (igConfident && instagram?.usesReels === false && instagram.activity !== 'neglected' && profile.instagram >= 3) {
    add('Instagram Reels kullanılmıyor — erişim artırma fırsatı var', wIg)
  }
  // E-posta kurumsallığı (site varsa)
  if (site?.emailAddress && site.hasCorpEmail === false) {
    add(`İletişim e-postası ücretsiz servis (${site.emailAddress}) — kurumsal e-postaya geçiş önerilir`, profile.website)
  }

  // ── Meta Ads ──
  if (metaAds?.hasHistoricalAds && !metaAds.hasActiveAds)
    add(`Geçmişte ${metaAds.totalAdCount} Meta reklamı vermiş ama şu an aktif değil`, profile.ads * 3)

  // ── Google Ads rakip sinyali ──
  if (competitorGoogleAds && !site?.hasGoogleAds)
    add('Rakipler bu sektörde Google Ads ile arama sonuçlarının tepesinde çıkıyor; siz organik sıralamaya bağlısınız', profile.ads * 4)
  else if (!competitorGoogleAds && site && !site.hasGoogleAds && profile.ads >= 3)
    add('Google Ads kampanyası tespit edilemedi — arama bazlı müşteriler reklam veren rakiplere gidiyor', profile.ads * 2)

  // ── Facebook ──
  if (!facebook)
    add('Facebook sayfası tespit edilemedi — potansiyel müşteriler bu kanaldan ulaşamıyor', profile.ads * 2)
  else if (facebook.activity === 'neglected') {
    const days = facebook.lastPostDate ? daysSinceStr(facebook.lastPostDate) : 90
    add(`Facebook sayfası ${days}+ gündür hareketsiz — düzenli içerik ile marka güveni artırılabilir`, profile.ads * 3)
  } else if (facebook.activity === 'dormant')
    add('Facebook sayfası son 30-90 günde güncellenmemiş', profile.ads * 2)

  // ── TikTok ──
  if (!tiktok && profile.instagram >= 3)
    add('TikTok hesabı tespit edilemedi — video içeriğiyle hızla büyüyen kanal fırsatı var', profile.instagram * 2)
  else if (tiktok?.activity === 'neglected') {
    const days = tiktok.lastPostDate ? daysSinceStr(tiktok.lastPostDate) : 90
    add(`TikTok hesabı ${days}+ gündür hareketsiz — kısa video içeriğiyle erişim artırılabilir`, profile.instagram * 2)
  } else if (tiktok?.activity === 'dormant')
    add('TikTok hesabı son 30-90 günde güncellenmemiş', profile.instagram)
  if (tiktok?.videosCount != null && tiktok.videosCount < 10)
    add(`TikTok hesabında henüz ${tiktok.videosCount} video var — içerik kütüphanesi oluşturularak organik erişim artırılabilir`, profile.instagram)

  // ── Conversion sinyalleri (site varsa) ──
  if (site && !site.hasWhatsApp)
    add('Web sitesinde WhatsApp iletişim butonu yok — mobil ziyaretçiler anında ulaşamıyor', profile.ads * 2)
  if (site && !site.hasBookingSystem)
    add('Online rezervasyon/randevu sistemi tespit edilemedi', profile.website)

  // ── Instagram etkileşim oranı ──
  if (igConfident && instagram?.engagementRate != null && instagram.engagementRate < 1)
    add(`Instagram etkileşim oranı %${instagram.engagementRate.toFixed(1)} — takipçi kitlesi içerik ile bağ kuramıyor`, profile.instagram * 2)

  // ── Takipçi sayısı sinyalleri ──
  if (instagram?.confidence !== 'possible' && instagram?.followersCount != null && instagram.followersCount < 500)
    add(`Instagram takipçi sayısı düşük (${instagram.followersCount.toLocaleString('tr-TR')}) — hedefli büyüme stratejisiyle kitle genişletilebilir`, profile.instagram * 2)
  if (facebook?.confidence === 'definitive' && facebook?.followersCount != null && facebook.followersCount < 500)
    add(`Facebook sayfasında ${facebook.followersCount.toLocaleString('tr-TR')} takipçi — içerik stratejisiyle kitle artırılabilir`, profile.ads)
  if (tiktok && tiktok.followersCount != null && tiktok.followersCount < 500)
    add(`TikTok'ta ${tiktok.followersCount.toLocaleString('tr-TR')} takipçi var — viral video stratejisiyle hızlı kitle büyümesi mümkün`, profile.instagram)

  // ── Tek platform sinyali ──
  const activePlatforms = [instagram, facebook, tiktok].filter(p => p !== null)
  if (activePlatforms.length === 1)
    add('Sadece 1 sosyal medya kanalında varlık gösteriliyor — çoklu platform stratejisiyle daha geniş kitleye ulaşılabilir', profile.instagram * 2)

  // ── Rakip karşılaştırması ──
  if (topCompetitor && topCompetitor.reviewCount > reviewCount * 2)
    add(`Bölgedeki rakip '${topCompetitor.name}' ${topCompetitor.reviewCount} yorumla öne çıkarken sizin ${reviewCount} yorumunuz var`, profile.googleReview * 3)

  // ── Site içerik kalitesi ──
  if (site && !site.hasMetaDesc)
    add('Web sitesinde meta açıklaması yok — arama sonuçlarında snippet oluşmuyor', profile.website * 1)
  if (site?.pageTitle != null && site.pageTitle.length < 20)
    add(`Sayfa başlığı çok kısa (${site.pageTitle.length} karakter) — Google arama snippeti zayıf`, profile.website)

  // ── Yorum kalitesi ──
  if (lastReviewDate && daysSinceStr(lastReviewDate) > 90) {
    const n = daysSinceStr(lastReviewDate)
    add(`Son yorumdan bu yana ${n} gün geçmiş — güncel müşteri geri bildirimi eksik`, profile.googleReview * 3)
  }
  // Not: Google Places max 5 yorum döndürür; küçük örneklem nedeniyle eşik yüksek tutulur
  if (negativeReviewRate !== null && negativeReviewRate > 50)
    add(`Son görünen yorumların %${negativeReviewRate}'i olumsuz (1-2 yıldız) — itibar yönetimi gerekiyor`, profile.googleReview * 4)

  // ── Google Business açıklaması ──
  if (!hasGoogleDescription)
    add('Google Business profilinde işletme açıklaması yok', profile.seo)

  // ── Instagram bio kalitesi ──
  if (instagram?.bioLength != null && instagram.bioLength < 30)
    add(`Instagram bio'su çok kısa (${instagram.bioLength} karakter) — işletme tanıtımı yapılmıyor`, profile.instagram)
  if (instagram?.bio && !instagram.bioHasPhone && !instagram.bioHasUrl)
    add("Instagram bio'sunda iletişim bilgisi (tel/link) yok — profilden müşteri yönlendirmesi zor", profile.instagram * 2)

  // ── Google Business profil dolgunluğu ──
  if (googleBusinessScore < 50)
    add(`Google Business profili %${googleBusinessScore} dolu — eksik bilgiler yerel arama görünürlüğünü düşürüyor`, profile.seo * 3)
  else if (googleBusinessScore < 75)
    add(`Google Business profili %${googleBusinessScore} tamamlanmış — ek bilgilerle arama sıralaması artırılabilir`, profile.seo * 2)

  // ── Dönüşüm altyapısı ──
  if (site && !site.hasOnlinePayment && profile.website >= 3)
    add('Web sitesinde online ödeme sistemi yok — ziyaretçiler anlık sipariş/ödeme yapamıyor', profile.website * 2)
  if (site && !site.hasGTM && (site.hasPixel || site.hasGoogleAds || site.hasAnalytics))
    add('Google Tag Manager kullanılmıyor — tüm izleme kodları HTML\'e gömülü, yönetimi zor ve hata riski yüksek', profile.ads * 2)
  // Not: hasLiveChat, hasNewsletter ve platform sinyalleri güven eşiği (%70) altında kaldırıldı.

  // ── Meta Ads yaşı ──
  if (metaAdsAge !== null && metaAds?.hasHistoricalAds)
    add(`Meta reklamları ${Math.round(metaAdsAge / 30)} aydır yayında — strateji ve kreatif yenilemesi değerli olabilir`, profile.ads)

  if (weighted.length === 0) return ['Belirgin dijital eksik tespit edilmedi']

  // Sektör profiline göre önem sırasına diz (ağırlık azalan)
  weighted.sort((a, b) => b.w - a.w)
  return weighted.map(g => g.text)
}

function generatePitch(
  websiteSource: 'google' | 'discovered' | 'none',
  rating: number | undefined,
  reviewCount: number,
  site: SiteAnalysis | null,
  photoCount: number,
  priceLevel: string | undefined,
  instagram: InstagramData | null,
  metaAds: MetaAdData | null,
  profile: CategoryProfile,
  hasOpeningHours: boolean,
): string {
  const isHighValue   = priceLevel === 'PRICE_LEVEL_EXPENSIVE' || priceLevel === 'PRICE_LEVEL_VERY_EXPENSIVE'
  // Sektör tipi profil ağırlıklarından çıkarılır
  const isSocialFirst = profile.instagram >= 4 && profile.website <= 2   // restoran, kafe, güzellik
  const isTrustFirst  = profile.website >= 4 && profile.seo >= 4          // sağlık, konaklama, profesyonel
  const isReviewFirst = profile.googleReview >= 5                          // sağlık, yeme-içme, hizmet, eğitim

  const igFollowers = instagram?.followersCount
  const igDays      = instagram?.lastPostDate ? daysSinceStr(instagram.lastPostDate) : null

  // ── Web sitesi hiç yok ──
  if (websiteSource === 'none') {
    if (isTrustFirst)
      return `Potansiyel müşteriler sizi Google'da araştırıyor — web sitesi olmadan güven inşa edilemiyor ve rakipler arama sonuçlarında sizi geçiyor.${isHighValue ? ' Premium segmentte dijital imaj doğrudan tercih kararını etkiliyor.' : ''}`
    if (isSocialFirst && instagram?.activity === 'neglected' && igDays)
      return `${reviewCount > 10 ? reviewCount + ' yorumlu' : 'Oturmuş'} bir işletme, ama Instagram ${igDays}+ gündür sessiz — bu sektörde aktif rakipler her gün yeni müşteri çekiyor.`
    if (isReviewFirst && reviewCount < 20)
      return `Sadece ${reviewCount} Google yorumu var — bu sektörde müşteriler karar vermeden önce yorumlara bakıyor; az yorum rakibe yönlendiriyor.`
    return 'Web varlığı tespit edilemedi. Rakipleriniz online müşteri kazanırken siz görünmüyorsunuz — temel dijital paket yüksek ROI sağlar.'
  }

  // ── Site var ama Google profiline eklenmemiş ──
  if (websiteSource === 'discovered' && isTrustFirst)
    return 'Web sitesi var ama Google profiline bağlı değil — yerel aramada görünmüyor, rakipler bu trafiği alıyor. Profil güncelleme + SEO ile hızla telafi edilir.'

  // ── Mobil hız: her açma girişimi potansiyel müşteri kaybı ──
  if (site && site.mobileScore !== null && site.mobileScore < 50 && profile.website >= 3)
    return `Mobilde siteyi açan ziyaretçilerin büyük çoğunluğu sayfayı terk ediyor (mobil skor: ${site.mobileScore}/100) — her gün müşteri kaybediyorsunuz.`

  // ── Instagram bu sektörde birincil kanal ──
  if (profile.instagram >= 4) {
    if (instagram?.activity === 'neglected' && igDays)
      return `Instagram'da ${igFollowers ? igFollowers.toLocaleString('tr-TR') + ' takipçi' : 'bir kitle'} var ama ${igDays}+ gündür paylaşım yok — bu sektörde aktif rakipler o kitleye ulaşıyor.`
    if (instagram?.activity === 'dormant')
      return 'Instagram hesabı pasif kalmış — bu sektörde düzenli içerik + hedefli reklam doğrudan müşteri kazanımına dönüşüyor.'
    if (!instagram)
      return 'Instagram hesabı tespit edilemedi — bu sektörde yeni müşterilerin büyük bölümü rakipleri Instagram üzerinden buluyor.'
  }

  // ── Reklam geçmişi var ama durmuş ──
  if (metaAds?.hasHistoricalAds && !metaAds.hasActiveAds)
    return `Geçmişte ${metaAds.totalAdCount}+ Meta reklamı verilmiş ama şu an durmuş — daha önce işe yaramış bir kanal; yeniden aktivasyonla müşteri dönüşümü hızla başlatılabilir.`

  // ── Kanıtlanmış kitle var ama reklam kodu yok ──
  if (site && !site.hasPixel && !site.hasGoogleAds && reviewCount >= 50 && profile.ads >= 3)
    return site.hasAnalytics
      ? `${reviewCount}+ yorumlu köklü bir işletme, ama sitede reklam takip kodu yok — ziyaretçi kim, nereden geliyor bilinmiyor; reklam bütçesi kör gidiyor.`
      : `${reviewCount}+ yorumla kanıtlanmış kitle var, ama sitede hiç reklam/takip kodu yok — altyapı kurulursa hızla ölçeklenebilir.`

  // ── Yorum sayısı bu sektörde kritik ──
  if (isReviewFirst && reviewCount < 20)
    return `Sadece ${reviewCount} Google yorumu — bu sektörde müşteriler karşılaştırma yaparak karar veriyor; az yorum rakibe yönlendiriyor.`

  // ── Instagram ihmali (ikincil sektör) ──
  if (instagram?.activity === 'neglected' && igDays)
    return `Instagram ${igDays}+ gündür hareketsiz — mevcut takipçi kitlesi boşa gidiyor, rakipler o alanı dolduruyor.`

  // ── Düşük puan ama büyük kitle ──
  if (rating !== undefined && rating < 3.5 && reviewCount >= 30)
    return `${reviewCount}+ yorum var ama ortalama puan ${rating.toFixed(1)}/5 — rakipler bu durumu fark ediyor ve müşterileri çekiyor; itibar yönetimiyle dönüşüm artırılabilir.`

  // ── Google profili eksik ──
  if (profile.seo >= 4 && (photoCount < 3 || !hasOpeningHours))
    return 'Google profili eksik doldurulmuş — fotoğraf ve çalışma saati olmadan yerel arama sıralaması düşüyor, rakipler önce görünüyor.'

  return `Temel altyapı mevcut${reviewCount > 0 ? `, ${reviewCount} yorumla kanıtlanmış kitle var` : ''}. Hedefli reklam ve içerik stratejisiyle büyüme potansiyeli hızla değerlendirilebilir.`
}

// ─── Google Business Profil Tamamlanma Skoru ─────────────────────────────────

function computeGoogleBusinessScore(
  details: PlaceDetailsV1,
  site: SiteAnalysis | null,
): number {
  let s = 0
  if (details.nationalPhoneNumber) s += 20
  if (details.websiteUri || site) s += 15
  if ((details.regularOpeningHours?.weekdayDescriptions?.length ?? 0) > 0) s += 15
  if ((details.photos?.length ?? 0) >= 5) s += 20
  else if ((details.photos?.length ?? 0) >= 1) s += 10
  if (details.editorialSummary?.text?.trim()) s += 15
  if (details.primaryType) s += 5
  if (details.priceLevel) s += 5
  if ((details.reviews?.length ?? 0) > 0) s += 5
  return Math.min(s, 100)
}

// ─── Platform Varlığı — Google Search (tek çağrı) ────────────────────────────

async function googleSearchPlatforms(
  businessName: string,
  sector: string,
  cityQuery: string,
  siteYoutube: string | null,
  cseKey: string,
  cseCx: string,
): Promise<PlatformPresence> {
  // Sektör tabanlı platform ilgisi — null = bu sektörde ilgisiz
  const s = normalizeForComparison(sector)
  const isFood          = /restoran|kafe|pastane|fast.?food|catering|yemek/.test(s) || s.trim() === 'bar'
  const isAccommodation = /otel|pansiyon|tatil|seyahat|acente/.test(s)
  const isRetail        = /giyim|mobilya|cicekci|kuyumcu|pet.?shop|spor.?salon|market|ahci/.test(s)
  const isRealEstate    = /emlak/.test(s)
  const isHealth        = /dis|klinik|poliklinik|fizyoterapi|diyet|veteriner|optik|psikolog|saglik/.test(s)
  const isBeauty        = /kuafor|berber|guzellik|cilt|nail|epilasyon|dovme|masaj|spa/.test(s)
  const isService       = /oto.?servis|hali.?yikama|kuru.?temizleme|nakliyat|tesisatci|cilingir|peyzaj/.test(s)
  const isEducation     = /ozel.?ders|dil.?kursu|surucu|muzik.?kursu|anaokulu/.test(s)
  const isProfessional  = /avukat|mali.?musavir|muhasebe|sigorta|danisma|mimar/.test(s)

  // Randevu platformu sorgusu — sektöre göre farklı
  let bookingQuery = ''
  if (isHealth)                              bookingQuery = `"${businessName}" doktortakvimi.com OR randevu.com`
  else if (isBeauty)                         bookingQuery = `"${businessName}" treatwell.com OR fresha.com OR bookamat.com`
  else if (isService || isEducation || isProfessional) bookingQuery = `"${businessName}" calendly OR setmore OR randevu`
  const hasBookingPlatform = bookingQuery.length > 0

  const defaults: PlatformPresence = {
    yemeksepeti:     isFood ? false : null,
    getir:           isFood ? false : null,
    tripadvisor:     (isFood || isAccommodation) ? false : null,
    marketplace:     (isRetail || isRealEstate)  ? false : null,
    bookingPlatform: hasBookingPlatform ? false : null,
    youtubeHandle:   siteYoutube,
    inLocalPack:     false,
    emailFromSearch: null,
    linkedinUrl:     null,
  }

  try {
    // Her sorgu için ayrı CSE çağrısı — paralel çalışır
    const queryList = [
      isFood                        ? `"${businessName}" yemeksepeti OR getir`                             : '',
      (isFood || isAccommodation)   ? `"${businessName}" tripadvisor OR booking.com`                       : '',
      (isRetail || isRealEstate)    ? `"${businessName}" sahibinden.com OR hepsiburada.com OR trendyol.com` : '',
      bookingQuery,
      !siteYoutube                  ? `"${businessName}" youtube.com`                                      : '',
      `"${businessName}" ${cityQuery} iletişim`,  // e-posta ve LinkedIn keşfi
    ].filter(Boolean) as string[]

    const allResults = (await Promise.all(
      queryList.map(q => googleCSESearch(q, cseKey, cseCx, 5))
    )).flat()

    const result = { ...defaults }

    for (const r of allResults) {
      const url = r.url.toLowerCase()
      if (result.yemeksepeti === false && url.includes('yemeksepeti.com')) result.yemeksepeti = true
      if (result.getir === false && (url.includes('getir.com') || url.includes('trendyol.com/yemek'))) result.getir = true
      if (result.tripadvisor === false && (url.includes('tripadvisor.com') || url.includes('booking.com'))) result.tripadvisor = true
      if (result.marketplace === false && (url.includes('sahibinden.com') || url.includes('hepsiburada.com') || url.includes('trendyol.com'))) result.marketplace = true
      if (result.bookingPlatform === false && (
        url.includes('doktortakvimi.com') || url.includes('randevu.com') ||
        url.includes('treatwell.com') || url.includes('fresha.com') ||
        url.includes('bookamat.com') || url.includes('calendly.com') ||
        url.includes('setmore.com') || url.includes('simplybook.') ||
        url.includes('bookeo.com') || url.includes('acuityscheduling.com')
      )) result.bookingPlatform = true
      if (
        !result.youtubeHandle &&
        (url.includes('youtube.com/channel/') || url.includes('youtube.com/@') || url.includes('youtube.com/c/'))
      ) {
        result.youtubeHandle = r.url
      }
      if (!result.linkedinUrl && (url.includes('linkedin.com/company/') || url.includes('linkedin.com/in/'))) {
        result.linkedinUrl = r.url
      }
      if (!result.emailFromSearch) {
        const combined = `${r.title} ${r.description}`
        const emailMatch = /\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/.exec(combined)
        if (emailMatch) {
          const addr = emailMatch[0].toLowerCase()
          if (!/^(no-?reply|info@gmail|info@yahoo|noreply|support@|admin@|mailer@|postmaster@)/.test(addr) &&
              !addr.includes('@sentry.') && !addr.includes('@example.') && !addr.includes('@schema.')) {
            result.emailFromSearch = addr
          }
        }
      }
    }

    console.log(`[PLATFORMS] "${businessName}" → yemeksepeti=${result.yemeksepeti} getir=${result.getir} trip=${result.tripadvisor} market=${result.marketplace} booking=${result.bookingPlatform} yt=${result.youtubeHandle ? 'evet' : 'hayır'}`)
    return result
  } catch {
    return defaults
  }
}

// ─── Review Insights ──────────────────────────────────────────────────────────

function computeReviewInsights(
  reviews: PlaceDetailsV1['reviews'],
): { lastReviewDate: string | null; negativeReviewRate: number | null } {
  if (!reviews || reviews.length === 0)
    return { lastReviewDate: null, negativeReviewRate: null }
  const sorted = [...reviews]
    .filter(r => r.publishTime)
    .sort((a, b) => new Date(b.publishTime!).getTime() - new Date(a.publishTime!).getTime())
  const lastReviewDate = sorted[0]?.publishTime ?? null
  const withRating = reviews.filter(r => r.rating != null)
  // Google Places max 5 yorum döndürür — en az 3 varsa hesapla, yoksa null (istatistiksel anlamsızlık)
  const negativeReviewRate = withRating.length >= 3
    ? Math.round(withRating.filter(r => r.rating! <= 2).length / withRating.length * 100)
    : null
  return { lastReviewDate, negativeReviewRate }
}

// ─── Lead Builder ─────────────────────────────────────────────────────────────

function buildLead(
  c: Candidate,
  details: PlaceDetailsV1,
  site: SiteAnalysis | null,
  resolvedWebsiteUrl: string | null,
  websiteSource: 'google' | 'discovered' | 'none',
  instagram: InstagramData | null,
  facebook: FacebookData | null,
  tiktok: TikTokData | null,
  metaAds: MetaAdData | null,
  platforms: PlatformPresence | null,
  preScoreVal: number,
  totalCandidates: number,
  profile: CategoryProfile,
  domainInfo: DomainInfo | null,
  topCompetitor: { name: string; reviewCount: number; rating: number | null } | null,
  competitorGoogleAds: boolean | null,
): Lead {
  const { rating, reviewCount, businessStatus } = c
  const photoCount = details.photos?.length ?? 0
  const hasOpeningHours = (details.regularOpeningHours?.weekdayDescriptions?.length ?? 0) > 0
  const priceLevel = details.priceLevel

  const { lastReviewDate, negativeReviewRate } = computeReviewInsights(details.reviews)
  const hasGoogleDescription = !!(details.editorialSummary?.text?.trim())
  const googleBusinessScore = computeGoogleBusinessScore(details, site)
  const youtubeHandle = site?.youtubeHandle ?? platforms?.youtubeHandle ?? null
  const metaAdsAge = metaAds?.oldestAdDate
    ? Math.floor((Date.now() - new Date(metaAds.oldestAdDate).getTime()) / 86_400_000)
    : null

  // ── Çapraz Doğrulama: site handle = arama handle → kesin eşleşme ──
  // Web sitesinde ve Google aramasında aynı handle bulunduysa güven 'definitive'e yükselir.
  function normalizeHandle(h: string): string {
    return h.toLowerCase().replace(/[@._\-]/g, '')
  }
  if (instagram && site?.instagramHandle) {
    const sH = normalizeHandle(site.instagramHandle)
    const aH = normalizeHandle(instagram.handle)
    if (sH === aH && instagram.confidence !== 'definitive') {
      instagram = { ...instagram, confidence: 'definitive', confidenceReason: 'Web sitesi ve Google araması aynı hesabı doğruluyor' }
    }
  }
  if (facebook && site?.facebookHandle) {
    const sH = normalizeHandle(site.facebookHandle)
    const aH = normalizeHandle(facebook.handle)
    if (sH === aH && facebook.confidence !== 'definitive') {
      facebook = { ...facebook, confidence: 'definitive', confidenceReason: 'Web sitesi ve Google araması aynı sayfayı doğruluyor' }
    }
  }
  if (tiktok && site?.tiktokHandle) {
    const sH = normalizeHandle(site.tiktokHandle)
    const aH = normalizeHandle(tiktok.handle)
    if (sH === aH && tiktok.confidence !== 'definitive') {
      tiktok = { ...tiktok, confidence: 'definitive', confidenceReason: 'Web sitesi ve Google araması aynı hesabı doğruluyor' }
    }
  }

  // ── Güven Eşiği: 'possible' Instagram UI'da "Belirsiz" badge ile gösterilir ──
  // Scoring ve gap detection'a dahil edilmez (computeGap/detectGaps zaten 'possible' checkli).

  // Facebook aktivite verisi yalnızca 'definitive' eşleşmede güvenilir
  // Snippet tabanlı eşleşmelerde (%30-40 doğruluk) aktivite/takipçi temizlenir
  if (facebook && facebook.confidence !== 'definitive') {
    facebook = { ...facebook, activity: 'unknown', followersCount: null, likesCount: null }
  }

  // TikTok: web sitesinde doğrulanmamış handle Google aramasından geliyor (~%50 doğruluk)
  if (tiktok && tiktok.confidence !== 'definitive') tiktok = null

  const odemeGucu = computeEstablishment(
    reviewCount, rating, photoCount, hasOpeningHours, websiteSource, priceLevel, site, domainInfo,
  )
  const acikSiddeti = computeGap(
    websiteSource, reviewCount, rating, photoCount, hasOpeningHours, businessStatus, site,
    instagram, facebook, tiktok,
    metaAds,
    profile,
    lastReviewDate,
    negativeReviewRate,
    hasGoogleDescription,
    platforms,
    googleBusinessScore,
    competitorGoogleAds,
  )

  return {
    placeId: c.placeId,
    name: c.name,
    address: c.address,
    phone: details.nationalPhoneNumber ?? null,
    email: site?.emailAddress ?? platforms?.emailFromSearch ?? null,
    website: resolvedWebsiteUrl,
    websiteSource,
    rating: rating ?? null,
    reviewCount,
    businessStatus,
    photoCount,
    hasOpeningHours,
    priceLevel: priceLevel ?? null,
    primaryType: details.primaryType ?? null,
    googleMapsUri: details.googleMapsUri ?? null,
    siteAnalysis: site,
    instagramHandle: instagram?.handle ?? null,
    instagram,
    facebookHandle: facebook?.handle ?? null,
    facebook,
    tiktokHandle: tiktok?.handle ?? null,
    tiktok,
    metaAds,
    competitorGoogleAds,
    score: Math.round(Math.sqrt(odemeGucu * acikSiddeti)),
    odemeGucu,
    acikSiddeti,
    gaps: detectGaps(
      websiteSource, rating, reviewCount, businessStatus, photoCount, hasOpeningHours,
      site, instagram, facebook, tiktok, metaAds, profile, topCompetitor,
      lastReviewDate, negativeReviewRate, hasGoogleDescription,
      platforms, googleBusinessScore, metaAdsAge, competitorGoogleAds,
    ),
    pitch: generatePitch(
      websiteSource, rating, reviewCount, site, photoCount, priceLevel, instagram, metaAds, profile, hasOpeningHours,
    ),
    categoryProfile: profile,
    domainInfo,
    topCompetitor,
    lastReviewDate,
    negativeReviewRate,
    hasGoogleDescription,
    googleBusinessScore,
    youtubeHandle,
    platforms,
    _preScore: preScoreVal,
    _candidateCount: totalCandidates,
  }
}

// ─── Eşzamanlı Çağrı Sınırlayıcı ────────────────────────────────────────────

/**
 * Belirli bir fonksiyonu en fazla `maxConcurrent` eşzamanlı çalıştıran throttle.
 * Apify actor rate limit (402) aşımını önlemek için Meta çağrılarında kullanılır.
 */
function createThrottle(maxConcurrent: number) {
  let running = 0
  const queue: Array<() => void> = []
  return function throttled<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        running++
        fn()
          .then(resolve)
          .catch(reject)
          .finally(() => {
            running--
            if (queue.length > 0) queue.shift()!()
          })
      }
      if (running < maxConcurrent) run()
      else queue.push(run)
    })
  }
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // ── Auth & Rate Limit ──────────────────────────────────────────────────────
  // Cron iç çağrısı: Authorization: Bearer <CRON_SECRET>
  const authHeader = request.headers.get('authorization')
  const isCron = process.env.CRON_SECRET
    ? authHeader === `Bearer ${process.env.CRON_SECRET}`
    : false

  if (!isCron) {
    // Standart kullanıcı: Supabase oturumu zorunlu
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return Response.json({ error: 'Oturum gerekli.' }, { status: 401 })
    }

    // Kullanıcı başına dakikada 10 istek
    const now = Date.now()
    const bucket = _rateLimit.get(user.id)
    if (bucket && now < bucket.resetAt) {
      if (bucket.count >= 10) {
        return Response.json(
          { error: 'Çok fazla istek. Lütfen bir dakika bekleyin.' },
          { status: 429 },
        )
      }
      bucket.count++
    } else {
      _rateLimit.set(user.id, { count: 1, resetAt: now + 60_000 })
    }
  }
  // ──────────────────────────────────────────────────────────────────────────

  const params = request.nextUrl.searchParams
  const sector       = params.get('sector')?.trim()
  const city         = params.get('city')?.trim()
  const businessName = params.get('businessName')?.trim()

  if (!businessName) {
    if (!sector || !city)
      return Response.json({ error: 'Sektör ve şehir alanları zorunludur.' }, { status: 400 })
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey)
    return Response.json({ error: 'API anahtarı eksik.' }, { status: 500 })

  const apifyToken = process.env.APIFY_TOKEN ?? null
  const cseKey = process.env.GOOGLE_CSE_KEY ?? ''
  const cseCx = process.env.GOOGLE_CSE_CX ?? ''
  const hasCse = !!(cseKey && cseCx)

  // Sektör → kategori profili (tüm puanlama/eksik/pitch buna göre ağırlıklanır)
  const categoryProfile = getCategoryProfile(sector ?? '')

  // ── AŞAMA 1: Geniş ucuz tarama ──
  const searchQuery = businessName
    ? `${businessName}${city ? ' ' + city : ''}`
    : `${sector} ${city}`

  const { candidates, pagesFetched } = await fetchCandidates(searchQuery, apiKey)
  if (candidates.length === 0)
    return Response.json({ leads: [], meta: { candidates: 0, pages: pagesFetched } })

  // Batch istatistikleri — rekabetçi konum sinyali için (sıfır ek maliyet)
  const batchStats = computeBatchStats(candidates)

  // Ön skor → en iyi finalist(ler)
  const finalistCount = businessName ? 1 : 12
  const scored = candidates
    .map((c) => ({ c, s: preScore(c, batchStats) }))
    .sort((a, b) => b.s - a.s)
  const finalists = scored.slice(0, finalistCount)

  // Market leader — tüm adaylar arasından en yüksek yorum sayılı açık işletme (sıfır ek maliyet)
  const marketLeader = candidates
    .filter(c => c.businessStatus !== 'CLOSED_PERMANENTLY' && c.reviewCount > 0)
    .sort((a, b) => b.reviewCount - a.reviewCount)[0] ?? null

  // Meta çağrıları için throttle (max 3 eşzamanlı — 402 rate-limit önlemi)
  const metaThrottle = createThrottle(3)

  // ── AŞAMA 2: Finalistlere detaylı analiz (streaming — her lead hazır olunca akıtılır) ──
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (obj: object) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))

      try {
        await Promise.all(
          finalists.map(async ({ c, s }) => {
            try {
              const details = await fetchPlaceDetails(c.placeId, apiKey)

              const googleUri = details.websiteUri ?? null
              const googleUriIsReal = googleUri ? isRealWebsite(googleUri) : false
              if (googleUri && !googleUriIsReal) {
                console.log(`[WEBSITE] "${c.name}" → Google URI elendi (sosyal medya/mesajlaşma): ${googleUri}`)
              }

              let resolvedWebsiteUrl: string | null = googleUriIsReal ? googleUri : null
              let websiteSource: 'google' | 'discovered' | 'none'

              if (resolvedWebsiteUrl) {
                websiteSource = 'google'
              } else {
                const discovered = await guessAndCheckDomain(c.name)
                if (discovered) {
                  resolvedWebsiteUrl = discovered
                  websiteSource = 'discovered'
                } else {
                  websiteSource = 'none'
                }
              }

              const site = resolvedWebsiteUrl ? await analyzeSite(resolvedWebsiteUrl, apiKey) : null
              const igHandleFromSite = site?.instagramHandle ?? null
              const fbHandleFromSite = site?.facebookHandle ?? null
              const ttHandleFromSite = site?.tiktokHandle ?? null

              // Instagram, Facebook, TikTok, Meta Ads, domain yaşı, platformlar ve Google Ads PARALEL çalışır
              const [instagram, facebook, tiktok, rawMetaItems, domainInfo, platforms, competitorGoogleAds] = await Promise.all([
                // ── Instagram ──
                igHandleFromSite
                  ? (apifyToken
                      ? fetchInstagramProfile(igHandleFromSite, apifyToken, 'definitive', 'Web sitesindeki linkten bulundu')
                      : Promise.resolve<InstagramData>({
                          handle: igHandleFromSite, followersCount: null, postsCount: null, bio: null,
                          lastPostDate: null, isPrivate: false, activity: 'unknown',
                          confidence: 'definitive', confidenceReason: 'Web sitesindeki linkten bulundu',
                          weeklyPostFreq: null, usesReels: null, engagementRate: null,
                          bioHasPhone: false, bioHasUrl: false, bioLength: null,
                        }))
                  : hasCse
                    ? googleSearchInstagram(c.name, city ?? '', details.nationalPhoneNumber ?? null, cseKey, cseCx, apifyToken)
                        .then(r => r ?? googleSearchInstagramFallback(c.name, details.nationalPhoneNumber ?? null, cseKey, cseCx, apifyToken))
                    : Promise.resolve(null),
                // ── Facebook ──
                fbHandleFromSite
                  ? googleSearchFacebook(c.name, city ?? '', details.nationalPhoneNumber ?? null, cseKey, cseCx).then(
                      r => r ?? ({
                        handle: fbHandleFromSite,
                        pageUrl: `https://www.facebook.com/${fbHandleFromSite}`,
                        followersCount: null,
                        likesCount: null,
                        lastPostDate: null,
                        activity: 'unknown' as const,
                        confidence: 'definitive' as const,
                        confidenceReason: 'Web sitesindeki linkten bulundu',
                      } satisfies FacebookData),
                    )
                  : hasCse
                    ? googleSearchFacebook(c.name, city ?? '', details.nationalPhoneNumber ?? null, cseKey, cseCx)
                        .then(r => r ?? googleSearchFacebookFallback(c.name, details.nationalPhoneNumber ?? null, cseKey, cseCx))
                    : Promise.resolve(null),
                // ── TikTok ──
                ttHandleFromSite
                  ? (apifyToken
                      ? fetchTiktokProfile(ttHandleFromSite, apifyToken, 'definitive', 'Web sitesindeki linkten bulundu')
                      : Promise.resolve<TikTokData>({
                          handle: ttHandleFromSite, followersCount: null, likesCount: null, videosCount: null,
                          lastPostDate: null, activity: 'unknown', confidence: 'definitive',
                          confidenceReason: 'Web sitesindeki linkten bulundu',
                        }))
                  : hasCse
                    ? googleSearchTiktok(c.name, city ?? '', details.nationalPhoneNumber ?? null, cseKey, cseCx, apifyToken)
                        .then(r => r ?? googleSearchTiktokFallback(c.name, details.nationalPhoneNumber ?? null, cseKey, cseCx, apifyToken))
                    : Promise.resolve(null),
                // ── Meta Ads ──
                apifyToken
                  ? metaThrottle(() => fetchMetaAdsRaw(c.name, apifyToken))
                  : Promise.resolve(null),
                // ── Domain yaşı (RDAP, ücretsiz) ──
                resolvedWebsiteUrl ? fetchDomainAge(resolvedWebsiteUrl) : Promise.resolve(null),
                // ── Platform varlığı (CSE paralel sorguları) ──
                hasCse
                  ? googleSearchPlatforms(c.name, sector ?? '', city ?? '', site?.youtubeHandle ?? null, cseKey, cseCx)
                  : Promise.resolve(null),
                // ── Google Ads rakip tespiti (CSE ile tespit edilemiyor) ──
                fetchCompetitorGoogleAds(sector ?? '', city ?? ''),
              ])

              const metaAds = rawMetaItems !== null
                ? buildMetaAdData(rawMetaItems, c.name, instagram)
                : null

              const topCompetitor = marketLeader && marketLeader.placeId !== c.placeId
                ? { name: marketLeader.name, reviewCount: marketLeader.reviewCount, rating: marketLeader.rating ?? null }
                : null

              const lead = buildLead(
                c, details, site, resolvedWebsiteUrl, websiteSource,
                instagram, facebook, tiktok, metaAds, platforms,
                s, candidates.length, categoryProfile, domainInfo, topCompetitor,
                competitorGoogleAds,
              )

              emit({ type: 'lead', data: lead })
            } catch (err) {
              console.error(`[LEAD] ${c.name}:`, err)
            }
          }),
        )
        emit({ type: 'done' })
      } catch (err) {
        emit({ type: 'error', message: err instanceof Error ? err.message : 'Analiz başarısız' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  })
}
