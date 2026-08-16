'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '../../lib/supabase/client'
import { Navbar } from '../components/navbar'

function translateError(msg: string): string {
  if (msg.includes('Invalid login credentials'))  return 'E-posta veya şifre hatalı.'
  if (msg.includes('Email not confirmed'))         return 'Lütfen önce e-postanızı doğrulayın.'
  if (msg.includes('User already registered'))     return 'Bu e-posta adresi zaten kayıtlı.'
  if (msg.includes('Password should be at least')) return 'Şifre en az 6 karakter olmalıdır.'
  if (msg.includes('rate limit') || msg.includes('too many requests'))
    return 'Çok fazla deneme yapıldı. Lütfen bir süre bekleyin.'
  if (msg.includes('network') || msg.includes('fetch'))
    return 'Bağlantı hatası. İnternet bağlantınızı kontrol edin.'
  return 'Bir hata oluştu. Lütfen tekrar deneyin.'
}

function GirisContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? '/analiz'

  const [mode, setMode]         = useState<'login' | 'signup'>('login')
  const [forgot, setForgot]     = useState(false)
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [success, setSuccess]   = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        const onboarded = localStorage.getItem('lb_onboarded')
        router.replace(onboarded ? next : '/onboarding')
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) { setError(translateError(error.message)); setLoading(false) }
      else {
        const onboarded = localStorage.getItem('lb_onboarded')
        router.replace(onboarded ? next : '/onboarding')
      }
    } else {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) { setError(translateError(error.message)); setLoading(false) }
      else setSuccess('Hesabınız oluşturuldu. E-postanıza gelen doğrulama linkine tıklayın.')
    }
    setLoading(false)
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/giris`,
    })
    setLoading(false)
    if (error) {
      setError(translateError(error.message))
    } else {
      setSuccess('Şifre sıfırlama linki e-postanıza gönderildi. Spam klasörünü de kontrol edin.')
    }
  }

  function switchMode(m: 'login' | 'signup') {
    setMode(m)
    setForgot(false)
    setError(null)
    setSuccess(null)
  }

  return (
    <div className="max-w-sm mx-auto px-4 pt-24 pb-12">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-black text-white">
          {forgot ? 'Şifre Sıfırla' : mode === 'login' ? 'Giriş Yap' : 'Hesap Oluştur'}
        </h1>
        <p className="text-zinc-500 text-sm mt-2">
          {forgot
            ? 'E-posta adresinize sıfırlama linki göndereceğiz'
            : mode === 'login'
            ? 'Lead geçmişinize ve CRM\'e erişin'
            : 'Ücretsiz hesap oluşturun'}
        </p>
      </div>

      <div className="bg-[#1c1c22] border border-white/[0.12] rounded-2xl p-6 shadow-2xl shadow-black/40">

        {/* Mode toggle — gizle şifre sıfırlamada */}
        {!forgot && (
          <div className="flex rounded-xl bg-white/[0.08] p-1 mb-6">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                mode === 'login' ? 'bg-white/10 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Giriş Yap
            </button>
            <button
              type="button"
              onClick={() => switchMode('signup')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                mode === 'signup' ? 'bg-white/10 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Kayıt Ol
            </button>
          </div>
        )}

        {/* Şifre sıfırlama formu */}
        {forgot ? (
          <form onSubmit={handleForgot} className="space-y-4">
            <div>
              <label className="block text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5">
                E-posta
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="siz@ornek.com"
                className="w-full bg-white/[0.07] border border-white/[0.12] text-white rounded-xl px-3 py-2.5 text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition"
              />
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                {error}
              </p>
            )}
            {success && (
              <p className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2">
                {success}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl py-3 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading && (
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              {loading ? 'Gönderiliyor…' : 'Sıfırlama Linki Gönder'}
            </button>

            <button
              type="button"
              onClick={() => { setForgot(false); setError(null); setSuccess(null) }}
              className="w-full text-xs text-zinc-600 hover:text-zinc-400 transition-colors py-1"
            >
              ← Giriş ekranına dön
            </button>
          </form>
        ) : (
          /* Normal giriş/kayıt formu */
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5">
                E-posta
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="siz@ornek.com"
                className="w-full bg-white/[0.07] border border-white/[0.12] text-white rounded-xl px-3 py-2.5 text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition"
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5">
                Şifre
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="En az 6 karakter"
                className="w-full bg-white/[0.07] border border-white/[0.12] text-white rounded-xl px-3 py-2.5 text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition"
              />
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                {error}
              </p>
            )}
            {success && (
              <p className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2">
                {success}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl py-3 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading && (
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              {loading ? 'Lütfen bekleyin…' : mode === 'login' ? 'Giriş Yap' : 'Hesap Oluştur'}
            </button>

            {/* Şifremi unuttum — sadece login modunda */}
            {mode === 'login' && (
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => { setForgot(true); setError(null); setSuccess(null) }}
                  className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
                >
                  Şifremi unuttum
                </button>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  )
}

export default function GirisPage() {
  return (
    <div className="min-h-screen bg-[#111115] text-white">
      <Navbar />
      <Suspense fallback={
        <div className="max-w-sm mx-auto px-4 pt-24 pb-12 text-center">
          <p className="text-zinc-600 text-sm">Yükleniyor…</p>
        </div>
      }>
        <GirisContent />
      </Suspense>
    </div>
  )
}
