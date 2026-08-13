'use client'

import { useState, useEffect, useRef } from 'react'
import type { Lead, InstagramData, MetaAdData, FacebookData, TikTokData } from '../api/analyze/route'
import { IL_ILCE, ILLER } from '../../lib/turkiye-il-ilce'
import { Navbar } from '../components/navbar'

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

// ─── WhatsApp Mesaj Üreteci ───────────────────────────────────────────────────

function toWaPhone(phone: string): string | null {
  const d = phone.replace(/\D/g, '')
  if (d.startsWith('90') && d.length === 12) return d
  if (d.startsWith('0')  && d.length === 11) return '90' + d.slice(1)
  if (d.length === 10)                        return '90' + d
  return null
}

function ablative(word: string): string {
  const back = /[aıou]/
  const vowels = word.toLowerCase().match(/[aeıiouöü]/g)
  const lastVowel = vowels ? vowels[vowels.length - 1] : 'a'
  return back.test(lastVowel) ? "'dan" : "'den"
}

function primaryGapHook(lead: Lead): string {
  if (lead.websiteSource === 'none')
    return 'çevrimiçi bir varlığınızın olmadığını gördüm'
  if (lead.instagram?.activity === 'neglected' && lead.instagram.lastPostDate) {
    const days = Math.floor((Date.now() - new Date(lead.instagram.lastPostDate).getTime()) / 86_400_000)
    return `Instagram hesabınızın ${days} gündür güncellenmediğini fark ettim`
  }
  if (lead.reviewCount < 10)
    return `Google'da yalnızca ${lead.reviewCount} yorumunuz olduğunu gördüm`
  if (lead.siteAnalysis && !lead.siteAnalysis.ssl)
    return 'web sitenizde güvenlik sertifikası (HTTPS) olmadığını fark ettim'
  if (lead.siteAnalysis?.mobileScore != null && lead.siteAnalysis.mobileScore < 50)
    return `web sitenizin mobil hız skorunun ${lead.siteAnalysis.mobileScore}/100 olduğunu gördüm`
  if (!lead.siteAnalysis?.hasPixel && !lead.siteAnalysis?.hasGoogleAds)
    return lead.siteAnalysis?.hasAnalytics
      ? 'sitenizde Analytics var ama Meta Pixel veya Google Ads dönüşüm kodu olmadığını fark ettim'
      : 'dijital reklam altyapınızın henüz kurulmadığını fark ettim'
  if (lead.instagram?.activity === 'dormant')
    return 'Instagram hesabınızın bir süredir güncellenemediğini gördüm'
  if (!lead.siteAnalysis?.hasWhatsApp && lead.siteAnalysis)
    return 'sitenizde WhatsApp iletişim butonu olmadığını gördüm — mobil ziyaretçiler sizi kaçırıyor'
  if (lead.instagram?.engagementRate != null && lead.instagram.engagementRate < 1)
    return `Instagram'da %${lead.instagram.engagementRate.toFixed(1)} etkileşim oranınız olduğunu gördüm — takipçileriniz içerikle bağ kuramıyor`
  if (lead.facebook?.activity === 'neglected' && lead.facebook.lastPostDate) {
    const days = Math.floor((Date.now() - new Date(lead.facebook.lastPostDate).getTime()) / 86_400_000)
    return `Facebook sayfanızın ${days} gündür güncellenmediğini fark ettim`
  }
  if (lead.tiktok?.activity === 'neglected' && lead.tiktok.lastPostDate) {
    const days = Math.floor((Date.now() - new Date(lead.tiktok.lastPostDate).getTime()) / 86_400_000)
    return `TikTok hesabınızın ${days} gündür hareketsiz olduğunu gördüm`
  }
  if (!lead.facebook && !lead.tiktok && (lead.instagram?.followersCount ?? 0) > 500)
    return 'Facebook ve TikTok kanallarınızın eksik olduğunu fark ettim — mevcut kitlenizi bu platformlara taşıyabilirsiniz'
  if (lead.negativeReviewRate !== null && lead.negativeReviewRate > 60)
    return `son görünen yorumlarınızın %${lead.negativeReviewRate}'inin olumsuz olduğunu gördüm`
  if (lead.lastReviewDate) {
    const days = Math.floor((Date.now() - new Date(lead.lastReviewDate).getTime()) / 86_400_000)
    if (days > 180)
      return `son ${days} gündür yeni yorum almadığınızı fark ettim`
  }
  if (lead.instagram?.bioLength != null && lead.instagram.bioLength < 20 && (lead.instagram.followersCount ?? 0) > 300)
    return "Instagram bio'nuzun çok kısa olduğunu gördüm — takipçiler işletmenizi tanıyamıyor"
  if (lead.siteAnalysis && !lead.siteAnalysis.hasOnlinePayment && lead.categoryProfile.website >= 3)
    return 'sitenizde online ödeme sistemi olmadığını fark ettim — ziyaretçiler anlık satın alma yapamıyor'
  if (lead.siteAnalysis && !lead.siteAnalysis.hasLiveChat && lead.reviewCount > 50)
    return 'sitenizde canlı destek olmadığını gördüm — sorular yanıtsız kalıyor'
  if (lead.platforms && !lead.platforms.inLocalPack)
    return "Google harita sonuçlarının 3'lüsünde görünmediğinizi fark ettim — değerli yerel arama trafiği kaçıyor"
  if (lead.platforms && lead.platforms.yemeksepeti === false && lead.platforms.getir === false)
    return 'Yemeksepeti veya Getir\'de listelenmediğinizi fark ettim — online sipariş kanalı eksik'
  if (lead.googleBusinessScore < 50)
    return `Google Business profilinizin %${lead.googleBusinessScore} tamamlanmış olduğunu gördüm — bu sizi arama sonuçlarında geri bırakıyor`
  return 'dijital varlığınızda güçlendirebileceğimiz önemli noktalar dikkatimi çekti'
}

function detailedGapLines(lead: Lead): string[] {
  const lines: string[] = []

  if (lead.websiteSource === 'none') {
    lines.push('Web sitesi tespit edilemedi — Google aramasında rakiplerinizin gerisinde kalıyorsunuz.')
  } else {
    if (lead.websiteSource === 'discovered')
      lines.push('Google profilinizde web siteniz kayıtlı değil; potansiyel müşteriler sizi bulmakta zorlanıyor.')
    if (lead.siteAnalysis && !lead.siteAnalysis.ssl)
      lines.push('Web siteniz HTTP üzerinde çalışıyor — ziyaretçiler "Güvensiz" uyarısıyla karşılaşıyor.')
    if (lead.siteAnalysis?.mobileScore != null && lead.siteAnalysis.mobileScore < 70)
      lines.push(`Mobil hız skorunuz ${lead.siteAnalysis.mobileScore}/100 — mobil ziyaretçilerin büyük kısmı sayfayı terk edebilir.`)
    if (lead.siteAnalysis?.emailAddress && lead.siteAnalysis.hasCorpEmail === false)
      lines.push(`İletişim e-posta adresiniz (${lead.siteAnalysis.emailAddress}) ücretsiz bir servis — kurumsal görünüm zayıflıyor.`)
  }

  if (lead.reviewCount < 10)
    lines.push(`Google'da ${lead.reviewCount} yorumunuz var — bu sektörde müşteri kararları büyük ölçüde yorumlara göre şekilleniyor.`)
  else if (lead.rating != null && lead.rating < 4.0)
    lines.push(`Google puanınız ${lead.rating.toFixed(1)}/5 — bu seviyenin üzerine çıkmak daha fazla müşteri getirir.`)

  if (lead.instagram?.activity === 'neglected' && lead.instagram.lastPostDate) {
    const days = Math.floor((Date.now() - new Date(lead.instagram.lastPostDate).getTime()) / 86_400_000)
    lines.push(`Instagram hesabınız ${days} gündür güncellenmemiş — bu sektörde sosyal medya aktifliği kritik.`)
  } else if (lead.instagram?.activity === 'dormant') {
    lines.push('Instagram hesabınız son 1-3 aydır güncellenmemiş.')
  } else if (!lead.instagramHandle) {
    lines.push('Instagram hesabı tespit edilemedi — rakipleriniz bu kanaldan aktif müşteri kazanıyor olabilir.')
  }

  if (lead.instagram?.weeklyPostFreq != null && lead.instagram.weeklyPostFreq < 1 && lead.instagram.activity === 'active')
    lines.push(`Haftada ortalama ${lead.instagram.weeklyPostFreq} paylaşım yapıyorsunuz — içerik sıklığı artırılabilir.`)

  if (!lead.siteAnalysis?.hasPixel && !lead.siteAnalysis?.hasGoogleAds && lead.websiteSource !== 'none')
    lines.push(lead.siteAnalysis?.hasAnalytics
      ? 'Sitenizde Analytics var ama Meta Pixel veya Google Ads dönüşüm kodu yok — reklam kanallarını ölçemiyorsunuz.'
      : 'Sitenizde reklam takip kodu yok — hangi kanaldan müşteri geldiğini ölçemiyorsunuz.')

  if (lead.topCompetitor && lead.topCompetitor.reviewCount > lead.reviewCount * 2)
    lines.push(`Bölgenizdeki ${lead.topCompetitor.name} ${lead.topCompetitor.reviewCount} yorumla öne çıkarken sizin ${lead.reviewCount} yorumunuz var — yorum yönetimiyle bu farkı kapatabilirsiniz.`)

  if (lead.siteAnalysis && !lead.siteAnalysis.hasWhatsApp)
    lines.push('Sitenizde WhatsApp butonu yok — mobil cihazdan gelen ziyaretçiler sizinle anında iletişim kuramıyor.')

  if (lead.instagram?.engagementRate != null && lead.instagram.engagementRate < 1 && lead.instagram.followersCount != null)
    lines.push(`Instagram'da ${formatCount(lead.instagram.followersCount)} takipçiniz var ancak %${lead.instagram.engagementRate.toFixed(1)} etkileşim oranı sektör ortalamasının altında.`)

  if (lead.lastReviewDate) {
    const days = Math.floor((Date.now() - new Date(lead.lastReviewDate).getTime()) / 86_400_000)
    if (days > 90 && lead.reviewCount > 10)
      lines.push(`Google'da son yorumunuz ${days} gün önce — düzenli yorum kampanyasıyla görünürlüğü artırabilirsiniz.`)
  }
  if (lead.negativeReviewRate !== null && lead.negativeReviewRate > 50)
    lines.push(`Son görünen yorumların %${lead.negativeReviewRate}'i olumsuz (1-2 yıldız) — aktif itibar yönetimiyle ortalama puan artırılabilir.`)
  if (lead.instagram?.bio && !lead.instagram.bioHasPhone && !lead.instagram.bioHasUrl)
    lines.push("Instagram bio'nuzda telefon veya web linki yok — profilden doğrudan müşteri kazanmak zorlaşıyor.")

  if (lead.facebook?.activity === 'neglected' && lead.facebook.lastPostDate) {
    const days = Math.floor((Date.now() - new Date(lead.facebook.lastPostDate).getTime()) / 86_400_000)
    lines.push(`Facebook sayfanız ${days} gündür güncellenmemiş — düzenli paylaşımla marka güveni inşa edilebilir.`)
  }
  if (!lead.facebook)
    lines.push('Facebook sayfası bulunamadı — bu kanaldan potansiyel müşterilere ulaşma fırsatı değerlendirilmiyor.')
  if (!lead.tiktok && (lead.categoryProfile.instagram ?? 0) >= 3)
    lines.push('TikTok hesabı tespit edilemedi — kısa video içeriğiyle hızla büyüyen bu kanalda rakiplerinizin gerisinde kalabilirsiniz.')

  if (lead.platforms && !lead.platforms.inLocalPack)
    lines.push("Google harita 3-paketinde görünmüyorsunuz — yerel aramalardaki en nitelikli trafik bu listeden geliyor.")
  if (lead.platforms && lead.platforms.yemeksepeti === false && lead.platforms.getir === false)
    lines.push('Yemeksepeti veya Getir\'de listelenmiyorsunuz — online sipariş pazarından müşteri kazanma fırsatı değerlendirilmiyor.')
  if (lead.googleBusinessScore < 60)
    lines.push(`Google Business profiliniz %${lead.googleBusinessScore} tamamlanmış — eksik bilgiler yerel arama sıralamanızı doğrudan etkiliyor.`)
  if (lead.siteAnalysis && !lead.siteAnalysis.hasOnlinePayment && lead.categoryProfile.website >= 3)
    lines.push('Sitenizde ödeme sistemi yok — ziyaretçilerin doğrudan satın alması veya ön ödeme yapması mümkün değil.')

  return lines.slice(0, 3)
}

function buildShortMessage(lead: Lead, senderName: string, agencyName: string, agencyWebsite: string): string {
  const hook = primaryGapHook(lead)
  const sigParts = [senderName, agencyWebsite].filter(Boolean)
  const sigLine = sigParts.length > 0 ? '\n\n' + sigParts.join('\n') : ''
  return (
    `Merhaba, ${lead.name}'ı inceledim — ${hook}. ` +
    `Bu konuda size özel hızlı bir çözümümüz var; kısa bir görüşme yapar mıyız?` +
    sigLine
  )
}

function buildDetailedMessage(lead: Lead, senderName: string, agencyName: string, agencyWebsite: string): string {
  const introLine = agencyName && senderName
    ? `Sizlere ${agencyName}${ablative(agencyName)} ulaşıyorum. Ben Dijital Pazarlama Uzmanı ${senderName}`
    : agencyName
      ? `Sizlere ${agencyName}${ablative(agencyName)} ulaşıyorum.`
      : senderName
        ? `Ben Dijital Pazarlama Uzmanı ${senderName}.`
        : ''

  const gapLines = detailedGapLines(lead)
  const gapBlock = gapLines.length > 0
    ? '\n\nBirkaç önemli nokta dikkatimi çekti:\n' + gapLines.join('\n')
    : ''

  const solution = '\n\nBu konularda somut ve ölçülebilir sonuç alabilecek çözümlerimiz var.'
  const closing  = '\n\n5-10 dakikalık kısa bir görüşme için uygun bir zaman var mı?'
  const sigParts = [senderName, agencyWebsite].filter(Boolean)
  const sigLine  = sigParts.length > 0 ? '\n\n' + sigParts.join('\n') : ''

  return (
    `Merhaba, ${lead.name} sayfanızı inceleyerek size ulaşmak istedim.` +
    (introLine ? `\n\n${introLine}` : '') +
    gapBlock +
    solution +
    closing +
    sigLine
  )
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

// ─── Mesaj Önizleme Modalı ────────────────────────────────────────────────────

function MessagePreviewModal({
  lead,
  senderName,
  agencyName,
  agencyWebsite,
  initialType,
  onClose,
}: {
  lead: Lead
  senderName: string
  agencyName: string
  agencyWebsite: string
  initialType: 'short' | 'long'
  onClose: () => void
}) {
  const [type, setType]         = useState(initialType)
  const [copied, setCopied]     = useState(false)

  const shortMsg = buildShortMessage(lead, senderName, agencyName, agencyWebsite)
  const longMsg  = buildDetailedMessage(lead, senderName, agencyName, agencyWebsite)

  const [editedMsg, setEditedMsg] = useState(type === 'short' ? shortMsg : longMsg)

  useEffect(() => {
    setEditedMsg(type === 'short' ? shortMsg : longMsg)
    setCopied(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type])

  const waPhone = lead.phone ? toWaPhone(lead.phone) : null

  async function doCopy() {
    await navigator.clipboard.writeText(editedMsg)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-[#1c1c22] border border-white/[0.12] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
          <div>
            <h3 className="text-white font-bold text-sm">{lead.name}</h3>
            <p className="text-zinc-600 text-xs mt-0.5">WhatsApp mesajını düzenle ve gönder</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-white hover:bg-white/[0.08] transition-colors text-sm"
          >
            ✕
          </button>
        </div>

        {/* Type toggle */}
        <div className="px-5 pt-4">
          <div className="flex rounded-xl bg-white/[0.06] p-1">
            <button
              type="button"
              onClick={() => setType('short')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                type === 'short' ? 'bg-white/10 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Kısa Mesaj
            </button>
            <button
              type="button"
              onClick={() => setType('long')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                type === 'long' ? 'bg-white/10 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Detaylı Mesaj
            </button>
          </div>
        </div>

        {/* Editable textarea */}
        <div className="px-5 pt-3 pb-1">
          <textarea
            value={editedMsg}
            onChange={e => setEditedMsg(e.target.value)}
            rows={type === 'short' ? 5 : 9}
            className="w-full bg-white/[0.04] border border-white/[0.10] rounded-xl px-3 py-3 text-sm text-zinc-200 leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition"
          />
          <p className="text-[11px] text-zinc-700 mt-1">Mesajı göndermeden önce düzenleyebilirsin</p>
        </div>

        {/* Actions */}
        <div className="flex gap-2.5 px-5 py-4">
          <button
            onClick={doCopy}
            className={`flex-1 text-xs font-semibold py-2.5 rounded-xl border transition-colors ${
              copied
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                : 'border-white/[0.12] text-zinc-400 hover:text-white hover:bg-white/[0.06]'
            }`}
          >
            {copied ? '✓ Kopyalandı' : 'Kopyala'}
          </button>
          {waPhone ? (
            <a
              href={`https://wa.me/${waPhone}?text=${encodeURIComponent(editedMsg)}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className="flex-1 text-center text-xs font-bold py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
            >
              WhatsApp&rsquo;ta Aç ↗
            </a>
          ) : (
            <span
              title="Telefon numarası bulunamadı"
              className="flex-1 text-center text-xs font-semibold py-2.5 rounded-xl border border-white/[0.08] text-zinc-700 cursor-not-allowed"
            >
              Telefon Yok
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── LeadCard ─────────────────────────────────────────────────────────────────

function LeadCard({ lead, rank, senderName, agencyName, agencyWebsite, onPreview }: {
  lead: Lead
  rank: number
  senderName: string
  agencyName: string
  agencyWebsite: string
  onPreview: (type: 'short' | 'long') => void
}) {
  const [expanded, setExpanded]     = useState(false)
  const [showAllGaps, setShowAllGaps] = useState(false)

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
    lead.websiteSource !== 'none' &&
    !lead.siteAnalysis?.hasPixel &&
    !lead.siteAnalysis?.hasGoogleAds  // hasAnalytics tek başına yeterli değil — gerçek reklam kodu yok

  const services = [
    { label: 'Web Sitesi',      urgent: siteUrgent,   weight: lead.categoryProfile.website },
    { label: 'Google SEO',      urgent: seoUrgent,    weight: lead.categoryProfile.seo },
    { label: 'Sosyal Medya',    urgent: socialUrgent, weight: lead.categoryProfile.instagram },
    { label: 'Reklam Yönetimi', urgent: adsUrgent,    weight: lead.categoryProfile.ads },
  ].sort((a, b) => {
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1
    return b.weight - a.weight
  })

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
          <div className={`shrink-0 rounded-xl px-3 py-2 text-center ${need.badgeCls}`}>
            <div className="text-[9px] font-bold uppercase tracking-wider opacity-60">Reklam İhtiyacı</div>
            <div className="text-sm font-black leading-tight mt-0.5">{need.label}</div>
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
          {lead.phone && (
            <>
              <span className="text-white/10">·</span>
              <a href={`tel:${lead.phone}`} className="text-xs text-zinc-500 hover:text-blue-400 transition-colors">
                {lead.phone}
              </a>
            </>
          )}
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

        {/* WhatsApp mesaj butonları → önizleme modalini açar */}
        <div className="flex gap-2 pt-3 border-t border-white/[0.09]">
          <button
            type="button"
            onClick={() => onPreview('short')}
            className="flex-1 text-center text-xs font-semibold px-3 py-2 rounded-lg border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-colors"
          >
            Kısa Mesaj
          </button>
          <button
            type="button"
            onClick={() => onPreview('long')}
            className="flex-1 text-center text-xs font-bold px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
          >
            Detaylı Mesaj
          </button>
        </div>
      </div>

      {/* ── AÇILIR DÜĞME ────────────────────────────────────────────────── */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full border-t border-white/[0.08] px-5 py-2.5 text-xs text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] flex items-center justify-center gap-1.5 transition-colors font-medium"
      >
        {expanded ? 'Detayları gizle ▲' : 'Detayları gör ▼'}
      </button>

      {/* ── KATMAN 3: Açılır detay (accordion) ─────────────────────────── */}
      {expanded && (
        <div className="border-t border-white/[0.08] bg-[#17171d] divide-y divide-white/[0.06]">

          {/* Web / Site */}
          {(() => {
            const s = lead.siteAnalysis
            const siteProblems: React.ReactNode[] = []
            if (!lead.website) {
              siteProblems.push(<Row key="no-site" label="Web Sitesi"><span className="text-xs text-red-400 font-medium">✕ Tespit edilemedi</span></Row>)
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
                siteProblems.push(<Row key="title" label="Sayfa Başlığı"><span className={`text-xs font-semibold ${s.pageTitle === null ? 'text-zinc-600' : 'text-red-400'}`}>{s.pageTitle === null ? 'Tespit edilemedi' : `${s.pageTitle.slice(0,40)}${s.pageTitle.length > 40 ? '…' : ''} (${s.pageTitle.length} kr)`}</span></Row>)
              if (!s.hasMetaDesc) siteProblems.push(<Row key="meta" label="Meta Açıklama"><span className="text-xs font-medium text-red-400">✕ Yok</span></Row>)
              if (!s.pageHasPhone) siteProblems.push(<Row key="tel" label="Tel (Sayfada)"><span className="text-xs font-medium text-red-400">✕ Yok</span></Row>)
              if (!s.hasWhatsApp) siteProblems.push(<Row key="wa" label="WhatsApp"><span className="text-xs font-medium text-red-400">✕ Butonu Yok</span></Row>)
              if (!s.hasClickablePhone) siteProblems.push(<Row key="cl" label="Tel Link"><span className="text-xs font-medium text-amber-400">✕ Statik</span></Row>)
              if (!s.hasBookingSystem) siteProblems.push(<Row key="bk" label="Rezervasyon"><span className="text-xs font-medium text-red-400">✕ Yok</span></Row>)
              if (!s.hasContactForm) siteProblems.push(<Row key="cf" label="İletişim Formu"><span className="text-xs font-medium text-red-400">✕ Yok</span></Row>)
              if (!s.hasLocalBusinessSchema) siteProblems.push(<Row key="sc" label="Schema"><span className="text-xs font-medium text-red-400">✕ Yok</span></Row>)
              if (!s.hasOnlinePayment && lead.categoryProfile.website >= 3)
                siteProblems.push(<Row key="pay" label="Online Ödeme"><span className="text-xs font-medium text-red-400">✕ Yok</span></Row>)
              if (!s.hasLiveChat) siteProblems.push(<Row key="lc" label="Canlı Chat"><span className="text-xs font-medium text-amber-400">✕ Yok</span></Row>)
              if (!s.hasNewsletter) siteProblems.push(<Row key="nl" label="Bülten Formu"><span className="text-xs font-medium text-amber-400">✕ Yok</span></Row>)
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
                {siteProblems.length > 0 ? (
                  <dl className="space-y-2">{siteProblems}</dl>
                ) : lead.siteAnalysis ? (
                  <p className="text-xs text-emerald-400 font-medium">✓ Tespit edilen sorun yok</p>
                ) : (
                  <p className="text-xs text-zinc-600">Site analizi yapılamadı</p>
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
          {(() => {
            const gProblems: React.ReactNode[] = []
            if (lead.googleBusinessScore < 75)
              gProblems.push(<Row key="score" label="Profil Dolgunluğu"><span className={`text-xs font-semibold ${lead.googleBusinessScore < 50 ? 'text-red-400' : 'text-amber-400'}`}>%{lead.googleBusinessScore}</span></Row>)
            if (lead.photoCount < 5)
              gProblems.push(<Row key="photo" label="Fotoğraflar"><span className={`text-xs font-semibold ${lead.photoCount === 0 ? 'text-red-400' : 'text-amber-400'}`}>{lead.photoCount === 0 ? 'Yok' : `${lead.photoCount} adet`}</span></Row>)
            if (!lead.hasOpeningHours)
              gProblems.push(<Row key="hrs" label="Çalışma Saatleri"><span className="text-xs font-medium text-red-400">✕ Girilmemiş</span></Row>)
            if (lead.lastReviewDate && Math.floor((Date.now() - new Date(lead.lastReviewDate).getTime()) / 86_400_000) > 90)
              gProblems.push(<Row key="rev" label="Son Yorum"><span className="text-xs font-semibold text-red-400">{formatDate(lead.lastReviewDate)}</span></Row>)
            {/* Eşik yükseltildi: Google max 5 yorum döndürür, küçük örneklemden yüksek hassasiyette oran çıkarılmaz */}
            if (lead.negativeReviewRate !== null && lead.negativeReviewRate > 40)
              gProblems.push(<Row key="neg" label="Olumsuz Yorum"><span className={`text-xs font-semibold ${lead.negativeReviewRate > 60 ? 'text-red-400' : 'text-amber-400'}`}>%{lead.negativeReviewRate} <span className="text-zinc-600 font-normal">(örn.)</span></span></Row>)
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
          {(() => {
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
                    <Row label="Instagram"><span className="text-xs text-red-400 font-medium">✕ Tespit edilemedi</span></Row>
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
                    <Row label="Facebook"><span className="text-xs text-red-400 font-medium">✕ Tespit edilemedi</span></Row>
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
                    <Row label="TikTok"><span className="text-xs text-zinc-600">Tespit edilemedi</span></Row>
                  )}
                  {ttProblems}
                  {lead.metaAds && (
                    <Row label="Meta Reklamlar">
                      {lead.metaAds.hasActiveAds ? (
                        <span className="text-xs font-semibold text-blue-400">✓ {lead.metaAds.activeAdCount} aktif reklam</span>
                      ) : lead.metaAds.hasHistoricalAds ? (
                        <span className="text-xs font-semibold text-orange-400">{lead.metaAds.totalAdCount} reklam — şu an pasif</span>
                      ) : (
                        <span className="text-xs text-zinc-600">Reklam bulunamadı</span>
                      )}
                    </Row>
                  )}
                </dl>
                {ig?.confidence === 'possible' && (
                  <p className="text-[11px] text-amber-400 bg-amber-500/10 rounded px-2 py-1.5 mt-2 leading-relaxed">{ig.confidenceReason}</p>
                )}
              </section>
            )
          })()}

          {/* Platformlar */}
          {lead.platforms && (() => {
            const plat = lead.platforms
            const platProblems: React.ReactNode[] = []
            if (plat.yemeksepeti === false) platProblems.push(<Row key="ys" label="Yemeksepeti"><span className="text-xs font-medium text-red-400">✕ Listelenmemiş</span></Row>)
            if (plat.getir === false) platProblems.push(<Row key="gt" label="Getir / TY Yemek"><span className="text-xs font-medium text-red-400">✕ Listelenmemiş</span></Row>)
            if (plat.tripadvisor === false) platProblems.push(<Row key="ta" label="Tripadvisor"><span className="text-xs font-medium text-red-400">✕ Yok</span></Row>)
            if (plat.marketplace === false) platProblems.push(<Row key="mp" label="Marketplace"><span className="text-xs font-medium text-red-400">✕ Yok</span></Row>)
            if (plat.bookingPlatform === false) platProblems.push(<Row key="bp" label="Online Randevu"><span className="text-xs font-medium text-red-400">✕ Listelenmemiş</span></Row>)
            if (!plat.inLocalPack) platProblems.push(<Row key="lp" label="Google 3-Paketi"><span className="text-xs font-medium text-red-400">✕ Görünmüyor</span></Row>)
            if (!plat.youtubeHandle && !lead.youtubeHandle) platProblems.push(<Row key="yt" label="YouTube"><span className="text-xs font-medium text-amber-400">✕ Tespit edilemedi</span></Row>)
            return (
              <section className="px-5 py-4">
                <h4 className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                  Platformlar
                  {platProblems.length > 0 && <span className="text-red-400">({platProblems.length} sorun)</span>}
                </h4>
                {platProblems.length > 0 ? (
                  <dl className="space-y-2">
                    {platProblems}
                    {(plat.youtubeHandle ?? lead.youtubeHandle) && (
                      <Row label="YouTube">
                        <a href={(plat.youtubeHandle ?? lead.youtubeHandle)!} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 font-semibold hover:underline truncate max-w-[200px] block">
                          {(plat.youtubeHandle ?? lead.youtubeHandle)!.replace(/https?:\/\/(www\.)?youtube\.com\//, 'yt/')}
                        </a>
                      </Row>
                    )}
                  </dl>
                ) : (
                  <p className="text-xs text-emerald-400 font-medium">✓ Tüm platformlar tespit edildi</p>
                )}
              </section>
            )
          })()}

          {/* Fırsat Analizi */}
          <section className="px-5 py-4">
            <h4 className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-3">Fırsat Analizi</h4>
            <div className="space-y-3 mb-4">
              <ScoreBar label="Ödeme Gücü"   value={lead.odemeGucu}   color="bg-blue-500" />
              <ScoreBar label="Açık Şiddeti" value={lead.acikSiddeti} color="bg-orange-500" />
            </div>
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
          </section>
        </div>
      )}
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
      {/* İlerleme nokta barı */}
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

// ─── Ortak input/select sınıfları ─────────────────────────────────────────────

const inputCls  = 'w-full bg-white/[0.07] border border-white/[0.12] text-white rounded-xl px-3 py-2.5 text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition'
const selectCls = 'w-full bg-white/[0.07] border border-white/[0.12] text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 appearance-none cursor-pointer transition'
const labelCls  = 'block text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5'

// ─── Analiz Sayfası ───────────────────────────────────────────────────────────

export default function AnalizPage() {
  const [searchMode, setSearchMode]         = useState<'bulk' | 'single'>('bulk')
  const [businessQuery, setBusinessQuery]   = useState('')
  const [sector, setSector]                 = useState('')
  const [selectedIl, setSelectedIl]         = useState('')
  const [selectedIlce, setSelectedIlce]     = useState('')
  const [cityDisplayValue, setCityDisplayValue] = useState('')

  // Sonuçlar
  const [leads, setLeads]       = useState<Lead[]>([])
  const [loading, setLoading]   = useState(false)
  const [loadingStep, setLoadingStep] = useState(0)
  const [error, setError]       = useState<string | null>(null)
  const [searched, setSearched] = useState(false)

  // Filtre
  const [filter, setFilter] = useState<'all' | 'high' | 'mid' | 'low'>('all')

  // Mesaj önizleme
  const [previewLead, setPreviewLead]   = useState<Lead | null>(null)
  const [previewType, setPreviewType]   = useState<'short' | 'long'>('short')

  // Mesaj ayarları
  const [senderName, setSenderName]         = useState('')
  const [agencyName, setAgencyName]         = useState('')
  const [agencyWebsite, setAgencyWebsite]   = useState('')
  const [senderOpen, setSenderOpen]         = useState(false)

  // ── localStorage: yükle ──
  useEffect(() => {
    try {
      const raw = localStorage.getItem('lb_sender')
      if (raw) {
        const saved = JSON.parse(raw) as { name?: string; agency?: string; website?: string }
        if (saved.name)    setSenderName(saved.name)
        if (saved.agency)  setAgencyName(saved.agency)
        if (saved.website) setAgencyWebsite(saved.website)
      } else {
        setSenderOpen(true) // İlk ziyarette aç
      }
    } catch { /* ignore */ }
  }, [])

  // ── localStorage: kaydet ──
  useEffect(() => {
    try {
      localStorage.setItem('lb_sender', JSON.stringify({
        name: senderName, agency: agencyName, website: agencyWebsite,
      }))
    } catch { /* ignore */ }
  }, [senderName, agencyName, agencyWebsite])

  // ── Aşamalı yükleniyor adımı ──
  useEffect(() => {
    if (!loading) { setLoadingStep(0); return }
    const id = setInterval(() => {
      setLoadingStep(s => Math.min(s + 1, LOADING_STEPS.length - 1))
    }, 9_000)
    return () => clearInterval(id)
  }, [loading])

  function handleCityChange(il: string, ilce: string) {
    setSelectedIl(il)
    setSelectedIlce(ilce)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    setError(null)
    setLeads([])
    setSearched(false)
    setFilter('all')

    try {
      const url = searchMode === 'single'
        ? `/api/analyze?businessName=${encodeURIComponent(businessQuery.trim())}&sector=${encodeURIComponent(sector.trim())}${selectedIl ? '&city=' + encodeURIComponent(selectedIl) : ''}`
        : `/api/analyze?sector=${encodeURIComponent(sector.trim())}&city=${encodeURIComponent(`${selectedIlce} ${selectedIl}`)}`
      const res  = await fetch(url)
      const data = await res.json()
      if (!res.ok) setError(data.error ?? 'Beklenmeyen bir hata oluştu.')
      else { setLeads(data.leads); setSearched(true) }
    } catch {
      setError('Sunucuya bağlanılamadı. Lütfen tekrar deneyin.')
    } finally {
      setLoading(false)
    }
  }

  const canSubmit = !loading && (
    searchMode === 'single'
      ? businessQuery.trim().length >= 2 && sector.trim().length > 0
      : sector.trim().length > 0 && selectedIl.length > 0 && selectedIlce.length > 0
  )

  // Filtrelenmiş sonuçlar
  const filteredLeads = filter === 'all' ? leads
    : filter === 'high' ? leads.filter(l => l.score >= 70)
    : filter === 'mid'  ? leads.filter(l => l.score >= 40 && l.score < 70)
    : leads.filter(l => l.score < 40)

  const countByLevel = (min: number, max: number) =>
    leads.filter(l => l.score >= min && l.score < max).length

  return (
    <div className="min-h-screen bg-[#111115] text-white">
      <Navbar />

      {/* Mesaj önizleme modalı */}
      {previewLead && (
        <MessagePreviewModal
          lead={previewLead}
          senderName={senderName}
          agencyName={agencyName}
          agencyWebsite={agencyWebsite}
          initialType={previewType}
          onClose={() => setPreviewLead(null)}
        />
      )}

      <div className="max-w-2xl mx-auto px-4 pt-14 pb-12">

        {/* Hero */}
        <div className="text-center mb-8 pt-10">
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
            Lead Fırsat Ajanı
          </h1>
          <p className="text-zinc-500 text-sm mt-2 max-w-sm mx-auto">
            Sektör ve ilçe gir — 58 sinyal ile derin fırsat raporu oluştur.
          </p>
        </div>

        {/* Form Kartı */}
        <form onSubmit={handleSubmit} className="bg-[#1c1c22] border border-white/[0.12] rounded-2xl p-5 shadow-2xl shadow-black/40 space-y-4">

          {/* Mod toggle */}
          <div className="flex rounded-xl bg-white/[0.08] p-1">
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
          </div>

          {/* ── Sektör + hızlı chip'ler ── */}
          <div>
            <label className={labelCls}>Sektör</label>
            {/* Popüler sektör chip'leri */}
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
            <select
              value={sector}
              onChange={e => setSector(e.target.value)}
              className={selectCls}
            >
              <option value="">Tümünü gör…</option>
              {SECTOR_GROUPS.map(group => (
                <optgroup key={group.label} label={group.label}>
                  {group.options.map(opt => (
                    <option key={opt.search} value={opt.search}>{opt.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* ── Bölge Tara: şehir autocomplete ── */}
          {searchMode === 'bulk' && (
            <div>
              <label className={labelCls}>İlçe / Şehir</label>
              <CityAutocomplete
                value={cityDisplayValue}
                onChange={(il, ilce) => {
                  handleCityChange(il, ilce)
                  setCityDisplayValue(il && ilce ? `${ilce}, ${il}` : '')
                }}
              />
              {selectedIl && selectedIlce && (
                <p className="text-[11px] text-zinc-600 mt-1.5">
                  Seçildi: <span className="text-zinc-400">{selectedIlce}, {selectedIl}</span>
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

          {/* ── Mesaj Ayarları (katlanabilir) ── */}
          <div className="border border-white/[0.08] rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setSenderOpen(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.04] transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[11px] text-zinc-500 uppercase tracking-widest font-bold shrink-0">Mesaj Ayarları</span>
                {(senderName || agencyName) && !senderOpen && (
                  <span className="text-xs text-zinc-600 truncate">
                    · {[senderName, agencyName].filter(Boolean).join(', ')}
                  </span>
                )}
              </div>
              <span className="text-zinc-600 text-[10px] ml-2 shrink-0">{senderOpen ? '▲' : '▼'}</span>
            </button>
            {senderOpen && (
              <div className="border-t border-white/[0.08] px-4 py-4 space-y-3">
                <p className="text-[11px] text-zinc-600">WhatsApp mesajlarına eklenecek bilgiler. Bir kez doldurman yeterli.</p>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className={labelCls}>Adınız</label>
                    <input
                      type="text"
                      placeholder="Canan Özdoğru"
                      value={senderName}
                      onChange={e => setSenderName(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <div className="flex-1">
                    <label className={labelCls}>Ajans Adı</label>
                    <input
                      type="text"
                      placeholder="Dijital Medya"
                      value={agencyName}
                      onChange={e => setAgencyName(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Ajans Web Sitesi</label>
                  <input
                    type="text"
                    placeholder="www.ajansiniz.com"
                    value={agencyWebsite}
                    onChange={e => setAgencyWebsite(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>
            )}
          </div>

          {/* ── Submit ── */}
          <button
            type="submit"
            disabled={!canSubmit}
            className={`w-full bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl py-3 text-sm transition-colors ${
              !canSubmit ? 'opacity-25 cursor-not-allowed' : ''
            }`}
          >
            {loading ? 'Analiz ediliyor…' : 'Analiz Et →'}
          </button>
        </form>

        {/* Yükleniyor */}
        {loading && <ProgressLoader step={loadingStep} />}

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

            {/* Özet + filtre */}
            <div className="bg-white/[0.04] border border-white/[0.09] rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
              <p className="text-zinc-400 text-sm flex-1 min-w-0">
                {searchMode === 'single'
                  ? <><span className="text-white font-semibold">&ldquo;{businessQuery}&rdquo;</span>{' '}analiz sonucu</>
                  : <><span className="text-white font-semibold">{leads.length} işletme</span>{' '}— reklam ihtiyacına göre sıralandı</>
                }
              </p>
              <div className="flex gap-1.5 shrink-0">
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
              </div>
            </div>

            {filteredLeads.length === 0 && (
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-5 py-6 text-center mb-4">
                <p className="text-zinc-500 text-sm">Bu kategoride işletme yok.</p>
              </div>
            )}

            <div className="space-y-4">
              {filteredLeads.map(lead => (
                <LeadCard
                  key={`${lead.name}-${lead.address}`}
                  lead={lead}
                  rank={leads.indexOf(lead) + 1}
                  senderName={senderName}
                  agencyName={agencyName}
                  agencyWebsite={agencyWebsite}
                  onPreview={type => { setPreviewLead(lead); setPreviewType(type) }}
                />
              ))}
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
