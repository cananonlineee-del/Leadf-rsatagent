'use client'

import { useState, useEffect } from 'react'
import { Navbar } from '../components/navbar'
import { createClient } from '../../lib/supabase/client'
import { listNotifications, markAllRead, markRead, type Notification } from '../../lib/notifications'

function notifIcon(message: string): { emoji: string; bg: string } {
  const m = message.toLowerCase()
  if (m.includes('skor') || m.includes('puan') || m.includes('düştü'))
    return { emoji: '📉', bg: 'bg-red-500/10' }
  if (m.includes('instagram') || m.includes('inaktif') || m.includes('aktif değil'))
    return { emoji: '📱', bg: 'bg-pink-500/10' }
  if (m.includes('facebook'))
    return { emoji: '👥', bg: 'bg-blue-500/10' }
  if (m.includes('web') || m.includes('site'))
    return { emoji: '🌐', bg: 'bg-zinc-500/10' }
  return { emoji: '🔔', bg: 'bg-amber-500/10' }
}

interface MonitoredLead {
  id: string
  place_id: string
  sector: string
  city: string
  lead_data: { name: string; score: number }
  last_score: number | null
  last_checked: string | null
  notify_score_drop: boolean
  notify_ig_inactive: boolean
  created_at: string
}

export default function TakipPage() {
  const [monitored, setMonitored]       = useState<MonitoredLead[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [tab, setTab]                   = useState<'takip' | 'bildirimler'>('bildirimler')
  const [loading, setLoading]           = useState(true)

  const supabase = createClient()

  async function load() {
    setLoading(true)
    const [monResult, notifList] = await Promise.all([
      supabase
        .from('monitored_leads')
        .select('*')
        .order('created_at', { ascending: false }),
      listNotifications(),
    ])
    setMonitored((monResult.data as MonitoredLead[]) ?? [])
    setNotifications(notifList)
    setLoading(false)
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleToggle(id: string, field: 'notify_score_drop' | 'notify_ig_inactive', value: boolean) {
    await supabase.from('monitored_leads').update({ [field]: value }).eq('id', id)
    setMonitored(m => m.map(x => x.id === id ? { ...x, [field]: value } : x))
  }

  async function handleRemoveMonitor(id: string) {
    await supabase.from('monitored_leads').delete().eq('id', id)
    setMonitored(m => m.filter(x => x.id !== id))
  }

  async function handleMarkAllRead() {
    await markAllRead()
    setNotifications(n => n.map(x => ({ ...x, is_read: true })))
  }

  async function handleMarkRead(id: string) {
    await markRead(id)
    setNotifications(n => n.map(x => x.id === id ? { ...x, is_read: true } : x))
  }

  const unreadCount = notifications.filter(n => !n.is_read).length

  return (
    <div className="min-h-screen bg-[#111115] text-white">
      <Navbar />
      <div className="max-w-2xl mx-auto px-4 pt-14 pb-12">

        <div className="text-center mb-8 pt-10">
          <h1 className="text-3xl font-black text-white tracking-tight">Takip & Bildirimler</h1>
          <p className="text-zinc-500 text-sm mt-2">
            Takibe aldığınız leadlerdeki değişiklikleri izleyin.
          </p>
        </div>

        {/* Tab */}
        <div className="flex rounded-xl bg-white/[0.08] p-1 mb-6">
          <button
            onClick={() => setTab('bildirimler')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              tab === 'bildirimler' ? 'bg-white/10 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Bildirimler {unreadCount > 0 && <span className="ml-1 bg-red-500 text-white text-[9px] rounded-full px-1.5">{unreadCount}</span>}
          </button>
          <button
            onClick={() => setTab('takip')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              tab === 'takip' ? 'bg-white/10 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Takip Listesi ({monitored.length})
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-zinc-600 text-sm">Yükleniyor…</div>
        ) : tab === 'bildirimler' ? (
          /* BİLDİRİMLER */
          <div>
            {notifications.length > 0 && unreadCount > 0 && (
              <div className="flex justify-end mb-3">
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs text-zinc-500 hover:text-white transition-colors"
                >
                  Tümünü okundu say
                </button>
              </div>
            )}
            {notifications.length === 0 ? (
              <div className="text-center py-16 border border-white/[0.07] rounded-2xl bg-white/[0.02]">
                <div className="text-4xl mb-4">🔔</div>
                <p className="text-zinc-300 text-sm font-semibold mb-1">Henüz bildirim yok</p>
                <p className="text-zinc-600 text-xs mb-5 max-w-xs mx-auto leading-relaxed">
                  Takibe aldığınız leadlerde skor düşüşü veya sosyal medya inaktifliği olduğunda burada görünür.
                </p>
                <a
                  href="/analiz"
                  className="inline-block bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-5 py-2.5 rounded-xl transition-colors"
                >
                  Analiz Sayfasına Git →
                </a>
              </div>
            ) : (
              <div className="space-y-2">
                {notifications.map(n => (
                  <div
                    key={n.id}
                    onClick={() => !n.is_read && handleMarkRead(n.id)}
                    className={`bg-[#1c1c22] border rounded-xl px-4 py-3 cursor-pointer transition-colors hover:bg-white/[0.04] ${
                      n.is_read ? 'border-white/[0.07] opacity-60' : 'border-amber-500/30'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-sm ${notifIcon(n.message).bg}`}>
                        {notifIcon(n.message).emoji}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-bold text-white truncate">{n.business_name}</p>
                          {!n.is_read && (
                            <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0 mt-1" />
                          )}
                        </div>
                        <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">{n.message}</p>
                      </div>
                    </div>
                    <p className="text-[10px] text-zinc-600 mt-1.5">
                      {new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(n.created_at))}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* TAKİP LİSTESİ */
          <div>
            {monitored.length === 0 ? (
              <div className="text-center py-16 border border-white/[0.07] rounded-2xl bg-white/[0.02]">
                <div className="text-4xl mb-4">👁</div>
                <p className="text-zinc-300 text-sm font-semibold mb-1">Takip listesi boş</p>
                <p className="text-zinc-600 text-xs mb-5 max-w-xs mx-auto leading-relaxed">
                  Analiz sayfasında bir lead kartındaki göz ikonuna basarak takibe alın. Skor değişimleri otomatik izlenir.
                </p>
                <a
                  href="/analiz"
                  className="inline-block bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-5 py-2.5 rounded-xl transition-colors"
                >
                  Lead Bul →
                </a>
              </div>
            ) : (
              <div className="space-y-3">
                {monitored.map(m => (
                  <div key={m.id} className="bg-[#1c1c22] border border-white/[0.12] rounded-2xl p-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate">{m.lead_data?.name ?? 'İşletme'}</p>
                        <p className="text-xs text-zinc-600">{m.sector} · {m.city}</p>
                      </div>
                      <div className="text-right shrink-0">
                        {m.last_score !== null && (
                          <p className="text-lg font-black text-zinc-300">{m.last_score}<span className="text-xs text-zinc-600">/100</span></p>
                        )}
                        {m.last_checked && (
                          <p className="text-[10px] text-zinc-600">
                            {new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' }).format(new Date(m.last_checked))}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Uyarı toggle'ları */}
                    <div className="flex flex-col gap-2 border-t border-white/[0.07] pt-3">
                      {[
                        { field: 'notify_score_drop' as const, label: 'Skor düşüşünde bildir' },
                        { field: 'notify_ig_inactive' as const, label: 'Instagram inaktif olursa bildir' },
                      ].map(({ field, label }) => (
                        <label key={field} className="flex items-center justify-between gap-3 cursor-pointer">
                          <span className="text-xs text-zinc-400">{label}</span>
                          <button
                            type="button"
                            onClick={() => handleToggle(m.id, field, !m[field])}
                            className={`w-8 h-4 rounded-full transition-colors relative ${m[field] ? 'bg-blue-600' : 'bg-zinc-700'}`}
                          >
                            <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${m[field] ? 'left-4' : 'left-0.5'}`} />
                          </button>
                        </label>
                      ))}
                    </div>

                    <button
                      onClick={() => handleRemoveMonitor(m.id)}
                      className="mt-3 text-[11px] text-zinc-600 hover:text-red-400 transition-colors"
                    >
                      Takipten çıkar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
