'use client'

import { useState, useEffect } from 'react'
import { Navbar } from '../components/navbar'
import { createClient } from '../../lib/supabase/client'

interface TeamMember {
  id: string
  member_email: string
  role: string
  invited_at: string
  accepted_at: string | null
}

export default function EkipPage() {
  const [members, setMembers]   = useState<TeamMember[]>([])
  const [email, setEmail]       = useState('')
  const [loading, setLoading]   = useState(true)
  const [inviting, setInviting] = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [success, setSuccess]   = useState<string | null>(null)

  const supabase = createClient()

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('team_members')
      .select('*')
      .order('invited_at', { ascending: false })
    setMembers((data as TeamMember[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setInviting(true)
    setError(null)
    setSuccess(null)

    const { error: err } = await supabase.from('team_members').insert({
      member_email: email.trim().toLowerCase(),
    })

    if (err) {
      setError(err.message)
    } else {
      setSuccess(`${email} adresine davet gönderildi.`)
      setEmail('')
      await load()
    }
    setInviting(false)
  }

  async function handleRemove(id: string) {
    await supabase.from('team_members').delete().eq('id', id)
    setMembers(m => m.filter(x => x.id !== id))
  }

  return (
    <div className="min-h-screen bg-[#111115] text-white">
      <Navbar />
      <div className="max-w-lg mx-auto px-4 pt-14 pb-12">

        <div className="text-center mb-8 pt-10">
          <h1 className="text-3xl font-black text-white tracking-tight">Ekip</h1>
          <p className="text-zinc-500 text-sm mt-2">
            Ekip üyelerini davet edin, CRM verilerini paylaşın.
          </p>
        </div>

        {/* Davet formu */}
        <div className="bg-[#1c1c22] border border-white/[0.12] rounded-2xl p-5 mb-6">
          <h2 className="text-sm font-bold text-white mb-4">Üye Davet Et</h2>
          <form onSubmit={handleInvite} className="flex gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="ornek@mail.com"
              className="flex-1 bg-white/[0.07] border border-white/[0.12] text-white rounded-xl px-3 py-2.5 text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition"
            />
            <button
              type="submit"
              disabled={inviting}
              className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 rounded-xl transition-colors disabled:opacity-50 shrink-0"
            >
              {inviting ? '…' : 'Davet Et'}
            </button>
          </form>

          {error && (
            <p className="mt-2 text-xs text-red-400">{error}</p>
          )}
          {success && (
            <p className="mt-2 text-xs text-emerald-400">{success}</p>
          )}
        </div>

        {/* Üye listesi */}
        <div className="bg-[#1c1c22] border border-white/[0.12] rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-white/[0.08]">
            <h2 className="text-sm font-bold text-white">Ekip Üyeleri</h2>
          </div>

          {loading ? (
            <div className="px-5 py-8 text-center text-zinc-600 text-sm">Yükleniyor…</div>
          ) : members.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <div className="text-3xl mb-3">👥</div>
              <p className="text-zinc-400 text-sm font-semibold mb-1">Henüz kimse yok</p>
              <p className="text-zinc-600 text-xs max-w-[220px] mx-auto leading-relaxed">
                Yukarıdan e-posta adresiyle ekip üyesi davet edin.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {members.map(m => (
                <div key={m.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-zinc-200 truncate">{m.member_email}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-zinc-600 capitalize">{m.role}</span>
                      <span className="text-white/10">·</span>
                      {m.accepted_at ? (
                        <span className="text-[10px] text-emerald-500">Kabul edildi</span>
                      ) : (
                        <span className="text-[10px] text-amber-500">Davet bekleniyor</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemove(m.id)}
                    className="text-xs text-zinc-600 hover:text-red-400 transition-colors shrink-0"
                  >
                    Çıkar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-xs text-zinc-700 text-center mt-6">
          Davet edilen üyeler CRM leadlerini görüntüleyebilir.
        </p>
      </div>
    </div>
  )
}
