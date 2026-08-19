'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Navbar } from '../components/navbar'
import { createClient } from '../../lib/supabase/client'

// ─── Tipler ───────────────────────────────────────────────────────────────────

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

// ─── Yardımcılar ──────────────────────────────────────────────────────────────

const SOURCE_LABEL: Record<string, { label: string; cls: string }> = {
  kariyer: { label: 'Kariyer.net', cls: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
  jooble:  { label: 'Jooble TR',   cls: 'bg-violet-500/15 text-violet-400 border-violet-500/20' },
}

function daysAgo(dateStr: string | null): string {
  if (!dateStr) return ''
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000)
  if (diff === 0) return 'Bugün'
  if (diff === 1) return 'Dün'
  return `${diff} gün önce`
}

// ─── Kart ─────────────────────────────────────────────────────────────────────

function WarmLeadCard({
  lead,
  onSeen,
}: {
  lead: WarmLead
  onSeen: (id: string) => void
}) {
  const router = useRouter()
  const src    = SOURCE_LABEL[lead.source] ?? SOURCE_LABEL.kariyer

  function handleAnalyze() {
    const params = new URLSearchParams({
      businessName: lead.company_name,
      city:         lead.city ?? '',
    })
    router.push(`/analiz?${params.toString()}`)
  }

  return (
    <div
      className={`bg-[#1c1c22] border rounded-2xl p-5 transition-opacity ${
        lead.is_seen ? 'border-white/[0.06] opacity-50' : 'border-white/[0.12]'
      }`}
    >
      {/* Üst satır */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${src.cls}`}>
              {src.label}
            </span>
            {lead.posted_at && (
              <span className="text-[10px] text-zinc-600">{daysAgo(lead.posted_at)}</span>
            )}
            {lead.city && (
              <span className="text-[10px] text-zinc-600">· {lead.city}</span>
            )}
          </div>
          <h3 className="text-sm font-bold text-white truncate">{lead.company_name}</h3>
          <p className="text-xs text-zinc-500 mt-0.5">{lead.job_title}</p>
        </div>
        <a
          href={lead.job_url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-[10px] text-zinc-600 hover:text-zinc-300 transition-colors border border-white/[0.08] rounded-lg px-2.5 py-1.5"
        >
          İlan ↗
        </a>
      </div>

      {/* Snippet */}
      {lead.snippet && (
        <p className="text-[11px] text-zinc-600 leading-relaxed mb-4 line-clamp-2">
          {lead.snippet}
        </p>
      )}

      {/* Aksiyonlar */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleAnalyze}
          className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl py-2 transition-colors"
        >
          Analiz Et →
        </button>
        {!lead.is_seen && (
          <button
            onClick={() => onSeen(lead.id)}
            className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors border border-white/[0.08] rounded-xl px-3 py-2"
          >
            Gördüm
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Sayfa ────────────────────────────────────────────────────────────────────

export default function SicakLeadlerPage() {
  const [leads,    setLeads]    = useState<WarmLead[]>([])
  const [loading,  setLoading]  = useState(true)
  const [filter,   setFilter]   = useState<'all' | 'kariyer' | 'jooble'>('all')
  const [hideSeen, setHideSeen] = useState(true)

  const supabase = createClient()

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('warm_leads')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200)
      setLeads((data as WarmLead[]) ?? [])
      setLoading(false)
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function markSeen(id: string) {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, is_seen: true } : l))
    await supabase.from('warm_leads').update({ is_seen: true }).eq('id', id)
  }

  const visible = leads.filter(l => {
    if (filter !== 'all' && l.source !== filter) return false
    if (hideSeen && l.is_seen) return false
    return true
  })

  const unseenCount = leads.filter(l => !l.is_seen).length

  return (
    <div className="min-h-screen bg-[#111115] text-white">
      <Navbar />
      <div className="max-w-2xl mx-auto px-4 pt-8 pb-16">

        {/* Başlık */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-black text-white">Sıcak Leadler</h1>
            {unseenCount > 0 && (
              <span className="text-[10px] font-bold bg-blue-600 text-white px-2 py-0.5 rounded-full">
                {unseenCount} yeni
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500">
            Dijital pazarlama uzmanı arayan şirketler — kariyer.net ve Jooble TR'den günlük güncellenir
          </p>
        </div>

        {/* Filtreler */}
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          {(['all', 'kariyer', 'jooble'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors ${
                filter === f
                  ? 'bg-white/10 text-white'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {f === 'all' ? 'Tümü' : SOURCE_LABEL[f].label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => setHideSeen(p => !p)}
              className={`text-[10px] font-semibold px-3 py-1.5 rounded-xl border transition-colors ${
                hideSeen
                  ? 'border-white/[0.08] text-zinc-500'
                  : 'border-blue-500/30 text-blue-400'
              }`}
            >
              {hideSeen ? 'Görülenleri Gizle' : 'Görülenleri Göster'}
            </button>
          </div>
        </div>

        {/* Liste */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-[#1c1c22] border border-white/[0.06] rounded-2xl h-32 animate-pulse" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-zinc-600 text-sm">
              {leads.length === 0
                ? 'Henüz ilan verisi yok — ilk cron çalıştığında burada görünür.'
                : 'Tüm ilanlar görüldü olarak işaretlendi.'}
            </p>
            {leads.length === 0 && (
              <p className="text-zinc-700 text-xs mt-2">
                Cron her gün 07:00&apos;de otomatik çalışır.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map(lead => (
              <WarmLeadCard
                key={lead.id}
                lead={lead}
                onSeen={markSeen}
              />
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
