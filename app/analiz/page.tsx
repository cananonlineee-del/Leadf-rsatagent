'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import type { Lead, InstagramData, MetaAdData, FacebookData, TikTokData } from '../api/analyze/route'
import { IL_ILCE, ILLER } from '../../lib/turkiye-il-ilce'
import { Navbar } from '../components/navbar'
import {
  getCRMStatuses, upsertCRMStatus,
  type CRMStatus, CRM_STATUS_LABELS, CRM_STATUS_BADGE,
} from '../../lib/crm'
import {
  saveSearch, listSearches, loadSearch, deleteSearch,
  type SavedSearch,
} from '../../lib/savedSearches'
import { generateLeadPDF } from '../../lib/pdf'
import { createClient } from '../../lib/supabase/client'

// ─── Sıcak Lead tipleri & sabitler ───────────────────────────────────────────

interface WarmLead {
  id:           string
  source:       'kariyer' | 'jooble'
  company_name: string
  job_title:    string
  city:         string | null
  posted_at:    string | null
  job_url:      string
  snippet:      string | null
  is_seen:      boolean
  created_at:   string
}

const WL_SOURCE_LABEL: Record<string, { label: string; cls: string }> = {
  kariyer: { label: 'Kariyer.net', cls: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
  jooble:  { label: 'Jooble TR',   cls: 'bg-violet-500/15 text-violet-400 border-violet-500/20' },
}

// Bölge → şehir eşleşmesi (warm lead filtrelemesi için)
const BOLGE_CITIES: Record<string, string[]> = {
  marmara:      ['İstanbul', 'Bursa', 'Kocaeli', 'Tekirdağ', 'Edirne', 'Kırklareli', 'Balıkesir', 'Çanakkale', 'Yalova', 'Sakarya', 'Bilecik'],
  ege:          ['İzmir', 'Manisa', 'Aydın', 'Denizli', 'Muğla', 'Afyonkarahisar', 'Kütahya', 'Uşak'],
  akdeniz:      ['Antalya', 'Mersin', 'Adana', 'Hatay', 'Osmaniye', 'Kahramanmaraş', 'Burdur', 'Isparta'],
  ic_anadolu:   ['Ankara', 'Konya', 'Kayseri', 'Eskişehir', 'Sivas', 'Aksaray', 'Kırıkkale', 'Kırşehir', 'Nevşehir', 'Niğde', 'Yozgat', 'Çankırı', 'Karaman'],
  karadeniz:    ['Samsun', 'Trabzon', 'Ordu', 'Giresun', 'Rize', 'Artvin', 'Zonguldak', 'Bartın', 'Karabük', 'Kastamonu', 'Sinop', 'Bolu', 'Düzce', 'Amasya', 'Tokat', 'Çorum', 'Bayburt', 'Gümüşhane'],
  dogu_anadolu: ['Erzurum', 'Malatya', 'Elazığ', 'Van', 'Ağrı', 'Erzincan', 'Bingöl', 'Tunceli', 'Muş', 'Bitlis', 'Hakkari', 'Iğdır', 'Kars', 'Ardahan'],
  guneydogu:    ['Gaziantep', 'Diyarbakır', 'Şanlıurfa', 'Mardin', 'Batman', 'Şırnak', 'Siirt', 'Adıyaman', 'Kilis'],
}

const BOLGE_LABELS: Record<string, string> = {
  all:          'Tüm Türkiye',
  marmara:      'Marmara',
  ege:          'Ege',
  akdeniz:      'Akdeniz',
  ic_anadolu:   'İç Anadolu',
  karadeniz:    'Karadeniz',
  dogu_anadolu: 'Doğu Anadolu',
  guneydogu:    'Güneydoğu Anadolu',
}

// ─── Sıcak Lead Liste Kartı ───────────────────────────────────────────────────

function WarmLeadListCard({
  lead,
  onAnalyze,
  analyzing,
}: {
  lead:     WarmLead
  onAnalyze:(lead: WarmLead) => void
  analyzing: boolean
}) {
  const src = WL_SOURCE_LABEL[lead.source] ?? WL_SOURCE_LABEL.kariyer
  return (
    <div className="bg-[#1c1c22] border border-white/[0.10] rounded-2xl p-4 flex items-start gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${src.cls}`}>
            {src.label}
          </span>
          {lead.city && (
            <span className="text-[10px] text-zinc-600">{lead.city}</span>
          )}
        </div>
        <p className="text-sm font-bold text-white truncate">{lead.company_name}</p>
        <p className="text-xs text-zinc-500 mt-0.5">{lead.job_title}</p>
        {lead.snippet && (
          <p className="text-[10px] text-zinc-700 mt-1.5 line-clamp-2 leading-relaxed">
            {lead.snippet}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2 shrink-0">
        <button
          onClick={() => onAnalyze(lead)}
          disabled={analyzing}
          className="text-[11px] font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-xl px-4 py-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {analyzing ? '…' : 'Analiz Et →'}
        </button>
        <a
          href={lead.job_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-center text-zinc-600 hover:text-zinc-400 border border-white/[0.08] rounded-xl px-3 py-1.5 transition-colors"
        >
          İlan ↗
        </a>
      </div>
    </div>
  )
}

// ─── Yardımcı fonksiyonlar ────────────────────────────────────────────────────

function safeHostname(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

function priceLevelLabel(level: string | null): string | null {
  switch (level) {
    case 'PRICE_LEVEL_INEXPENSIVE':    return '₺'
    case 'PRICE_LEVEL_MODERATE':       return '₺₺'
    case 'PRICE_LEVEL_EXPENSIVE':      return '₺₺₺'
    case 'PRICE_LEVEL_VERY_EXPENSIVE': return '₺₺₺₺'
    default: return null
  }
}

function formatType(type: string | null): string | null {
  if (!type) return null
  return type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}B`
  return String(n)
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date(iso))
}

// ─── Küçük yardımcı bileşenler ────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <dt className="text-[11px] text-zinc-600 shrink-0 w-28 pt-px">{label}</dt>
      <dd className="flex-1 min-w-0">{children}</dd>
    </div>
  )
}

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-[11px] text-zinc-500">{label}</span>
        <span className="text-[11px] font-semibold text-zinc-400">{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

// ─── PageSpeed renk yardımcıları ─────────────────────────────────────────────

function perfColor(score: number | null): string {
  if (score === null) return 'text-zinc-600'
  if (score >= 70) return 'text-emerald-400'
  if (score >= 50) return 'text-amber-400'
  return 'text-red-400'
}

function seoLighthouseColor(score: number | null): string {
  if (score === null) return 'text-zinc-600'
  if (score >= 90) return 'text-emerald-400'
  if (score >= 70) return 'text-amber-400'
  return 'text-red-400'
}

function lcpColor(lcp: number | null): string {
  if (lcp === null) return 'text-zinc-600'
  if (lcp <= 2.5) return 'text-emerald-400'
  if (lcp <= 4)   return 'text-amber-400'
  return 'text-red-400'
}

function clsColor(cls: number | null): string {
  if (cls === null) return 'text-zinc-600'
  if (cls <= 0.1)  return 'text-emerald-400'
  if (cls <= 0.25) return 'text-amber-400'
  return 'text-red-400'
}

function tbtColor(tbt: number | null): string {
  if (tbt === null) return 'text-zinc-600'
  if (tbt <= 200)  return 'text-emerald-400'
  if (tbt <= 600)  return 'text-amber-400'
  return 'text-red-400'
}

// ─── Güven rozetleri ──────────────────────────────────────────────────────────

function igBadge(confidence: InstagramData['confidence']): { label: string; cls: string } {
  if (confidence === 'definitive') return { label: 'Kesin',   cls: 'bg-emerald-500/10 text-emerald-400' }
  if (confidence === 'likely')     return { label: 'Olası',   cls: 'bg-yellow-500/10 text-yellow-400' }
  return                                  { label: 'Tahmini', cls: 'bg-white/5 text-zinc-500' }
}

function fbBadge(confidence: FacebookData['confidence']): { label: string; cls: string } {
  if (confidence === 'definitive') return { label: 'Kesin',   cls: 'bg-emerald-500/10 text-emerald-400' }
  if (confidence === 'likely')     return { label: 'Olası',   cls: 'bg-yellow-500/10 text-yellow-400' }
  return                                  { label: 'Tahmini', cls: 'bg-white/5 text-zinc-500' }
}

function ttBadge(confidence: TikTokData['confidence']): { label: string; cls: string } {
  if (confidence === 'definitive') return { label: 'Kesin',   cls: 'bg-emerald-500/10 text-emerald-400' }
  if (confidence === 'likely')     return { label: 'Olası',   cls: 'bg-yellow-500/10 text-yellow-400' }
  return                                  { label: 'Tahmini', cls: 'bg-white/5 text-zinc-500' }
}

function metaBadge(confidence: MetaAdData['confidence']): { label: string; cls: string } {
  if (confidence === 'definitive') return { label: 'Kesin', cls: 'bg-emerald-500/10 text-emerald-400' }
  return                                  { label: 'Olası', cls: 'bg-yellow-500/10 text-yellow-400' }
}

// ─── Reklam İhtiyacı seviyesi ─────────────────────────────────────────────────

function needMeta(score: number): { label: string; badgeCls: string; borderCls: string } {
  if (score >= 70) return {
    label:     'YÜKSEK',
    badgeCls:  'bg-red-500/10 text-red-400 border border-red-500/20',
    borderCls: 'border-red-500/20',
  }
  if (score >= 40) return {
    label:     'ORTA',
    badgeCls:  'bg-amber-500/10 text-amber-400 border border-amber-500/20',
    borderCls: 'border-amber-500/20',
  }
  return {
    label:     'DÜŞÜK',
    badgeCls:  'bg-white/5 text-zinc-500 border border-white/10',
    borderCls: 'border-white/[0.07]',
  }
}

// ─── Popüler sektörler (hızlı seçim chip'leri) ────────────────────────────────

const POPULAR_SECTORS = [
  { label: 'Diş Kliniği',  search: 'diş kliniği' },
  { label: 'Kuaför',       search: 'kuaför' },
  { label: 'Restoran',     search: 'restoran' },
  { label: 'Güzellik',     search: 'güzellik merkezi' },
  { label: 'Emlak',        search: 'emlak ofisi' },
  { label: 'Oto Servis',   search: 'oto servis' },
  { label: 'Spor Salonu',  search: 'spor salonu' },
  { label: 'Avukat',       search: 'avukat' },
]

// ─── Şehir + İlçe autocomplete veri seti ──────────────────────────────────────

const ALL_CITY_DISTRICTS = Object.entries(IL_ILCE).flatMap(([il, ilceler]) =>
  ilceler.map(ilce => ({ label: `${ilce}, ${il}`, il, ilce }))
)

// ─── Yükleniyor adımları ──────────────────────────────────────────────────────

const LOADING_STEPS = [
  { text: 'Google Places taranıyor…',           sub: 'İlçedeki işletmeler listeleniyor' },
  { text: 'Web siteleri analiz ediliyor…',      sub: 'Hız, SSL, SEO ve pixel kontrol ediliyor' },
  { text: 'Sosyal medya taranıyor…',            sub: 'Instagram, Facebook, TikTok' },
  { text: 'Reklam altyapısı kontrol ediliyor…', sub: 'Meta Ads ve piksel durumu' },
  { text: 'Skorlar hesaplanıyor…',              sub: 'Fırsat analizi tamamlanıyor' },
]

// ─── SectorAutocomplete bileşeni ──────────────────────────────────────────────

function SectorAutocomplete({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const match = ALL_SECTOR_OPTIONS.find(s => s.search === value)
  const [query, setQuery] = useState(match?.label ?? value)
  const [open, setOpen]   = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const m = ALL_SECTOR_OPTIONS.find(s => s.search === value)
    setQuery(m ? m.label : value)
  }, [value])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = query.length >= 1
    ? ALL_SECTOR_OPTIONS.filter(s =>
        s.label.toLowerCase().includes(query.toLowerCase()) ||
        s.search.toLowerCase().includes(query.toLowerCase()) ||
        s.group.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 10)
    : []

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        placeholder="Sektör ara (örn: kuaför, restoran, diş kliniği)"
        value={query}
        autoComplete="off"
        onChange={e => {
          setQuery(e.target.value)
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => { if (query.length >= 1) setOpen(true) }}
        className="w-full bg-white/[0.07] border border-white/[0.12] text-white rounded-xl px-3 py-2.5 text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 top-full mt-1 bg-[#1c1c22] border border-white/[0.14] rounded-xl overflow-hidden shadow-2xl max-h-56 overflow-y-auto">
          {filtered.map(s => (
            <li key={s.search}>
              <button
                type="button"
                onMouseDown={e => {
                  e.preventDefault()
                  setQuery(s.label)
                  onChange(s.search)
                  setOpen(false)
                }}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-white/[0.07] flex items-center justify-between transition-colors"
              >
                <span className="text-zinc-200 font-medium">{s.label}</span>
                <span className="text-xs text-zinc-600 ml-2 shrink-0">{s.group}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && query.length >= 1 && filtered.length === 0 && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-[#1c1c22] border border-white/[0.12] rounded-xl px-4 py-3 text-xs text-zinc-600 shadow-xl">
          Eşleşme yok — yazdığınız değer kullanılacak
        </div>
      )}
    </div>
  )
}

// ─── CityAutocomplete bileşeni ────────────────────────────────────────────────

function CityAutocomplete({
  value,
  onChange,
}: {
  value: string
  onChange: (il: string, ilce: string) => void
}) {
  const [query, setQuery] = useState(value)
  const [open, setOpen]   = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => { setQuery(value) }, [value])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = query.length >= 2
    ? ALL_CITY_DISTRICTS.filter(c =>
        c.ilce.toLowerCase().includes(query.toLowerCase()) ||
        c.il.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 8)
    : []

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        placeholder="İlçe veya il ara (örn: Kadıköy, Beşiktaş, Ankara)"
        value={query}
        autoComplete="off"
        onChange={e => {
          setQuery(e.target.value)
          setOpen(true)
          if (!e.target.value) onChange('', '')
        }}
        onFocus={() => { if (query.length >= 2) setOpen(true) }}
        className="w-full bg-white/[0.07] border border-white/[0.12] text-white rounded-xl px-3 py-2.5 text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 top-full mt-1 bg-[#1c1c22] border border-white/[0.14] rounded-xl overflow-hidden shadow-2xl">
          {filtered.map(c => (
            <li key={`${c.il}-${c.ilce}`}>
              <button
                type="button"
                onMouseDown={e => {
                  e.preventDefault()
                  setQuery(c.label)
                  onChange(c.il, c.ilce)
                  setOpen(false)
                }}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-white/[0.07] flex items-center justify-between transition-colors"
              >
                <span className="text-zinc-200 font-medium">{c.ilce}</span>
                <span className="text-xs text-zinc-600 ml-2">{c.il}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && query.length >= 2 && filtered.length === 0 && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-[#1c1c22] border border-white/[0.12] rounded-xl px-4 py-3 text-xs text-zinc-600 shadow-xl">
          Sonuç bulunamadı
        </div>
      )}
    </div>
  )
}

// ─── LeadCard ─────────────────────────────────────────────────────────────────

type DetailTab = 'google' | 'web' | 'sosyal' | 'reklamlar' | 'firsat'

function LeadCard({
  lead,
  rank,
  crmStatus,
  crmNote,
  crmFollowUp,
  onStatusChange,
  onNoteChange,
  onFollowUpChange,
  onMonitor,
  isMonitored,
}: {
  lead: Lead
  rank: number
  crmStatus: CRMStatus
  crmNote: string
  crmFollowUp: string | null
  onStatusChange: (status: CRMStatus) => void
  onNoteChange: (note: string) => void
  onFollowUpChange: (date: string | null) => void
  onMonitor: () => void
  isMonitored: boolean
}) {
  const [expanded, setExpanded]       = useState(false)
  const [activeTab, setActiveTab]     = useState<DetailTab>('google')
  const [showAllGaps, setShowAllGaps] = useState(false)
  const [statusOpen, setStatusOpen]   = useState(false)
  const [localNote, setLocalNote]       = useState(crmNote)
  const [localFollowUp, setLocalFollowUp] = useState(crmFollowUp ?? '')
  const [pdfLoading, setPdfLoading]     = useState(false)
  const [copiedKey, setCopiedKey]       = useState<string | null>(null)
  const noteTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const statusRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setLocalNote(crmNote) }, [crmNote])
  useEffect(() => { setLocalFollowUp(crmFollowUp ?? '') }, [crmFollowUp])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) setStatusOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function handleNoteChange(val: string) {
    setLocalNote(val)
    clearTimeout(noteTimer.current)
    noteTimer.current = setTimeout(() => onNoteChange(val), 500)
  }

  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text).catch(() => undefined)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(k => k === key ? null : k), 2000)
  }

  async function handlePdf() {
    setPdfLoading(true)
    try {
      await generateLeadPDF(lead)
    } finally {
      setPdfLoading(false)
    }
  }

  const need  = needMeta(lead.score)
  const price = priceLevelLabel(lead.priceLevel)
  const type  = formatType(lead.primaryType)

  const heroGap  = lead.gaps[0] ?? ''
  const restGaps = lead.gaps.slice(1)

  const siteUrgent =
    lead.websiteSource !== 'google' ||
    (lead.siteAnalysis !== null && (
      !lead.siteAnalysis.ssl ||
      (lead.siteAnalysis.mobileScore !== null && lead.siteAnalysis.mobileScore < 70)
    ))
  const seoUrgent =
    lead.reviewCount < 50 ||
    !lead.hasOpeningHours ||
    lead.photoCount < 5 ||
    (lead.rating !== null && lead.rating < 4.0)
  const socialUrgent =
    !lead.instagramHandle ||
    lead.instagram?.activity === 'neglected' ||
    lead.instagram?.activity === 'dormant'
  const adsUrgent =
    (lead.websiteSource !== 'none' && !lead.siteAnalysis?.hasPixel && !lead.siteAnalysis?.hasGoogleAds) ||
    (lead.metaAds?.hasHistoricalAds === true && !lead.metaAds?.hasActiveAds)

  const services = [
    { label: 'Web Sitesi',      urgent: siteUrgent,   weight: lead.categoryProfile.website },
    { label: 'Google SEO',      urgent: seoUrgent,    weight: lead.categoryProfile.seo },
    { label: 'Sosyal Medya',    urgent: socialUrgent, weight: lead.categoryProfile.instagram },
    { label: 'Reklam Yönetimi', urgent: adsUrgent,    weight: lead.categoryProfile.ads },
  ].sort((a, b) => {
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1
    return b.weight - a.weight
  })

  // ── Tab badge sayıları ──────────────────────────────────────────────────────
  const _s = lead.siteAnalysis
  const webBadgeCount = [
    !lead.website,
    _s && !_s.ssl,
    _s && _s.mobileScore !== null && _s.mobileScore < 70,
    _s && _s.desktopScore !== null && _s.desktopScore < 70,
    _s && _s.lcp !== null && _s.lcp > 2.5,
    _s && _s.cls !== null && _s.cls > 0.25,
    _s && !_s.hasSocialLinks,
    _s && (_s.pageTitle === null || _s.pageTitle.length < 20),
    _s && !_s.hasMetaDesc,
    _s && !_s.pageHasPhone,
    _s && !_s.hasWhatsApp,
    _s && !_s.hasClickablePhone,
    _s && !_s.hasBookingSystem,
    _s && !_s.hasContactForm,
    _s && !_s.hasLocalBusinessSchema,
    _s && !_s.hasOnlinePayment && lead.categoryProfile.website >= 3,
  ].filter(Boolean).length

  const googleBadgeCount = [
    lead.googleBusinessScore < 75,
    lead.photoCount < 5,
    !lead.hasOpeningHours,
    lead.lastReviewDate && Math.floor((Date.now() - new Date(lead.lastReviewDate).getTime()) / 86_400_000) > 90,
    !lead.hasGoogleDescription,
    lead.businessStatus !== 'OPERATIONAL',
  ].filter(Boolean).length

  const _ig2 = lead.instagram
  const _fb2 = lead.facebook
  const _tt2 = lead.tiktok
  const socialBadgeCount = [
    !lead.instagramHandle,
    _ig2 && _ig2.activity !== 'active' && _ig2.activity !== 'unknown',
    _ig2 && _ig2.bioLength !== null && _ig2.bioLength !== undefined && _ig2.bioLength < 80,
    _ig2 && !_ig2.bioHasPhone,
    _ig2 && !_ig2.bioHasUrl,
    _ig2 && _ig2.engagementRate != null && _ig2.engagementRate < 3,
    _ig2 && _ig2.weeklyPostFreq != null && _ig2.weeklyPostFreq < 2,
    !_fb2,
    _fb2 && _fb2.activity !== 'active' && _fb2.activity !== 'unknown',
    _tt2 && _tt2.activity !== 'active',
  ].filter(Boolean).length

  const adsBadgeCount = [
    // Web sitesi var ama ne pixel ne Google Ads kodu
    _s && !_s.hasPixel && !_s.hasGoogleAds && lead.categoryProfile.ads >= 3,
    // Meta Ads geçmişte vardı ama şu an durmuş
    lead.metaAds?.hasHistoricalAds && !lead.metaAds?.hasActiveAds,
  ].filter(Boolean).length


  const igActivity: Record<InstagramData['activity'], { label: string; cls: string }> = {
    active:    { label: 'Aktif',         cls: 'text-emerald-400' },
    dormant:   { label: 'Durgun',        cls: 'text-amber-400' },
    neglected: { label: 'İhmal Edilmiş', cls: 'text-red-400'  },
    private:   { label: 'Gizli Hesap',   cls: 'text-zinc-500' },
    unknown:   { label: 'Bilinmiyor',    cls: 'text-zinc-600' },
  }

  return (
    <div className={`bg-[#1c1c22] border ${need.borderCls} rounded-2xl shadow-lg shadow-black/30 overflow-hidden`}>

      {/* ── KATMAN 1: Her zaman görünür ─────────────────────────────────── */}
      <div className="p-5 pb-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold text-zinc-400 shrink-0">
                {rank}
              </span>
              <h2 className="text-base font-bold text-white leading-snug">{lead.name}</h2>
              {type && <span className="text-[11px] text-blue-400 font-medium">{type}</span>}
            </div>
            <p className="text-[11px] text-zinc-500 leading-relaxed pl-8">{lead.address}</p>
          </div>

          {/* Sağ üst: Reklam ihtiyacı + CRM durum */}
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <div
              className={`rounded-xl px-3 py-2 text-center cursor-default ${need.badgeCls}`}
              title={`${lead.score >= 70 ? 'Öncelikli lead — önce ara' : lead.score >= 40 ? 'Orta öncelik — sırayla değerlendir' : 'Düşük öncelik — sonraya bırak'}\n\nÖdeme Gücü: ${lead.odemeGucu}/100\nİşletmenin bütçe ve kurumsal olgunluğu\n(yorum sayısı · puan · fiyat seviyesi · domain yaşı)\n\nAçık Şiddeti: ${lead.acikSiddeti}/100\nDigital eksiklerin büyüklüğü\n(web · sosyal medya · reklam altyapısı)`}
            >
              <div className="text-[9px] font-bold uppercase tracking-wider opacity-60">Fırsat Skoru</div>
              <div className="text-sm font-black leading-tight mt-0.5">{lead.score}<span className="text-[9px] font-semibold opacity-50">/100</span></div>
            </div>

            {/* Takip tarihi rozeti (sadece set edilmişse) */}
            {crmFollowUp && (() => {
              const today = new Date().toISOString().slice(0, 10)
              const overdue = crmFollowUp < today
              const fmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' }).format(new Date(crmFollowUp + 'T00:00:00'))
              return (
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${overdue ? 'text-red-400 border-red-500/30 bg-red-500/10' : 'text-blue-400 border-blue-500/30 bg-blue-500/10'}`}>
                  {overdue ? '⚠ ' : ''}{fmt}
                </span>
              )
            })()}

            {/* CRM durum rozeti + dropdown */}
            <div ref={statusRef} className="relative">
              <button
                type="button"
                onClick={() => setStatusOpen(v => !v)}
                className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${CRM_STATUS_BADGE[crmStatus]} flex items-center gap-1`}
              >
                {CRM_STATUS_LABELS[crmStatus]}
                <span className="text-[8px]">▾</span>
              </button>
              {statusOpen && (
                <div className="absolute right-0 top-full mt-1 w-32 bg-[#1c1c22] border border-white/[0.12] rounded-xl shadow-2xl overflow-hidden z-40">
                  {(Object.keys(CRM_STATUS_LABELS) as CRMStatus[]).map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => { onStatusChange(s); setStatusOpen(false) }}
                      className={`w-full text-left px-3 py-2 text-[11px] font-semibold transition-colors hover:bg-white/[0.07] ${
                        s === crmStatus ? 'text-white' : 'text-zinc-400'
                      }`}
                    >
                      {CRM_STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* En büyük eksik */}
        <div className="flex items-start gap-2 mb-3 pl-1">
          <span className="text-orange-400 font-black shrink-0 text-sm leading-snug mt-px">▸</span>
          <p className="text-sm font-bold text-white leading-snug">{heroGap}</p>
        </div>

        {/* Satış açısı */}
        <div className="rounded-xl bg-blue-500/[0.07] border border-blue-500/20 px-4 py-3">
          <p className="text-sm text-blue-200 leading-relaxed">{lead.pitch}</p>
        </div>

        {/* Not + Takip tarihi */}
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={localNote}
            onChange={e => handleNoteChange(e.target.value)}
            placeholder="Not ekle… (otomatik kaydedilir)"
            className="flex-1 min-w-0 bg-white/[0.04] border border-white/[0.08] text-zinc-300 rounded-xl px-3 py-2 text-xs placeholder-zinc-700 focus:outline-none focus:ring-1 focus:ring-blue-500/30 transition"
          />
          <input
            type="date"
            value={localFollowUp}
            min={new Date().toISOString().slice(0, 10)}
            onChange={e => {
              const val = e.target.value || null
              setLocalFollowUp(val ?? '')
              onFollowUpChange(val)
            }}
            title="Takip tarihi"
            className="bg-white/[0.04] border border-white/[0.08] text-zinc-400 rounded-xl px-2 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/30 transition cursor-pointer w-[130px] shrink-0"
          />
        </div>
      </div>

      {/* ── KATMAN 2: İkincil bilgiler ──────────────────────────────────── */}
      <div className="px-5 pt-3 pb-4 border-t border-white/[0.09]">
        {/* Temel künye */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm mb-3">
          {lead.rating !== null ? (
            <span className="flex items-center gap-1">
              <span className="text-yellow-400 text-xs">★</span>
              <span className="font-semibold text-zinc-200 text-sm">{lead.rating.toFixed(1)}</span>
            </span>
          ) : (
            <span className="text-zinc-600 text-xs">Puan yok</span>
          )}
          <span className="text-white/10">·</span>
          <span className="text-xs text-zinc-500">{lead.reviewCount.toLocaleString('tr-TR')} yorum</span>
          {lead.googleMapsUri && (
            <>
              <span className="text-white/10">·</span>
              <a
                href={lead.googleMapsUri}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-zinc-500 hover:text-blue-400 transition-colors"
              >
                Haritada gör
              </a>
            </>
          )}
        </div>

        {/* Hizmet öncelik etiketleri */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {services.map(s => (
            <span
              key={s.label}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                s.urgent
                  ? 'bg-orange-500/10 text-orange-400 border-orange-500/20'
                  : 'bg-white/[0.04] text-zinc-600 border-white/[0.06]'
              }`}
            >
              {s.urgent && <span className="mr-0.5 font-black">!</span>}
              {s.label}
            </span>
          ))}
        </div>

        {/* ── İletişim ─────────────────────────────────────────────────── */}
        {(lead.phone || lead.email) && (
          <div className="flex flex-wrap gap-2 mb-3">
            {lead.phone && (
              <div className="flex items-center gap-0 bg-white/[0.04] border border-white/[0.08] rounded-lg overflow-hidden">
                <a
                  href={`tel:${lead.phone}`}
                  className="pl-2.5 pr-2 py-1.5 text-xs text-zinc-300 hover:text-white transition-colors font-medium leading-none"
                >
                  📞 {lead.phone}
                </a>
                <button
                  type="button"
                  onClick={() => copyText(lead.phone!, 'phone')}
                  title="Kopyala"
                  className="px-2 py-1.5 border-l border-white/[0.08] text-[11px] text-zinc-600 hover:text-white hover:bg-white/[0.08] transition-colors leading-none"
                >
                  {copiedKey === 'phone' ? '✓' : '⎘'}
                </button>
              </div>
            )}
            {lead.email && (
              <div className="flex items-center gap-0 bg-white/[0.04] border border-white/[0.08] rounded-lg overflow-hidden">
                <a
                  href={`mailto:${lead.email}`}
                  className="pl-2.5 pr-1.5 py-1.5 text-xs text-zinc-300 hover:text-white transition-colors font-medium leading-none flex items-center gap-1.5"
                >
                  ✉ {lead.email}
                  {lead.siteAnalysis?.hasCorpEmail === false && lead.email === lead.siteAnalysis?.emailAddress && (
                    <span className="text-[9px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-1 py-px rounded font-semibold">
                      ücretsiz
                    </span>
                  )}
                  {lead.email !== lead.siteAnalysis?.emailAddress && (
                    <span className="text-[9px] bg-white/5 text-zinc-600 border border-white/10 px-1 py-px rounded font-semibold">
                      arama
                    </span>
                  )}
                </a>
                <button
                  type="button"
                  onClick={() => copyText(lead.email!, 'email')}
                  title="Kopyala"
                  className="px-2 py-1.5 border-l border-white/[0.08] text-[11px] text-zinc-600 hover:text-white hover:bg-white/[0.08] transition-colors leading-none"
                >
                  {copiedKey === 'email' ? '✓' : '⎘'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Buton grubu */}
        <div className="flex items-center gap-2 pt-3 border-t border-white/[0.09]">
          {/* Takibe Al — icon */}
          <button
            type="button"
            onClick={onMonitor}
            title={isMonitored ? 'Takipten Çıkar' : 'Takibe Al'}
            className={`w-8 h-8 flex items-center justify-center rounded-lg border text-sm transition-colors shrink-0 ${
              isMonitored
                ? 'border-blue-500/40 bg-blue-500/10 text-blue-400'
                : 'border-white/[0.12] text-zinc-500 hover:text-white hover:bg-white/[0.06]'
            }`}
          >
            👁
          </button>

          {/* PDF — icon */}
          <button
            type="button"
            onClick={handlePdf}
            disabled={pdfLoading}
            title="PDF Rapor İndir"
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-white/[0.12] text-zinc-500 hover:text-white hover:bg-white/[0.06] text-xs transition-colors shrink-0 disabled:opacity-50"
          >
            {pdfLoading ? (
              <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
            ) : '⬇'}
          </button>

          {/* Takip mesajı (contacted durumunda) */}
        </div>
      </div>

      {/* ── AÇILIR DÜĞME ────────────────────────────────────────────────── */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full border-t border-white/[0.08] px-5 py-2.5 text-xs text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] flex items-center justify-center gap-1.5 transition-colors font-medium"
      >
        {expanded ? 'Detayları gizle ▲' : 'Detayları gör ▼'}
      </button>

      {/* ── KATMAN 3: Tab detayları ──────────────────────────────────────── */}
      {expanded && (
        <div className="border-t border-white/[0.08]">

          {/* Tab bar */}
          <div className="flex items-center overflow-x-auto border-b border-white/[0.06] bg-[#17171d] px-2 gap-0.5">
            {([
              { id: 'google',    label: 'Google',   count: googleBadgeCount },
              { id: 'web',       label: 'Web',       count: webBadgeCount },
              { id: 'sosyal',    label: 'Sosyal',    count: socialBadgeCount },
              { id: 'reklamlar', label: 'Reklamlar', count: adsBadgeCount },
              { id: 'firsat',    label: 'Fırsat',    count: 0 },
            ] as { id: DetailTab; label: string; count: number }[]).map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors shrink-0 ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-white'
                    : 'border-transparent text-zinc-600 hover:text-zinc-400'
                }`}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[1rem] h-4 text-[9px] font-black bg-red-500/80 text-white rounded-full px-1 leading-none">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab içerikleri */}
          <div className="bg-[#17171d]">

          {/* Web / Site */}
          {activeTab === 'web' && (() => {
            const s = lead.siteAnalysis
            const siteProblems: React.ReactNode[] = []
            if (!lead.website) {
              siteProblems.push(<Row key="no-site" label="Web Sitesi"><span className="text-xs text-red-400 font-medium">✕ Web sitesi yok</span></Row>)
            }
            if (s) {
              if (!s.ssl) siteProblems.push(<Row key="ssl" label="SSL"><span className="text-xs font-medium text-red-400">✕ Güvensiz (HTTP)</span></Row>)
              if (s.mobileScore !== null && s.mobileScore < 70)
                siteProblems.push(<Row key="mob" label="Mobil Hız"><span className={`text-xs font-semibold ${s.mobileScore < 50 ? 'text-red-400' : 'text-amber-400'}`}>{s.mobileScore}/100</span></Row>)
              if (!s.hasPixel && !s.hasGoogleAds)
                siteProblems.push(<Row key="px" label="Reklam Kodu"><span className="text-xs font-medium text-red-400">{s.hasAnalytics ? '✕ Pixel & Ads yok (Analytics var)' : '✕ Hiçbir reklam kodu yok'}</span></Row>)
              else if (!s.hasPixel)
                siteProblems.push(<Row key="px2" label="Meta Pixel"><span className="text-xs font-medium text-red-400">✕ Yok</span></Row>)
              else if (!s.hasGoogleAds)
                siteProblems.push(<Row key="ga" label="Google Ads Kodu"><span className="text-xs font-medium text-amber-400">✕ Yok</span></Row>)
              if (!s.hasSocialLinks) siteProblems.push(<Row key="soc" label="Sosyal Linkler"><span className="text-xs font-medium text-red-400">✕ Yok</span></Row>)
              if (s.pageTitle === null || s.pageTitle.length < 20)
                siteProblems.push(<Row key="title" label="Sayfa Başlığı"><span className={`text-xs font-semibold ${s.pageTitle === null ? 'text-red-400' : 'text-red-400'}`}>{s.pageTitle === null ? '✕ Başlık yok' : `${s.pageTitle.slice(0,40)}${s.pageTitle.length > 40 ? '…' : ''} (${s.pageTitle.length} kr)`}</span></Row>)
              if (!s.hasMetaDesc) siteProblems.push(<Row key="meta" label="Meta Açıklama"><span className="text-xs font-medium text-red-400">✕ Yok</span></Row>)
              if (!s.pageHasPhone) siteProblems.push(<Row key="tel" label="Tel (Sayfada)"><span className="text-xs font-medium text-red-400">✕ Yok</span></Row>)
              if (!s.hasWhatsApp) siteProblems.push(<Row key="wa" label="WhatsApp"><span className="text-xs font-medium text-red-400">✕ Butonu Yok</span></Row>)
              if (!s.hasClickablePhone) siteProblems.push(<Row key="cl" label="Tel Link"><span className="text-xs font-medium text-amber-400">✕ Statik</span></Row>)
              if (!s.hasBookingSystem) siteProblems.push(<Row key="bk" label="Rezervasyon"><span className="text-xs font-medium text-red-400">✕ Yok</span></Row>)
              if (!s.hasContactForm) siteProblems.push(<Row key="cf" label="İletişim Formu"><span className="text-xs font-medium text-red-400">✕ Yok</span></Row>)
              if (!s.hasLocalBusinessSchema) siteProblems.push(<Row key="sc" label="Schema"><span className="text-xs font-medium text-red-400">✕ Yok</span></Row>)
              if (!s.hasOnlinePayment && lead.categoryProfile.website >= 3)
                siteProblems.push(<Row key="pay" label="Online Ödeme"><span className="text-xs font-medium text-red-400">✕ Yok</span></Row>)
              if (!s.hasGTM && (s.hasPixel || s.hasGoogleAds || s.hasAnalytics))
                siteProblems.push(<Row key="gtm" label="GTM"><span className="text-xs font-medium text-amber-400">✕ Yok</span></Row>)
              if (s.hasContactForm && !s.contactFormHasPhone)
                siteProblems.push(<Row key="cfp" label="Form'da Tel"><span className="text-xs font-medium text-amber-400">✕ Yok</span></Row>)
              if (s.emailAddress && s.hasCorpEmail === false)
                siteProblems.push(<Row key="email" label="E-posta"><span className="flex items-center gap-1.5"><span className="text-xs text-zinc-300">{s.emailAddress}</span><span className="text-[10px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded font-medium">ücretsiz servis</span></span></Row>)
            }
            return (
              <section className="px-5 py-4">
                <h4 className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                  Web / Site
                  {lead.website && <a href={lead.website} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline font-normal normal-case">{safeHostname(lead.website)}{lead.websiteSource === 'discovered' ? ' ↗︎' : ''}</a>}
                  {siteProblems.length > 0 && <span className="text-red-400">({siteProblems.length} sorun)</span>}
                </h4>

                {/* ── Hız & SEO Pano — her zaman göster ── */}
                {s && (
                  <div className="mb-4">
                    {/* Performans + SEO skorları */}
                    <div className="grid grid-cols-3 gap-2 mb-2">
                      {[
                        { label: 'Mobil',      value: s.mobileScore,          color: perfColor(s.mobileScore) },
                        { label: 'Masaüstü',   value: s.desktopScore,         color: perfColor(s.desktopScore) },
                        { label: 'SEO Skoru',  value: s.lighthouseSeoScore,   color: seoLighthouseColor(s.lighthouseSeoScore) },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="bg-black/20 rounded-lg px-2 py-2 text-center">
                          <div className="text-[9px] text-zinc-600 mb-0.5">{label}</div>
                          <div className={`text-sm font-black ${color}`}>
                            {value != null ? value : '—'}
                          </div>
                          <div className="text-[8px] text-zinc-700">/100</div>
                        </div>
                      ))}
                    </div>
                    {/* Core Web Vitals */}
                    {(s.lcp != null || s.cls != null || s.tbt != null) && (
                      <div className="grid grid-cols-3 gap-2">
                        {s.lcp != null && (
                          <div className="bg-black/20 rounded-lg px-2 py-2 text-center">
                            <div className="text-[9px] text-zinc-600 mb-0.5">LCP</div>
                            <div className={`text-sm font-black ${lcpColor(s.lcp)}`}>{s.lcp.toFixed(1)}s</div>
                            <div className="text-[8px] text-zinc-700">{s.lcp <= 2.5 ? 'iyi' : s.lcp <= 4 ? 'orta' : 'yavaş'}</div>
                          </div>
                        )}
                        {s.cls != null && (
                          <div className="bg-black/20 rounded-lg px-2 py-2 text-center">
                            <div className="text-[9px] text-zinc-600 mb-0.5">CLS</div>
                            <div className={`text-sm font-black ${clsColor(s.cls)}`}>{s.cls.toFixed(2)}</div>
                            <div className="text-[8px] text-zinc-700">{s.cls <= 0.1 ? 'iyi' : s.cls <= 0.25 ? 'orta' : 'kötü'}</div>
                          </div>
                        )}
                        {s.tbt != null && (
                          <div className="bg-black/20 rounded-lg px-2 py-2 text-center">
                            <div className="text-[9px] text-zinc-600 mb-0.5">TBT</div>
                            <div className={`text-sm font-black ${tbtColor(s.tbt)}`}>{s.tbt}ms</div>
                            <div className="text-[8px] text-zinc-700">{s.tbt <= 200 ? 'iyi' : s.tbt <= 600 ? 'orta' : 'yavaş'}</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Sorun listesi ── */}
                {siteProblems.length > 0 ? (
                  <dl className="space-y-2">{siteProblems}</dl>
                ) : lead.siteAnalysis ? (
                  <p className="text-xs text-emerald-400 font-medium">✓ Tespit edilen sorun yok</p>
                ) : (
                  <p className="text-xs text-zinc-500">Site içeriği okunamadı — erişim engeli veya yönlendirme (JS sitesi) olabilir.</p>
                )}
                {lead.websiteSource === 'discovered' && (
                  <p className="text-[11px] text-amber-400 bg-amber-500/10 rounded px-2 py-1.5 mt-2 leading-relaxed">
                    Google profilinde değil, domain tahminiyle bulundu — doğrulanmalı.
                  </p>
                )}
                {lead.domainInfo && (
                  <p className="text-[11px] text-zinc-600 mt-2">Domain yaşı: {lead.domainInfo.ageYears} yıl</p>
                )}
              </section>
            )
          })()}

          {/* Google Business */}
          {activeTab === 'google' && (() => {
            const gProblems: React.ReactNode[] = []
            if (lead.googleBusinessScore < 75)
              gProblems.push(<Row key="score" label="Profil Dolgunluğu"><span className={`text-xs font-semibold ${lead.googleBusinessScore < 50 ? 'text-red-400' : 'text-amber-400'}`}>%{lead.googleBusinessScore}</span></Row>)
            if (lead.photoCount < 5)
              gProblems.push(<Row key="photo" label="Fotoğraflar"><span className={`text-xs font-semibold ${lead.photoCount === 0 ? 'text-red-400' : 'text-amber-400'}`}>{lead.photoCount === 0 ? 'Yok' : `${lead.photoCount} adet`}</span></Row>)
            if (!lead.hasOpeningHours)
              gProblems.push(<Row key="hrs" label="Çalışma Saatleri"><span className="text-xs font-medium text-red-400">✕ Girilmemiş</span></Row>)
            if (lead.lastReviewDate && Math.floor((Date.now() - new Date(lead.lastReviewDate).getTime()) / 86_400_000) > 90)
              gProblems.push(<Row key="rev" label="Son Yorum"><span className="text-xs font-semibold text-red-400">{formatDate(lead.lastReviewDate)}</span></Row>)
            if (!lead.hasGoogleDescription)
              gProblems.push(<Row key="desc" label="G. Açıklama"><span className="text-xs font-medium text-red-400">✕ Yok</span></Row>)
            if (lead.businessStatus !== 'OPERATIONAL')
              gProblems.push(<Row key="status" label="Durum"><span className={`text-xs font-semibold ${lead.businessStatus === 'CLOSED_PERMANENTLY' ? 'text-red-400' : 'text-orange-400'}`}>{lead.businessStatus === 'CLOSED_PERMANENTLY' ? '⛔ Kalıcı Kapalı' : '⚠ Geçici Kapalı'}</span></Row>)
            return (
              <section className="px-5 py-4">
                <h4 className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                  Google Business
                  {price && <span className="text-zinc-500 font-normal normal-case">{price}</span>}
                  {type && <span className="text-zinc-500 font-normal normal-case">· {type}</span>}
                  {gProblems.length > 0 && <span className="text-red-400">({gProblems.length} sorun)</span>}
                </h4>
                {gProblems.length > 0 ? (
                  <dl className="space-y-2">{gProblems}</dl>
                ) : (
                  <p className="text-xs text-emerald-400 font-medium">✓ Profil eksiksiz görünüyor</p>
                )}
              </section>
            )
          })()}

          {/* Sosyal Medya */}
          {activeTab === 'sosyal' && (() => {
            const ig = lead.instagram
            const igProblems: React.ReactNode[] = []
            if (ig) {
              if (ig.activity !== 'active' && ig.activity !== 'unknown')
                igProblems.push(<Row key="act" label="Aktivite"><span className={`text-xs font-semibold ${igActivity[ig.activity].cls}`}>{igActivity[ig.activity].label}</span></Row>)
              if (ig.bioLength !== null && ig.bioLength !== undefined && ig.bioLength < 80)
                igProblems.push(<Row key="bio" label="Bio Uzunluğu"><span className={`text-xs font-semibold ${ig.bioLength < 30 ? 'text-red-400' : 'text-amber-400'}`}>{ig.bioLength} karakter</span></Row>)
              if (!ig.bioHasPhone) igProblems.push(<Row key="bph" label="Bio Telefon"><span className="text-xs font-medium text-red-400">✕ Yok</span></Row>)
              if (!ig.bioHasUrl) igProblems.push(<Row key="burl" label="Bio Link"><span className="text-xs font-medium text-red-400">✕ Yok</span></Row>)
              if (ig.engagementRate != null && ig.engagementRate < 3)
                igProblems.push(<Row key="eng" label="Etkileşim Oranı"><span className={`text-xs font-semibold ${ig.engagementRate < 1 ? 'text-red-400' : 'text-amber-400'}`}>%{ig.engagementRate.toFixed(1)}</span></Row>)
              if (ig.weeklyPostFreq != null && ig.weeklyPostFreq < 2)
                igProblems.push(<Row key="freq" label="Haftalık Sıklık"><span className={`text-xs font-semibold ${ig.weeklyPostFreq < 1 ? 'text-red-400' : 'text-amber-400'}`}>{ig.weeklyPostFreq} gönderi/hafta</span></Row>)
              if (ig.usesReels === false) igProblems.push(<Row key="reel" label="Reels"><span className="text-xs font-medium text-amber-400">✕ Kullanmıyor</span></Row>)
            }
            const fb = lead.facebook
            const fbProblems: React.ReactNode[] = []
            if (fb && fb.activity !== 'active' && fb.activity !== 'unknown')
              fbProblems.push(<Row key="fbact" label="Facebook Aktivite"><span className={`text-xs font-semibold ${fb.activity === 'neglected' ? 'text-red-400' : 'text-amber-400'}`}>{fb.activity === 'neglected' ? 'İhmal Edilmiş' : 'Durgun'}</span></Row>)
            const tt = lead.tiktok
            const ttProblems: React.ReactNode[] = []
            if (tt && tt.activity !== 'active')
              ttProblems.push(<Row key="ttact" label="TikTok Aktivite"><span className={`text-xs font-semibold ${tt.activity === 'neglected' ? 'text-red-400' : 'text-amber-400'}`}>{tt.activity === 'neglected' ? 'İhmal Edilmiş' : 'Durgun'}</span></Row>)
            const allSocialProblems = igProblems.length + fbProblems.length + ttProblems.length
            return (
              <section className="px-5 py-4">
                <h4 className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                  Sosyal Medya
                  {allSocialProblems > 0 && <span className="text-red-400">({allSocialProblems} sorun)</span>}
                </h4>
                <dl className="space-y-2">
                  {lead.instagramHandle ? (
                    <Row label="Instagram">
                      <span className="flex items-center gap-1.5 flex-wrap">
                        <a href={`https://instagram.com/${lead.instagramHandle}`} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-pink-400 hover:underline">@{lead.instagramHandle}</a>
                        {ig && (() => { const b = igBadge(ig.confidence); return <span title={ig.confidenceReason} className={`px-1.5 py-0.5 rounded text-[10px] font-semibold cursor-default ${b.cls}`}>{b.label}</span> })()}
                        {ig?.followersCount != null && <span className="text-xs text-zinc-500">{formatCount(ig.followersCount)} takipçi</span>}
                      </span>
                    </Row>
                  ) : (
                    <Row label="Instagram"><span className="text-xs text-zinc-600">Hesap bulunamadı</span></Row>
                  )}
                  {igProblems}
                  {fb ? (
                    <Row label="Facebook">
                      <span className="flex items-center gap-1.5 flex-wrap">
                        <a href={fb.pageUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-blue-400 hover:underline">{fb.handle}</a>
                        {(() => { const b = fbBadge(fb.confidence); return <span title={fb.confidenceReason} className={`px-1.5 py-0.5 rounded text-[10px] font-semibold cursor-default ${b.cls}`}>{b.label}</span> })()}
                        {fb.followersCount != null && <span className="text-xs text-zinc-500">{formatCount(fb.followersCount)} takipçi</span>}
                      </span>
                    </Row>
                  ) : (
                    <Row label="Facebook"><span className="text-xs text-zinc-600">Hesap bulunamadı</span></Row>
                  )}
                  {fbProblems}
                  {tt ? (
                    <Row label="TikTok">
                      <span className="flex items-center gap-1.5 flex-wrap">
                        <a href={`https://tiktok.com/@${tt.handle}`} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-zinc-300 hover:underline">@{tt.handle}</a>
                        {(() => { const b = ttBadge(tt.confidence); return <span title={tt.confidenceReason} className={`px-1.5 py-0.5 rounded text-[10px] font-semibold cursor-default ${b.cls}`}>{b.label}</span> })()}
                        {tt.followersCount != null && <span className="text-xs text-zinc-500">{formatCount(tt.followersCount)} takipçi</span>}
                      </span>
                    </Row>
                  ) : (
                    <Row label="TikTok"><span className="text-xs text-zinc-600">Hesap bulunamadı</span></Row>
                  )}
                  {ttProblems}
                  {lead.platforms?.linkedinUrl && (
                    <Row label="LinkedIn">
                      <a href={lead.platforms.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-blue-300 hover:underline truncate block max-w-[200px]">
                        {lead.platforms.linkedinUrl.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                      </a>
                    </Row>
                  )}
                </dl>
                {ig?.confidence === 'possible' && (
                  <p className="text-[11px] text-amber-400 bg-amber-500/10 rounded px-2 py-1.5 mt-2 leading-relaxed">{ig.confidenceReason}</p>
                )}
              </section>
            )
          })()}

          {/* Reklamlar */}
          {activeTab === 'reklamlar' && (() => {
            const s = lead.siteAnalysis
            const adsProblems: React.ReactNode[] = []

            // Google Ads / Pixel durumu
            if (s) {
              if (!s.hasPixel && !s.hasGoogleAds) {
                adsProblems.push(
                  <Row key="nopx" label="Reklam Kodu">
                    <span className="text-xs font-medium text-red-400">
                      {s.hasAnalytics ? '✕ Pixel ve Ads kodu yok (yalnızca Analytics var)' : '✕ Hiçbir reklam/dönüşüm kodu yok'}
                    </span>
                  </Row>
                )
              }
              if (lead.metaAds?.hasHistoricalAds && !lead.metaAds.hasActiveAds) {
                adsProblems.push(
                  <Row key="metastopped" label="Meta Reklamlar">
                    <span className="text-xs font-semibold text-orange-400">
                      {lead.metaAds.totalAdCount} reklam geçmişte verilmiş — şu an durmuş
                    </span>
                  </Row>
                )
              }
            }

            return (
              <section className="px-5 py-4">
                <h4 className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-3">
                  Reklam Altyapısı
                  {adsProblems.length > 0 && <span className="text-red-400 ml-2">({adsProblems.length} sorun)</span>}
                </h4>

                {/* Google Ads (pixel/kod) */}
                <div className="mb-4">
                  <p className="text-[10px] font-bold text-zinc-700 uppercase tracking-wider mb-2">Web Sitesi Reklam Kodları</p>
                  {!lead.website ? (
                    <p className="text-xs text-zinc-600">Web sitesi olmadığı için reklam kodu kontrol edilemedi.</p>
                  ) : !s ? (
                    <p className="text-xs text-zinc-600">Site içeriği okunamadı — reklam kodu kontrol edilemedi.</p>
                  ) : (
                    <dl className="space-y-2">
                      <Row label="Meta Pixel">
                        {s.hasPixel
                          ? <span className="text-xs font-semibold text-emerald-400">✓ Tespit edildi</span>
                          : <span className="text-xs font-medium text-red-400">✕ Yok</span>}
                      </Row>
                      <Row label="Google Ads Kodu">
                        {s.hasGoogleAds
                          ? <span className="text-xs font-semibold text-emerald-400">✓ Tespit edildi</span>
                          : <span className="text-xs font-medium text-red-400">✕ Yok</span>}
                      </Row>
                      <Row label="Google Tag Manager">
                        {s.hasGTM
                          ? <span className="text-xs font-semibold text-emerald-400">✓ Var</span>
                          : <span className="text-xs text-zinc-600">Yok</span>}
                      </Row>
                      <Row label="Google Analytics">
                        {s.hasAnalytics
                          ? <span className="text-xs font-semibold text-emerald-400">✓ Var</span>
                          : <span className="text-xs text-zinc-600">Yok</span>}
                      </Row>
                    </dl>
                  )}
                </div>

                {/* Meta Reklam Kütüphanesi */}
                <div>
                  <p className="text-[10px] font-bold text-zinc-700 uppercase tracking-wider mb-2">Meta Reklam Kütüphanesi</p>
                  {lead.metaAds ? (
                    <dl className="space-y-2">
                      <Row label="Aktif Reklamlar">
                        {lead.metaAds.hasActiveAds
                          ? <span className="text-xs font-semibold text-emerald-400">✓ {lead.metaAds.activeAdCount} aktif reklam</span>
                          : <span className="text-xs text-zinc-500">Aktif reklam yok</span>}
                      </Row>
                      <Row label="Geçmiş Reklamlar">
                        {lead.metaAds.hasHistoricalAds
                          ? <span className={`text-xs font-semibold ${lead.metaAds.hasActiveAds ? 'text-zinc-400' : 'text-orange-400'}`}>
                              {lead.metaAds.totalAdCount} reklam{lead.metaAds.hasActiveAds ? '' : ' — şu an durmuş'}
                            </span>
                          : <span className="text-xs text-zinc-600">Geçmişte de reklam yok</span>}
                      </Row>
                      <Row label="Güven">
                        {(() => { const b = metaBadge(lead.metaAds.confidence); return <span title={lead.metaAds.confidenceReason} className={`px-1.5 py-0.5 rounded text-[10px] font-semibold cursor-default ${b.cls}`}>{b.label}</span> })()}
                      </Row>
                    </dl>
                  ) : (
                    <p className="text-xs text-zinc-600">Meta Reklam Kütüphanesi'nde eşleşme bulunamadı.</p>
                  )}
                </div>

                {adsProblems.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-white/[0.07]">
                    <p className="text-[10px] font-bold text-zinc-700 uppercase tracking-wider mb-2">Öne Çıkan Sorunlar</p>
                    <dl className="space-y-2">{adsProblems}</dl>
                  </div>
                )}
              </section>
            )
          })()}

          {/* Fırsat Analizi */}
          {activeTab === 'firsat' && <section className="px-5 py-4">
            <h4 className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-3">Fırsat Analizi</h4>
            <div className="space-y-3 mb-4">
              <ScoreBar label="Ödeme Gücü"   value={lead.odemeGucu}   color="bg-blue-500" />
              <ScoreBar label="Açık Şiddeti" value={lead.acikSiddeti} color="bg-orange-500" />
            </div>

            {/* Bölge Lideri Karşılaştırması */}
            {lead.topCompetitor && (
              <div className="mb-4">
                <h5 className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-2">Bölge Lideri</h5>
                <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-3">
                  <p className="text-xs font-semibold text-zinc-300 mb-2 truncate">{lead.topCompetitor.name}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-black/20 rounded-lg px-2.5 py-2">
                      <div className="text-[10px] text-zinc-600 mb-0.5">Yorum (rakip)</div>
                      <div className="text-sm font-bold text-red-400">{lead.topCompetitor.reviewCount.toLocaleString('tr-TR')}</div>
                    </div>
                    <div className="bg-black/20 rounded-lg px-2.5 py-2">
                      <div className="text-[10px] text-zinc-600 mb-0.5">Yorum (bu işletme)</div>
                      <div className="text-sm font-bold text-zinc-300">{lead.reviewCount.toLocaleString('tr-TR')}</div>
                    </div>
                  </div>
                  {lead.topCompetitor.reviewCount > lead.reviewCount && (
                    <p className="text-[11px] text-amber-400 mt-2 leading-relaxed">
                      Rakip <span className="font-bold">{(lead.topCompetitor.reviewCount / Math.max(lead.reviewCount, 1)).toFixed(1)}×</span> daha fazla yorumla görünürlükte öne geçiyor.
                    </p>
                  )}
                </div>
              </div>
            )}

            {restGaps.length > 0 && (
              <>
                <h5 className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-2">Diğer Eksikler</h5>
                <ul className="space-y-1.5">
                  {(showAllGaps ? restGaps : restGaps.slice(0, 5)).map((gap, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-zinc-400">
                      <span className="text-white/20 shrink-0 mt-px">▸</span>
                      {gap}
                    </li>
                  ))}
                </ul>
                {restGaps.length > 5 && (
                  <button
                    onClick={() => setShowAllGaps(v => !v)}
                    className="mt-2 text-xs text-blue-400 hover:text-blue-300 font-medium"
                  >
                    {showAllGaps ? '▲ Daha az göster' : `▼ +${restGaps.length - 5} daha göster`}
                  </button>
                )}
              </>
            )}
          </section>}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Skeleton kart (yükleme yer tutucusu) ─────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-[#1c1c22] border border-white/[0.07] rounded-2xl p-5 overflow-hidden relative">
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_infinite] bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex-1 space-y-2">
          <div className="h-3.5 w-2/3 bg-white/[0.06] rounded-full" />
          <div className="h-2.5 w-1/2 bg-white/[0.04] rounded-full" />
        </div>
        <div className="w-16 h-10 bg-white/[0.05] rounded-xl shrink-0" />
      </div>
      <div className="h-2.5 w-full bg-white/[0.05] rounded-full mb-2" />
      <div className="h-2.5 w-4/5 bg-white/[0.04] rounded-full mb-4" />
      <div className="h-12 bg-white/[0.04] rounded-xl mb-3" />
      <div className="flex gap-2 mt-3 pt-3 border-t border-white/[0.07]">
        <div className="w-8 h-8 bg-white/[0.05] rounded-lg shrink-0" />
        <div className="w-8 h-8 bg-white/[0.05] rounded-lg shrink-0" />
        <div className="flex-1 h-8 bg-white/[0.08] rounded-lg" />
      </div>
    </div>
  )
}

// ─── Aşamalı yükleniyor göstergesi ───────────────────────────────────────────

function ProgressLoader({ step }: { step: number }) {
  const current = LOADING_STEPS[Math.min(step, LOADING_STEPS.length - 1)]
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-5">
      <div className="relative h-12 w-12">
        <div className="absolute inset-0 rounded-full border-4 border-white/10" />
        <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-r-transparent animate-spin" />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-zinc-200">{current.text}</p>
        <p className="text-xs text-zinc-600 mt-1">{current.sub}</p>
      </div>
      <div className="flex items-center gap-2">
        {LOADING_STEPS.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all duration-500 ${
              i < step ? 'w-4 bg-blue-500' : i === step ? 'w-6 bg-blue-400' : 'w-1.5 bg-white/10'
            }`}
          />
        ))}
      </div>
      <p className="text-[11px] text-zinc-700">Bu işlem ~30–60 saniye sürebilir</p>
    </div>
  )
}

// ─── Sektör Listesi ───────────────────────────────────────────────────────────

const SECTOR_GROUPS: { label: string; options: { label: string; search: string }[] }[] = [
  {
    label: 'Sağlık',
    options: [
      { label: 'Diş kliniği',                   search: 'diş kliniği' },
      { label: 'Estetik/güzellik kliniği',       search: 'estetik kliniği' },
      { label: 'Özel klinik/poliklinik',         search: 'özel klinik' },
      { label: 'Fizyoterapi',                    search: 'fizyoterapi' },
      { label: 'Diyetisyen',                     search: 'diyetisyen' },
      { label: 'Veteriner',                      search: 'veteriner' },
      { label: 'Optik/gözlük',                  search: 'optik' },
      { label: 'Psikolog/danışmanlık merkezi',   search: 'psikolog' },
    ],
  },
  {
    label: 'Güzellik & Bakım',
    options: [
      { label: 'Kuaför/berber',        search: 'kuaför' },
      { label: 'Güzellik merkezi',     search: 'güzellik merkezi' },
      { label: 'Cilt bakım/spa',       search: 'cilt bakım merkezi' },
      { label: 'Tırnak/nail art',      search: 'nail art' },
      { label: 'Epilasyon merkezi',    search: 'epilasyon merkezi' },
      { label: 'Dövme/piercing',       search: 'dövme' },
      { label: 'Masaj salonu',         search: 'masaj salonu' },
    ],
  },
  {
    label: 'Yeme & İçme',
    options: [
      { label: 'Restoran',       search: 'restoran' },
      { label: 'Kafe',           search: 'kafe' },
      { label: 'Pastane/fırın',  search: 'pastane' },
      { label: 'Fast food',      search: 'fast food' },
      { label: 'Bar/pub',        search: 'bar' },
      { label: 'Catering',       search: 'catering' },
    ],
  },
  {
    label: 'Konaklama & Turizm',
    options: [
      { label: 'Otel',                 search: 'otel' },
      { label: 'Butik otel/pansiyon',  search: 'butik otel' },
      { label: 'Tatil köyü',           search: 'tatil köyü' },
      { label: 'Seyahat acentesi',     search: 'seyahat acentesi' },
    ],
  },
  {
    label: 'Hizmet & Yerel İşletme',
    options: [
      { label: 'Emlak ofisi',               search: 'emlak ofisi' },
      { label: 'Oto servis/lastik',         search: 'oto servis' },
      { label: 'Halı yıkama',               search: 'halı yıkama' },
      { label: 'Kuru temizleme',            search: 'kuru temizleme' },
      { label: 'Nakliyat',                  search: 'nakliyat' },
      { label: 'Tesisatçı/elektrikçi',      search: 'tesisatçı' },
      { label: 'Çilingir',                  search: 'çilingir' },
      { label: 'Peyzaj/bahçe',              search: 'peyzaj bahçe' },
    ],
  },
  {
    label: 'Profesyonel Hizmetler',
    options: [
      { label: 'Avukat/hukuk bürosu',      search: 'avukat' },
      { label: 'Mali müşavir/muhasebe',    search: 'mali müşavir' },
      { label: 'Sigorta acentesi',         search: 'sigorta acentesi' },
      { label: 'Emlak danışmanı',          search: 'emlak danışmanı' },
      { label: 'Mimarlık/iç mimarlık',     search: 'mimar' },
    ],
  },
  {
    label: 'Perakende & Mağaza',
    options: [
      { label: 'Giyim mağazası',       search: 'giyim mağazası' },
      { label: 'Mobilya',              search: 'mobilya mağazası' },
      { label: 'Çiçekçi',             search: 'çiçekçi' },
      { label: 'Kuyumcu',             search: 'kuyumcu' },
      { label: 'Pet shop',            search: 'pet shop' },
      { label: 'Spor/fitness salonu', search: 'spor salonu' },
    ],
  },
  {
    label: 'Eğitim & Kurs',
    options: [
      { label: 'Özel ders/etüt',       search: 'özel ders' },
      { label: 'Dil kursu',            search: 'dil kursu' },
      { label: 'Sürücü kursu',         search: 'sürücü kursu' },
      { label: 'Müzik/sanat kursu',    search: 'müzik kursu' },
      { label: 'Anaokulu/kreş',        search: 'anaokulu' },
    ],
  },
]

const ALL_SECTOR_OPTIONS = SECTOR_GROUPS.flatMap(g =>
  g.options.map(o => ({ ...o, group: g.label }))
)

// ─── Ortak input/select sınıfları ─────────────────────────────────────────────

const inputCls  = 'w-full bg-white/[0.07] border border-white/[0.12] text-white rounded-xl px-3 py-2.5 text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition'
const selectCls = 'w-full bg-white/[0.07] border border-white/[0.12] text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 appearance-none cursor-pointer transition'
const labelCls  = 'block text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5'

// ─── Analiz Sayfası ───────────────────────────────────────────────────────────

function AnalizContent() {
  const searchParams   = useSearchParams()
  const fromWarmLead   = !!searchParams.get('businessName')
  const [searchMode, setSearchMode]         = useState<'bulk' | 'single' | 'sicak'>(
    fromWarmLead ? 'single' : 'bulk'
  )
  const [businessQuery, setBusinessQuery]   = useState(searchParams.get('businessName') ?? '')
  const [sector, setSector]                 = useState('')
  const [selectedIl, setSelectedIl]         = useState(searchParams.get('city') ?? '')
  const [selectedIlce, setSelectedIlce]     = useState('')
  const [cityDisplayValue, setCityDisplayValue] = useState('')
  const [extraCities, setExtraCities]           = useState<Array<{il: string; ilce: string}>>([])

  function addCurrentCity() {
    if (!selectedIl || !selectedIlce) return
    const already = extraCities.some(c => c.il === selectedIl && c.ilce === selectedIlce)
    if (!already) setExtraCities(prev => [...prev, { il: selectedIl, ilce: selectedIlce }])
    setSelectedIl('')
    setSelectedIlce('')
    setCityDisplayValue('')
  }

  function removeExtraCity(idx: number) {
    setExtraCities(prev => prev.filter((_, i) => i !== idx))
  }

  // Sonuçlar
  const [leads, setLeads]         = useState<Lead[]>([])
  const [loading, setLoading]     = useState(false)
  const [loadingStep, setLoadingStep] = useState(0)
  const [loadedCount, setLoadedCount] = useState(0)
  const [error, setError]         = useState<string | null>(null)
  const [searched, setSearched]   = useState(false)

  // Filtre
  const [filter, setFilter] = useState<'all' | 'high' | 'mid' | 'low' | CRMStatus>('all')


  // CRM
  const [crmMap, setCrmMap] = useState<Record<string, { status: CRMStatus; note: string; follow_up_date: string | null }>>({})

  // Monitored
  const [monitoredIds, setMonitoredIds] = useState<Set<string>>(new Set())

  // Kayıtlı aramalar
  const [savedSearches, setSavedSearches]       = useState<SavedSearch[]>([])
  const [savedPanelOpen, setSavedPanelOpen]     = useState(false)
  const [saveNameInput, setSaveNameInput]       = useState('')
  const [showSaveInput, setShowSaveInput]       = useState(false)
  const [savingSearch, setSavingSearch]         = useState(false)
  const [isLoggedIn, setIsLoggedIn]             = useState(false)

  // ── Sıcak Leadler mod state ────────────────────────────────────────────────
  const [warmLeads, setWarmLeads]             = useState<WarmLead[]>([])
  const [warmLeadsLoading, setWarmLeadsLoading] = useState(false)
  const [warmLeadLimit, setWarmLeadLimit]     = useState(10)
  const [warmRegion, setWarmRegion]           = useState<string>('all')
  const [warmSearchDone, setWarmSearchDone]   = useState(false)

  const supabase = createClient()

  // ── Sıcak lead'den gelince otomatik analiz başlat ──
  useEffect(() => {
    if (fromWarmLead && businessQuery.trim().length >= 2) {
      const syntheticEvent = { preventDefault: () => {} } as React.FormEvent
      setTimeout(() => handleSubmit(syntheticEvent), 300)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auth durumu + kayıtlı aramalar ──
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setIsLoggedIn(true)
        listSearches().then(setSavedSearches)
        // Monitored leads
        supabase.from('monitored_leads').select('place_id').then(({ data: monData }) => {
          setMonitoredIds(new Set((monData ?? []).map((r: { place_id: string }) => r.place_id)))
        })
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sıcak lead company_name temizleyici ─────────────────────────────────
  // Bazı eski kayıtlarda company_name alanında iş unvanı metni de olabilir.
  // "Dijital Pazarlama Uzmanı Work Medya" → "Work Medya" gibi temizler.
  function getSearchableCompany(rawName: string, jobTitle: string): string {
    const kwWords = jobTitle
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 3)
      .slice(0, 3)
    for (const kw of kwWords) {
      const idx = rawName.toLowerCase().indexOf(kw)
      if (idx > 3) {
        // kw'dan önce işletme adı var
        const before = rawName.slice(0, idx).trim().replace(/[-–\s]+$/, '')
        if (before.length >= 2) return before
        // kw'dan sonra işletme adı var
        const after = rawName.slice(idx + kw.length).trim().replace(/^[-–\s]+/, '')
        if (after.length >= 2) return after
      }
    }
    return rawName
  }

  // ── Sıcak lead kartından analiz başlat ───────────────────────────────────
  async function handleWarmLeadAnalyze(lead: WarmLead) {
    if (loading) return
    // Sicak moddan çık → normal sonuç alanı görünsün (skeleton + lead kartları)
    setSearchMode('single')
    const companyName = getSearchableCompany(lead.company_name, lead.job_title)
    setBusinessQuery(companyName)
    const cityIl = lead.city?.split(',').map(s => s.trim()).find(s => ILLER.includes(s)) ?? ''
    setSelectedIl(cityIl)
    setLoading(true)
    setError(null)
    setLeads([])
    setSearched(false)
    setLoadedCount(0)
    setFilter('all')
    setCrmMap({})
    const seen = new Set<string>()
    try {
      const url = `/api/analyze?businessName=${encodeURIComponent(companyName)}${cityIl ? '&city=' + encodeURIComponent(cityIl) : ''}`
      await readLeadStream(url, seen)
    } catch {
      setError('Beklenmeyen bir hata oluştu.')
    } finally {
      setLoading(false)
    }
  }

  // ── Sıcak lead arama (Supabase'den filtreli çek) ──────────────────────────
  async function fetchWarmLeads() {
    setWarmLeadsLoading(true)
    setWarmSearchDone(false)
    setWarmLeads([])
    try {
      // Fazla çek, client-side bölge filtresi uygula
      const { data } = await supabase
        .from('warm_leads')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500)
      const all = (data as WarmLead[]) ?? []
      const regionCities = warmRegion === 'all' ? null : BOLGE_CITIES[warmRegion]
      const filtered = regionCities
        ? all.filter(l => regionCities.some(c => l.city?.toLowerCase().includes(c.toLowerCase())))
        : all
      setWarmLeads(filtered.slice(0, warmLeadLimit))
      setWarmSearchDone(true)
    } finally {
      setWarmLeadsLoading(false)
    }
  }

  // ── Aşamalı yükleniyor adımı ──
  useEffect(() => {
    if (!loading) { setLoadingStep(0); return }
    const id = setInterval(() => {
      setLoadingStep(s => Math.min(s + 1, LOADING_STEPS.length - 1))
    }, 9_000)
    return () => clearInterval(id)
  }, [loading])

  // ── Leadler değişince CRM durumlarını yükle ──
  useEffect(() => {
    if (leads.length === 0 || !isLoggedIn) return
    const placeIds = leads.map(l => l.placeId).filter(Boolean) as string[]
    if (placeIds.length === 0) return
    getCRMStatuses(placeIds).then(data => {
      const map: Record<string, { status: CRMStatus; note: string; follow_up_date: string | null }> = {}
      for (const id of placeIds) {
        map[id] = data[id] ?? { status: 'new', note: '', follow_up_date: null }
      }
      setCrmMap(map)
    })
  }, [leads, isLoggedIn]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleCityChange(il: string, ilce: string) {
    setSelectedIl(il)
    setSelectedIlce(ilce)
  }

  // ── NDJSON stream okuyucu — her lead satırı gelince state'e ekler ──
  async function readLeadStream(
    url: string,
    seen: Set<string>,
  ): Promise<void> {
    let res: Response
    try {
      res = await fetch(url)
    } catch {
      setError('Sunucuya bağlanılamadı. Lütfen tekrar deneyin.')
      return
    }
    if (!res.ok) {
      try { const d = await res.json(); setError(d.error ?? 'Beklenmeyen bir hata oluştu.') }
      catch { setError('Beklenmeyen bir hata oluştu.') }
      return
    }
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const msg = JSON.parse(line) as { type: string; data?: Lead; message?: string }
          if (msg.type === 'lead' && msg.data) {
            const key = msg.data.placeId ?? msg.data.name
            if (!seen.has(key)) {
              seen.add(key)
              setLeads(prev => [...prev, msg.data!].sort((a, b) => b.score - a.score))
              setLoadedCount(prev => prev + 1)
              setSearched(true)
            }
          } else if (msg.type === 'error') {
            setError(msg.message ?? 'Analiz başarısız')
          }
        } catch { /* bozuk satır, atla */ }
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading || warmLeadsLoading) return

    // ── Sıcak Leadler modu ─────────────────────────────────────────────────
    if (searchMode === 'sicak') {
      await fetchWarmLeads()
      return
    }

    setLoading(true)
    setError(null)
    setLeads([])
    setSearched(false)
    setLoadedCount(0)
    setFilter('all')
    setCrmMap({})

    const seen = new Set<string>()
    try {
      if (searchMode === 'single') {
        const url = `/api/analyze?businessName=${encodeURIComponent(businessQuery.trim())}&sector=${encodeURIComponent(sector.trim())}${selectedIl ? '&city=' + encodeURIComponent(selectedIl) : ''}`
        await readLeadStream(url, seen)
      } else {
        const allCities = [
          { il: selectedIl, ilce: selectedIlce },
          ...extraCities,
        ]
        await Promise.all(
          allCities.map(({ il, ilce }) =>
            readLeadStream(
              `/api/analyze?sector=${encodeURIComponent(sector.trim())}&city=${encodeURIComponent(`${ilce} ${il}`)}`,
              seen,
            )
          )
        )
      }
    } catch {
      setError('Beklenmeyen bir hata oluştu.')
    } finally {
      setLoading(false)
    }
  }

  const hasCity = selectedIl.length > 0 && selectedIlce.length > 0
  const canSubmit = !loading && !warmLeadsLoading && (
    searchMode === 'sicak'
      ? true
      : searchMode === 'single'
        ? businessQuery.trim().length >= 2
        : sector.trim().length > 0 && (hasCity || extraCities.length > 0)
  )

  // ── CRM handlers ──
  const handleStatusChange = useCallback(async (lead: Lead, status: CRMStatus) => {
    if (!lead.placeId) return
    setCrmMap(m => ({ ...m, [lead.placeId!]: { ...m[lead.placeId!] ?? { note: '', follow_up_date: null }, status } }))
    await upsertCRMStatus(lead.placeId, lead, status, crmMap[lead.placeId]?.note, crmMap[lead.placeId]?.follow_up_date)
  }, [crmMap])

  const handleNoteChange = useCallback(async (lead: Lead, note: string) => {
    if (!lead.placeId) return
    setCrmMap(m => ({ ...m, [lead.placeId!]: { ...m[lead.placeId!] ?? { status: 'new', follow_up_date: null }, note } }))
    await upsertCRMStatus(lead.placeId, lead, crmMap[lead.placeId]?.status ?? 'new', note, crmMap[lead.placeId]?.follow_up_date)
  }, [crmMap])

  const handleFollowUpChange = useCallback(async (lead: Lead, follow_up_date: string | null) => {
    if (!lead.placeId) return
    setCrmMap(m => ({ ...m, [lead.placeId!]: { ...m[lead.placeId!] ?? { status: 'new', note: '' }, follow_up_date } }))
    await upsertCRMStatus(lead.placeId, lead, crmMap[lead.placeId]?.status ?? 'new', crmMap[lead.placeId]?.note, follow_up_date)
  }, [crmMap])

  // ── Monitor handler ──
  async function handleMonitor(lead: Lead) {
    if (!lead.placeId || !isLoggedIn) return
    if (monitoredIds.has(lead.placeId)) return // already monitored

    await supabase.from('monitored_leads').upsert({
      place_id:  lead.placeId,
      sector,
      city:      extraCities.length > 0
        ? [{ il: selectedIl, ilce: selectedIlce }, ...extraCities].map(c => `${c.ilce} ${c.il}`).join(', ')
        : `${selectedIlce} ${selectedIl}`.trim(),
      lead_data: lead,
      last_score: lead.score,
      notify_score_drop:  true,
      notify_ig_inactive: true,
    }, { onConflict: 'user_id,place_id' })

    setMonitoredIds(s => new Set([...s, lead.placeId!]))
  }

  // ── Kayıtlı aramalar ──
  async function handleSaveSearch() {
    setSavingSearch(true)
    try {
      const cityLabel = extraCities.length > 0
        ? [{ il: selectedIl, ilce: selectedIlce }, ...extraCities].map(c => `${c.ilce} ${c.il}`).join(', ')
        : `${selectedIlce} ${selectedIl}`.trim()
      const saved = await saveSearch(sector, cityLabel, leads, saveNameInput || undefined)
      setSavedSearches(s => [saved, ...s])
      setShowSaveInput(false)
      setSaveNameInput('')
    } finally {
      setSavingSearch(false)
    }
  }

  async function handleLoadSearch(id: string) {
    const s = await loadSearch(id)
    if (!s) return
    setLeads(s.leads)
    setSearched(true)
    setSavedPanelOpen(false)
  }

  async function handleDeleteSearch(id: string) {
    await deleteSearch(id)
    setSavedSearches(s => s.filter(x => x.id !== id))
  }

  // ── CSV Export ──
  function handleCsvExport() {
    const header = ['İşletme', 'Adres', 'Puan', 'Değerlendirme Sayısı', 'Telefon', 'E-posta', 'Web Sitesi', 'Instagram', 'Fırsat Skoru', 'CRM Durumu', 'Not']
    const rows = filteredLeads.map(l => {
      const crm = l.placeId ? crmMap[l.placeId] : undefined
      return [
        l.name,
        l.address ?? '',
        l.rating?.toFixed(1) ?? '',
        l.reviewCount,
        l.phone ?? '',
        l.siteAnalysis?.emailAddress ?? '',
        l.website ?? '',
        l.instagramHandle ? `@${l.instagramHandle}` : '',
        l.score,
        crm ? CRM_STATUS_LABELS[crm.status] : 'Yeni',
        crm?.note ?? '',
      ].map(cell => `"${String(cell).replace(/"/g, '""')}"`)
    })
    const csv = [header.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `leadler-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Filtrelenmiş sonuçlar ──
  const CRM_FILTER_KEYS: CRMStatus[] = ['new', 'contacted', 'in_progress', 'closed', 'rejected']
  const isCrmFilter = CRM_FILTER_KEYS.includes(filter as CRMStatus)

  const filteredLeads = isCrmFilter
    ? leads.filter(l => l.placeId && (crmMap[l.placeId]?.status ?? 'new') === filter)
    : filter === 'all'  ? leads
    : filter === 'high' ? leads.filter(l => l.score >= 70)
    : filter === 'mid'  ? leads.filter(l => l.score >= 40 && l.score < 70)
    : leads.filter(l => l.score < 40)

  const countByLevel = (min: number, max: number) =>
    leads.filter(l => l.score >= min && l.score < max).length

  return (
    <div className="min-h-screen bg-[#111115] text-white">
      <Navbar />

      <div className="max-w-2xl mx-auto px-4 pt-14 pb-12">

        {/* Hero */}
        <div className="text-center mb-8 pt-10">
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
            Lead Fırsat Ajanı
          </h1>
          <p className="text-zinc-500 text-sm mt-2 max-w-sm mx-auto">
            Sektör ve ilçe gir — derin fırsat raporu oluştur.
          </p>
        </div>

        {/* Kayıtlı Aramalar paneli (yalnızca giriş yaptıysa) */}
        {isLoggedIn && savedSearches.length > 0 && (
          <div className="mb-4">
            <button
              onClick={() => setSavedPanelOpen(v => !v)}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl hover:bg-white/[0.07] transition-colors text-xs"
            >
              <span className="text-zinc-400 font-semibold">Kayıtlı Aramalar ({savedSearches.length})</span>
              <span className="text-zinc-600">{savedPanelOpen ? '▲' : '▼'}</span>
            </button>

            {savedPanelOpen && (
              <div className="mt-1 bg-[#1c1c22] border border-white/[0.10] rounded-xl overflow-hidden">
                {savedSearches.map(s => (
                  <div key={s.id} className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.06] last:border-0 hover:bg-white/[0.04] transition-colors">
                    <button
                      onClick={() => handleLoadSearch(s.id)}
                      className="flex-1 text-left min-w-0"
                    >
                      <p className="text-xs font-semibold text-zinc-200 truncate">{s.name ?? `${s.sector} — ${s.city}`}</p>
                      <p className="text-[10px] text-zinc-600">{s.lead_count} lead · {new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' }).format(new Date(s.created_at))}</p>
                    </button>
                    <button
                      onClick={() => handleDeleteSearch(s.id)}
                      className="text-zinc-700 hover:text-red-400 transition-colors text-xs shrink-0"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Form Kartı */}
        <form onSubmit={handleSubmit} className="bg-[#1c1c22] border border-white/[0.12] rounded-2xl p-5 shadow-2xl shadow-black/40 space-y-4">

          {/* Mod toggle */}
          <div className="flex rounded-xl bg-white/[0.08] p-1 gap-0.5">
            <button
              type="button"
              onClick={() => setSearchMode('bulk')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                searchMode === 'bulk' ? 'bg-white/10 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Bölge Tara
            </button>
            <button
              type="button"
              onClick={() => setSearchMode('single')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                searchMode === 'single' ? 'bg-white/10 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              İşletme Ara
            </button>
            <button
              type="button"
              onClick={() => setSearchMode('sicak')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                searchMode === 'sicak'
                  ? 'bg-orange-500/20 text-orange-300 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Sıcak Lead
            </button>
          </div>

          {/* ── Sıcak Lead modu ── */}
          {searchMode === 'sicak' && (
            <>
              <div>
                <label className={labelCls}>Bölge</label>
                <select
                  value={warmRegion}
                  onChange={e => setWarmRegion(e.target.value)}
                  className={selectCls}
                >
                  {Object.entries(BOLGE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Kaç işletme listelensin</label>
                <div className="flex gap-2">
                  {[10, 25, 50, 100].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setWarmLeadLimit(n)}
                      className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-colors ${
                        warmLeadLimit === n
                          ? 'bg-orange-500/20 border-orange-500/40 text-orange-300'
                          : 'bg-white/[0.04] border-white/[0.08] text-zinc-500 hover:text-zinc-200 hover:border-white/20'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── Sektör + şehir alanları (bulk/single modda göster) ── */}
          {searchMode !== 'sicak' && (
            <>
              <div>
                <label className={labelCls}>Sektör</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {POPULAR_SECTORS.map(ps => (
                    <button
                      key={ps.search}
                      type="button"
                      onClick={() => setSector(ps.search)}
                      className={`text-[11px] px-2.5 py-1 rounded-full border font-medium transition-colors ${
                        sector === ps.search
                          ? 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                          : 'bg-white/[0.04] border-white/[0.08] text-zinc-500 hover:text-zinc-300 hover:border-white/20'
                      }`}
                    >
                      {ps.label}
                    </button>
                  ))}
                </div>
                <SectorAutocomplete value={sector} onChange={setSector} />
              </div>

              {/* ── Bölge Tara: şehir autocomplete ── */}
              {searchMode === 'bulk' && (
                <div>
                  <label className={labelCls}>İlçe / Şehir</label>
                  {extraCities.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {extraCities.map((c, i) => (
                        <span key={i} className="flex items-center gap-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full px-2.5 py-0.5 text-xs font-semibold">
                          {c.ilce}, {c.il}
                          <button type="button" onClick={() => removeExtraCity(i)} className="ml-0.5 text-blue-400/60 hover:text-blue-300 leading-none">×</button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <CityAutocomplete
                        value={cityDisplayValue}
                        onChange={(il, ilce) => {
                          handleCityChange(il, ilce)
                          setCityDisplayValue(il && ilce ? `${ilce}, ${il}` : '')
                        }}
                      />
                    </div>
                    {hasCity && (
                      <button
                        type="button"
                        onClick={addCurrentCity}
                        title="Bu ilçeyi ekle ve yeni ilçe seç"
                        className="shrink-0 px-3 py-2 rounded-xl bg-white/[0.07] border border-white/[0.12] text-zinc-400 hover:text-white hover:bg-white/[0.12] text-sm transition-colors"
                      >
                        +
                      </button>
                    )}
                  </div>
                  {hasCity && (
                    <p className="text-[11px] text-zinc-600 mt-1.5">
                      Seçildi: <span className="text-zinc-400">{selectedIlce}, {selectedIl}</span>
                      {extraCities.length === 0 && <span className="ml-1 text-zinc-700">— + ile birden fazla ilçe ekleyin</span>}
                    </p>
                  )}
                </div>
              )}

              {/* ── İşletme Ara: işletme adı + şehir ── */}
              {searchMode === 'single' && (
                <>
                  <div>
                    <label className={labelCls}>İşletme Adı</label>
                    <input
                      type="text"
                      placeholder="Kafe Luna, Dr. Ahmet Yıldız…"
                      value={businessQuery}
                      onChange={e => setBusinessQuery(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Şehir (opsiyonel)</label>
                    <select
                      value={selectedIl}
                      onChange={e => setSelectedIl(e.target.value)}
                      className={selectCls}
                    >
                      <option value="">Şehir seçin</option>
                      {ILLER.map(il => <option key={il} value={il}>{il}</option>)}
                    </select>
                  </div>
                </>
              )}
            </>
          )}

          {/* ── Submit ── */}
          <button
            type="submit"
            disabled={!canSubmit}
            className={`w-full font-bold rounded-xl py-3 text-sm transition-colors ${
              searchMode === 'sicak'
                ? 'bg-orange-600 hover:bg-orange-500 text-white'
                : 'bg-blue-600 hover:bg-blue-500 text-white'
            } ${!canSubmit ? 'opacity-25 cursor-not-allowed' : ''}`}
          >
            {warmLeadsLoading
              ? 'Yükleniyor…'
              : loading
                ? 'Analiz ediliyor…'
                : searchMode === 'sicak'
                  ? `${BOLGE_LABELS[warmRegion]} — ${warmLeadLimit} Lead Getir →`
                  : 'Analiz Et →'
            }
          </button>
        </form>

        {/* ── Sıcak Lead sonuçları ───────────────────────────────────────────── */}
        {searchMode === 'sicak' && warmSearchDone && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-zinc-400">
                <span className="text-white font-semibold">{warmLeads.length} sıcak lead</span>
                {warmRegion !== 'all' && <span className="text-zinc-600"> · {BOLGE_LABELS[warmRegion]}</span>}
              </p>
              <p className="text-[10px] text-zinc-700">
                Dijital pazarlama uzmanı arayan şirketler
              </p>
            </div>
            {warmLeadsLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-28 bg-white/[0.03] border border-white/[0.06] rounded-2xl animate-pulse" />
                ))}
              </div>
            ) : warmLeads.length === 0 ? (
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-5 py-10 text-center">
                <p className="text-zinc-500 text-sm">Bu bölgede kayıtlı sıcak lead yok.</p>
                <p className="text-zinc-600 text-xs mt-1">Cron her gün 07:00&apos;de çalışır ve yeni ilanları ekler.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {warmLeads.map(lead => (
                  <WarmLeadListCard
                    key={lead.id}
                    lead={lead}
                    onAnalyze={handleWarmLeadAnalyze}
                    analyzing={loading}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* İlk lead gelmeden tam ekran loader */}
        {loading && !searched && searchMode !== 'sicak' && (
          <>
            <ProgressLoader step={loadingStep} />
            <div className="space-y-4 mt-2 opacity-60">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          </>
        )}

        {/* Lead'ler gelirken kartların üstünde ince ilerleme çubuğu */}
        {loading && searched && searchMode !== 'sicak' && (
          <div className="flex items-center gap-2.5 py-2 px-1 text-xs text-zinc-500">
            <span className="w-3 h-3 border-2 border-zinc-700 border-t-zinc-400 rounded-full animate-spin shrink-0" />
            <span>{loadedCount} işletme analiz edildi, devam ediyor…</span>
          </div>
        )}

        {/* Hata */}
        {error && !loading && (
          <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/10 px-5 py-4">
            <p className="text-sm font-semibold text-red-400">Hata</p>
            <p className="text-sm text-red-400/80 mt-0.5">{error}</p>
          </div>
        )}

        {/* Boş sonuç */}
        {searched && leads.length === 0 && !loading && !error && (
          <div className="mt-8 rounded-xl border border-white/[0.07] bg-white/[0.02] px-5 py-8 text-center">
            <p className="text-zinc-500 text-sm">Bu arama için sonuç bulunamadı.</p>
            <p className="text-zinc-600 text-xs mt-1">Farklı bir sektör veya ilçe dene.</p>
          </div>
        )}

        {/* Sonuçlar */}
        {leads.length > 0 && !loading && (
          <div className="mt-8">

            {/* Kaydetme alanı */}
            {isLoggedIn && (
              <div className="flex items-center gap-2 mb-4">
                <button
                  onClick={handleCsvExport}
                  title="CSV olarak indir"
                  className="text-xs border border-white/[0.15] text-zinc-400 hover:text-white hover:border-white/30 px-3 py-1.5 rounded-lg transition-colors shrink-0"
                >
                  ⬇ CSV
                </button>
                {!showSaveInput ? (
                  <button
                    onClick={() => setShowSaveInput(true)}
                    className="text-xs border border-white/[0.15] text-zinc-400 hover:text-white hover:border-white/30 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Bu aramayı kaydet
                  </button>
                ) : (
                  <>
                    <input
                      type="text"
                      placeholder="Arama adı (opsiyonel)"
                      value={saveNameInput}
                      onChange={e => setSaveNameInput(e.target.value)}
                      className="flex-1 bg-white/[0.07] border border-white/[0.12] text-white rounded-xl px-3 py-1.5 text-xs placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition"
                    />
                    <button
                      onClick={handleSaveSearch}
                      disabled={savingSearch}
                      className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors disabled:opacity-50 shrink-0"
                    >
                      {savingSearch ? '…' : 'Kaydet'}
                    </button>
                    <button
                      onClick={() => setShowSaveInput(false)}
                      className="text-zinc-600 hover:text-white text-xs px-2 py-1.5 transition-colors"
                    >
                      İptal
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Özet + filtre */}
            <div className="bg-white/[0.04] border border-white/[0.09] rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
              <p className="text-zinc-400 text-sm flex-1 min-w-0">
                {searchMode === 'single'
                  ? <><span className="text-white font-semibold">&ldquo;{businessQuery}&rdquo;</span>{' '}analiz sonucu</>
                  : <><span className="text-white font-semibold">{leads.length} işletme</span>{' '}— reklam ihtiyacına göre sıralandı</>
                }
              </p>
              <div className="flex flex-wrap gap-1.5 shrink-0">
                {([
                  { key: 'all',  label: 'Tümü', count: leads.length, cls: 'text-zinc-300 border-white/15 bg-white/[0.06]', inactCls: 'text-zinc-600 border-white/[0.06]' },
                  { key: 'high', label: 'Yüksek', count: countByLevel(70, 101), cls: 'text-red-400 border-red-500/30 bg-red-500/10', inactCls: 'text-zinc-600 border-white/[0.06]' },
                  { key: 'mid',  label: 'Orta',   count: countByLevel(40, 70),  cls: 'text-amber-400 border-amber-500/30 bg-amber-500/10', inactCls: 'text-zinc-600 border-white/[0.06]' },
                  { key: 'low',  label: 'Düşük',  count: countByLevel(0, 40),   cls: 'text-zinc-400 border-white/15 bg-white/[0.05]', inactCls: 'text-zinc-600 border-white/[0.06]' },
                ] as const).map(f => (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={`text-[11px] px-2.5 py-1 rounded-full border font-semibold transition-colors ${
                      filter === f.key ? f.cls : f.inactCls + ' hover:text-zinc-400'
                    }`}
                  >
                    {f.label}{f.key !== 'all' && ` (${f.count})`}
                  </button>
                ))}

                {/* CRM filtre (giriş yapmışsa) */}
                {isLoggedIn && (
                  <select
                    value={isCrmFilter ? filter : ''}
                    onChange={e => setFilter((e.target.value as CRMStatus) || 'all')}
                    className="text-[11px] px-2 py-1 rounded-full border border-white/[0.12] bg-[#1c1c22] text-zinc-400 focus:outline-none cursor-pointer"
                  >
                    <option value="">CRM Filtre…</option>
                    {CRM_FILTER_KEYS.map(k => (
                      <option key={k} value={k}>{CRM_STATUS_LABELS[k]}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* Skor kılavuzu */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="bg-red-500/[0.06] border border-red-500/20 rounded-xl px-3 py-2">
                <p className="text-[10px] font-bold text-red-400">70+ Yüksek</p>
                <p className="text-[10px] text-zinc-500 mt-0.5 leading-tight">Bütçesi var, dijital açığı büyük — önce bunları ara</p>
              </div>
              <div className="bg-amber-500/[0.06] border border-amber-500/20 rounded-xl px-3 py-2">
                <p className="text-[10px] font-bold text-amber-400">40–70 Orta</p>
                <p className="text-[10px] text-zinc-500 mt-0.5 leading-tight">Dengeli fırsat — sektör profiline göre değerlendir</p>
              </div>
              <div className="bg-white/[0.03] border border-white/[0.09] rounded-xl px-3 py-2">
                <p className="text-[10px] font-bold text-zinc-400">40↓ Düşük</p>
                <p className="text-[10px] text-zinc-500 mt-0.5 leading-tight">Bütçe sınırlı veya altyapısı zaten iyi</p>
              </div>
            </div>

            {filteredLeads.length === 0 && (
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-5 py-6 text-center mb-4">
                <p className="text-zinc-500 text-sm">Bu kategoride işletme yok.</p>
              </div>
            )}

            <div className="space-y-4">
              {filteredLeads.map(lead => {
                const pid = lead.placeId ?? `${lead.name}-${lead.address}`
                const crm = crmMap[pid] ?? { status: 'new' as CRMStatus, note: '' }
                return (
                  <LeadCard
                    key={pid}
                    lead={lead}
                    rank={leads.indexOf(lead) + 1}
                    crmStatus={crm.status}
                    crmNote={crm.note}
                    crmFollowUp={crm.follow_up_date}
                    onStatusChange={status => handleStatusChange(lead, status)}
                    onNoteChange={note => handleNoteChange(lead, note)}
                    onFollowUpChange={date => handleFollowUpChange(lead, date)}
                    onMonitor={() => handleMonitor(lead)}
                    isMonitored={!!lead.placeId && monitoredIds.has(lead.placeId)}
                  />
                )
              })}
            </div>

            <p className="text-xs text-zinc-700 text-center mt-6 pb-8">
              Veriler Google Places API&apos;den anlık çekilmiştir ve saklanmamaktadır.
            </p>
          </div>
        )}

      </div>
    </div>
  )
}

export default function AnalizPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#111115]" />}>
      <AnalizContent />
    </Suspense>
  )
}
