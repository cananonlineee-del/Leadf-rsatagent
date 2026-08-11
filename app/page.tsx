'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Navbar } from './components/navbar'

// ─── Scroll reveal ────────────────────────────────────────────────────────────

function useScrollReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('[data-reveal]')
    const obs = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          if (!e.isIntersecting) return
          const delay = Number((e.target as HTMLElement).dataset.delay ?? 0)
          setTimeout(() => e.target.classList.add('rv'), delay)
          obs.unobserve(e.target)
        })
      },
      { threshold: 0.08 }
    )
    els.forEach(el => obs.observe(el))
    return () => obs.disconnect()
  }, [])
}

// ─── Animated counter ─────────────────────────────────────────────────────────

function Counter({ to, suffix = '' }: { to: number; suffix?: string }) {
  const [val, setVal] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      obs.disconnect()
      const dur = 1400, t0 = Date.now()
      const tick = () => {
        const p = Math.min((Date.now() - t0) / dur, 1)
        setVal(Math.round((1 - Math.pow(1 - p, 3)) * to))
        if (p < 1) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, { threshold: 0.5 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [to])
  return <span ref={ref}>{val}{suffix}</span>
}

// ─── Signal categories ────────────────────────────────────────────────────────

const CATS = [
  {
    id: 'gb', label: 'Google Business', count: 8,
    tc: 'text-amber-400', bc: 'bg-amber-500/[0.08]', br: 'border-amber-500/25', dot: 'bg-amber-400',
    signals: [
      'Google puanı', 'Yorum sayısı', 'İşletme durumu', 'Fotoğraf sayısı',
      'Çalışma saatleri', 'Son yorum tarihi', 'Olumsuz yorum oranı', 'İşletme açıklaması',
    ],
  },
  {
    id: 'web', label: 'Web Sitesi', count: 17,
    tc: 'text-blue-400', bc: 'bg-blue-500/[0.08]', br: 'border-blue-500/25', dot: 'bg-blue-400',
    signals: [
      'SSL sertifikası', 'Mobil hız skoru', 'Sayfa başlığı', 'Meta açıklama',
      'Sayfada telefon', 'WhatsApp butonu', 'Tıklanabilir telefon', 'Sosyal linkler',
      'İletişim formu', 'Formda telefon alanı', 'Rezervasyon sistemi',
      'Schema markup', 'Online ödeme', 'Canlı chat', 'Bülten formu',
      'Kurumsal e-posta', 'Domain yaşı',
    ],
  },
  {
    id: 'ads', label: 'Reklam Altyapısı', count: 7,
    tc: 'text-violet-400', bc: 'bg-violet-500/[0.08]', br: 'border-violet-500/25', dot: 'bg-violet-400',
    signals: [
      'Meta Pixel kodu', 'Google Ads kodu', 'Google Tag Manager',
      'Meta reklam aktifliği', 'Aktif reklam sayısı',
      'Geçmiş reklam durumu', 'Toplam reklam sayısı',
    ],
  },
  {
    id: 'ig', label: 'Instagram', count: 10,
    tc: 'text-pink-400', bc: 'bg-pink-500/[0.08]', br: 'border-pink-500/25', dot: 'bg-pink-400',
    signals: [
      'Takipçi sayısı', 'Son paylaşım tarihi', 'Hesap gizliliği', 'Aktivite durumu',
      'Haftalık paylaşım sıklığı', 'Reels kullanımı', 'Etkileşim oranı',
      "Bio'da telefon", "Bio'da link", 'Bio uzunluğu',
    ],
  },
  {
    id: 'fb', label: 'Facebook & TikTok', count: 9,
    tc: 'text-orange-400', bc: 'bg-orange-500/[0.08]', br: 'border-orange-500/25', dot: 'bg-orange-400',
    signals: [
      'FB takipçi sayısı', 'FB beğeni sayısı', 'FB son paylaşım tarihi', 'FB aktivite durumu',
      'TikTok takipçi sayısı', 'TikTok beğeni sayısı',
      'TikTok video sayısı', 'TikTok son paylaşım tarihi', 'TikTok aktivite durumu',
    ],
  },
  {
    id: 'plat', label: 'Platform Varlığı', count: 7,
    tc: 'text-emerald-400', bc: 'bg-emerald-500/[0.08]', br: 'border-emerald-500/25', dot: 'bg-emerald-400',
    signals: [
      'Google Yerel 3-Paketi', 'Yemeksepeti', 'Getir / TY Yemek',
      'Tripadvisor', 'Online randevu platformu', 'YouTube kanalı', 'Marketplace varlığı',
    ],
  },
]

const TOTAL_SIGNALS = CATS.reduce((s, c) => s + c.count, 0) // 58

// ─── Landing Page ─────────────────────────────────────────────────────────────

export default function LandingPage() {
  useScrollReveal()

  return (
    <>
      <style>{`
        /* Background blobs */
        @keyframes blob {
          0%,100%{ transform:translate(0,0)   scale(1);    }
          33%    { transform:translate(40px,-30px) scale(1.06); }
          66%    { transform:translate(-25px,18px) scale(0.94); }
        }
        @keyframes blob2 {
          0%,100%{ transform:translate(0,0)     scale(1);  }
          50%    { transform:translate(-50px,35px) scale(1.1); }
        }
        .blob-a{ animation:blob  10s ease-in-out infinite; }
        .blob-b{ animation:blob2 14s ease-in-out infinite; }
        .blob-c{ animation:blob  18s ease-in-out infinite reverse; }

        /* Hero elements */
        @keyframes fadeDown{from{opacity:0;transform:translateY(-14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes fadeUp  {from{opacity:0;transform:translateY(22px) }to{opacity:1;transform:translateY(0)}}
        .h-badge {animation:fadeDown .6s ease .1s  both}
        .h-num   {animation:fadeUp   .7s ease .2s  both}
        .h-head  {animation:fadeUp   .7s ease .35s both}
        .h-sub   {animation:fadeUp   .7s ease .48s both}
        .h-cta   {animation:fadeUp   .7s ease .60s both}
        .h-strip {animation:fadeUp   .7s ease .72s both}

        /* Scroll reveal */
        [data-reveal]{opacity:0;transform:translateY(28px);transition:opacity .65s ease,transform .65s ease}
        [data-reveal].rv{opacity:1;transform:translateY(0)}

        /* CTA glow */
        @keyframes glow{0%,100%{box-shadow:0 0 22px rgba(37,99,235,.35)}50%{box-shadow:0 0 42px rgba(37,99,235,.7)}}
        .glow-cta{animation:glow 2.4s ease-in-out infinite}

        /* Live dot */
        @keyframes liveDot{0%,100%{opacity:1}50%{opacity:.25}}
        .live{animation:liveDot 1.6s ease-in-out infinite}

        /* Scan rings in hero */
        @keyframes ring{0%{transform:translate(-50%,-50%) scale(.5);opacity:.7}100%{transform:translate(-50%,-50%) scale(2);opacity:0}}
        .ring{position:absolute;top:50%;left:50%;border-radius:9999px;border:1px solid rgba(59,130,246,.25);animation:ring 3.5s ease-out infinite}
        .ring:nth-child(1){width:320px;height:320px;animation-delay:0s}
        .ring:nth-child(2){width:320px;height:320px;animation-delay:1.1s}
        .ring:nth-child(3){width:320px;height:320px;animation-delay:2.2s}

        /* Pipeline arrow pulse */
        @keyframes arrowPulse{0%,100%{opacity:.3}50%{opacity:1}}
        .arr{animation:arrowPulse 2s ease-in-out infinite}

        /* Signal pill hover */
        .sig-pill{transition:border-color .15s,background .15s}
        .sig-pill:hover{background:rgba(255,255,255,.06)!important;border-color:rgba(255,255,255,.2)!important}
      `}</style>

      <div className="min-h-screen bg-[#111115] text-white overflow-x-hidden">

        {/* ── Background ───────────────────────────────────────────────── */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden>
          <div className="blob-a absolute -top-56 -left-40 w-[700px] h-[700px] rounded-full bg-blue-600/[0.09] blur-[130px]" />
          <div className="blob-b absolute top-1/3 -right-48 w-[560px] h-[560px] rounded-full bg-indigo-500/[0.07] blur-[110px]" />
          <div className="blob-c absolute -bottom-40 left-1/4  w-[480px] h-[480px] rounded-full bg-blue-400/[0.06] blur-[100px]" />
          <div className="absolute inset-0 opacity-[0.022]" style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.15) 1px,transparent 1px),' +
              'linear-gradient(90deg,rgba(255,255,255,.15) 1px,transparent 1px)',
            backgroundSize: '64px 64px',
          }} />
        </div>

        <Navbar showCta />

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* HERO                                                           */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <section className="relative min-h-[94vh] flex flex-col items-center justify-center text-center px-4 pt-14 overflow-hidden">

          {/* Scan rings (decorative) */}
          <div className="absolute inset-0 pointer-events-none" aria-hidden>
            <div className="ring" />
            <div className="ring" />
            <div className="ring" />
          </div>

          {/* Badge */}
          <div className="h-badge mb-8">
            <span className="inline-flex items-center gap-2 text-[11px] text-zinc-400 border border-white/[0.10] bg-white/[0.03] rounded-full px-4 py-1.5 tracking-wide">
              <span className="live w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />
              Türkiye&apos;nin lead analiz aracı
            </span>
          </div>

          {/* Giant signal number */}
          <div className="h-num mb-4 relative">
            <p className="text-[100px] sm:text-[140px] font-black leading-none tracking-tighter"
              style={{ background: 'linear-gradient(135deg,#60a5fa,#818cf8,#a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              <Counter to={TOTAL_SIGNALS} />
            </p>
            <p className="text-zinc-500 text-sm uppercase tracking-[0.25em] mt-1">sinyal · tek analizde</p>
          </div>

          {/* Headline */}
          <h1 className="h-head text-3xl sm:text-5xl font-black text-white tracking-tight leading-tight max-w-2xl mx-auto mb-5">
            Bir işletmenin dijital zayıflıklarını<br />
            <span className="text-blue-400">rakibinizden önce</span> görün.
          </h1>

          {/* Sub */}
          <p className="h-sub text-zinc-400 text-base sm:text-lg max-w-lg mx-auto leading-relaxed mb-8">
            6 farklı kaynaktan paralel veri çekiliyor — Google, web sitesi,
            Instagram, Facebook, TikTok, Meta Ads. Hepsi birleşerek size satmaya
            en uygun işletmeleri öne çıkarıyor.
          </p>

          {/* CTAs */}
          <div className="h-cta flex flex-col sm:flex-row items-center gap-3 mb-12">
            <Link href="/analiz" className="glow-cta bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl px-9 py-3.5 text-base transition-colors">
              Ücretsiz Analiz Başlat →
            </Link>
            <Link href="#sinyaller" className="text-zinc-500 text-sm hover:text-zinc-300 transition-colors px-4 py-3">
              58 sinyalin tamamını gör ↓
            </Link>
          </div>

          {/* Source strip */}
          <div className="h-strip flex flex-wrap justify-center gap-x-5 gap-y-2 text-[11px] text-zinc-600">
            {CATS.map(c => (
              <span key={c.id} className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                {c.label}
                <span className={`${c.tc} font-semibold`}>{c.count}</span>
              </span>
            ))}
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* PIPELINE — Arka planda neler oluyor?                          */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <section className="border-t border-white/[0.06] py-28 px-4">
          <div className="max-w-5xl mx-auto">

            <div data-reveal className="text-center mb-16">
              <p className="text-[11px] text-zinc-600 uppercase tracking-widest mb-3">Mimari</p>
              <h2 className="text-4xl font-black text-white mb-3">Perde arkasında neler oluyor?</h2>
              <p className="text-zinc-500 max-w-sm mx-auto text-sm leading-relaxed">
                Siz &quot;Analiz Et&quot;e basarken sistem aynı anda 6 farklı kaynağa paralel istek atıyor.
              </p>
            </div>

            {/* Pipeline diagram */}
            <div className="flex flex-col lg:flex-row items-stretch gap-6">

              {/* Left: Sources */}
              <div data-reveal data-delay="0" className="flex flex-col gap-2.5 lg:w-64 shrink-0">
                <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-1 text-center lg:text-left">Veri Kaynakları</p>
                {CATS.map(c => (
                  <div key={c.id} className={`flex items-center justify-between gap-3 bg-[#1c1c22] border ${c.br} rounded-xl px-4 py-2.5`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.dot}`} />
                      <span className="text-xs text-zinc-300 truncate">{c.label}</span>
                    </div>
                    <span className={`text-[11px] font-bold shrink-0 ${c.tc}`}>{c.count} sinyal</span>
                  </div>
                ))}
              </div>

              {/* Center: Arrow + Engine */}
              <div className="flex lg:flex-col items-center justify-center gap-3 lg:gap-4 px-2">
                {/* Arrow */}
                <div className="arr hidden lg:flex flex-col items-center gap-1 text-blue-500/50">
                  <div className="w-px h-8 bg-blue-500/30" />
                  <span className="text-lg">▼</span>
                </div>
                <div className="arr flex lg:hidden items-center gap-1 text-blue-500/50">
                  <span className="text-lg">▶</span>
                  <div className="h-px w-8 bg-blue-500/30" />
                </div>

                {/* Engine box */}
                <div data-reveal data-delay="150" className="flex-1 lg:flex-none bg-blue-600/[0.08] border border-blue-500/30 rounded-2xl p-6 text-center min-w-[200px]">
                  <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center mx-auto mb-3">
                    <span className="text-blue-400 text-lg">⚙</span>
                  </div>
                  <p className="text-blue-300 font-bold text-base mb-1">Skor Motoru</p>
                  <p className="text-zinc-500 text-xs leading-relaxed">
                    Her sinyal ağırlıklandırılır,<br />
                    sektör profiliyle çapraz<br />
                    doğrulanır, sıralanır
                  </p>
                </div>

                {/* Arrow 2 */}
                <div className="arr hidden lg:flex flex-col items-center gap-1 text-blue-500/50">
                  <div className="w-px h-8 bg-blue-500/30" />
                  <span className="text-lg">▼</span>
                </div>
                <div className="arr flex lg:hidden items-center gap-1 text-blue-500/50">
                  <div className="h-px w-8 bg-blue-500/30" />
                  <span className="text-lg">▶</span>
                </div>
              </div>

              {/* Right: Outputs */}
              <div data-reveal data-delay="250" className="flex flex-col gap-2.5 lg:w-64 shrink-0 justify-center">
                <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-1 text-center lg:text-left">Çıktılar</p>

                <div className="bg-[#1c1c22] border border-emerald-500/20 rounded-xl px-4 py-3">
                  <p className="text-xs font-semibold text-emerald-400 mb-1">Reklam İhtiyacı Skoru</p>
                  <p className="text-[11px] text-zinc-500">İşletmeler satış potansiyeline göre sıralanır</p>
                </div>
                <div className="bg-[#1c1c22] border border-blue-500/20 rounded-xl px-4 py-3">
                  <p className="text-xs font-semibold text-blue-400 mb-1">Dijital Açık Raporu</p>
                  <p className="text-[11px] text-zinc-500">Her eksik madde öncelik sırasıyla listelenir</p>
                </div>
                <div className="bg-[#1c1c22] border border-violet-500/20 rounded-xl px-4 py-3">
                  <p className="text-xs font-semibold text-violet-400 mb-1">Kişisel WhatsApp Mesajı</p>
                  <p className="text-[11px] text-zinc-500">Gerçek veriye dayalı, jenerik değil</p>
                </div>
                <div className="bg-[#1c1c22] border border-orange-500/20 rounded-xl px-4 py-3">
                  <p className="text-xs font-semibold text-orange-400 mb-1">Satış Pitch&apos;i</p>
                  <p className="text-[11px] text-zinc-500">İşletmenin açığına odaklı hazır argüman</p>
                </div>
              </div>
            </div>

            {/* Timing strip */}
            <div data-reveal data-delay="300" className="mt-10 flex flex-wrap justify-center gap-6 text-xs text-zinc-600">
              {[
                { label: 'Paralel API çağrısı', val: '6' },
                { label: 'Toplam sinyal', val: '46' },
                { label: 'Ortalama süre', val: '~20 sn' },
                { label: 'Kayıt gerekmez', val: '✓' },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <p className="text-white font-black text-2xl">{s.val}</p>
                  <p className="text-zinc-600 text-[11px] mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* SIGNAL BREAKDOWN — Şok anı                                    */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <section id="sinyaller" className="bg-[#0e0e12] border-t border-white/[0.05] py-28 px-4">
          <div className="max-w-5xl mx-auto">

            <div data-reveal className="text-center mb-16">
              <p className="text-[11px] text-zinc-600 uppercase tracking-widest mb-3">46 Sinyal</p>
              <h2 className="text-4xl font-black text-white mb-3">
                Rakipleriniz bunları<br />manuel kontrol eder.
              </h2>
              <p className="text-zinc-500 text-sm max-w-md mx-auto leading-relaxed">
                Bir ajans bu analizin tamamını yapmak için günler harcar ve fatura keser.
                Bu sistem saniyeler içinde ücretsiz yapar.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {CATS.map((cat, i) => (
                <div
                  key={cat.id}
                  data-reveal
                  data-delay={(i * 70).toString()}
                  className={`bg-[#1c1c22] border ${cat.br} rounded-2xl p-5`}
                >
                  {/* Category header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${cat.dot}`} />
                      <span className={`text-xs font-bold ${cat.tc}`}>{cat.label}</span>
                    </div>
                    <span className={`text-[10px] font-black ${cat.tc} ${cat.bc} border ${cat.br} rounded-full px-2 py-0.5`}>
                      {cat.count}
                    </span>
                  </div>

                  {/* Signal pills */}
                  <div className="flex flex-wrap gap-1.5">
                    {cat.signals.map(s => (
                      <span
                        key={s}
                        className={`sig-pill text-[11px] px-2.5 py-1 rounded-lg border ${cat.bc} ${cat.br} text-zinc-400 cursor-default`}
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div data-reveal data-delay="500" className="mt-12 text-center">
              <p className="text-zinc-600 text-sm">
                Bu 58 sinyal bir işletme için{' '}
                <span className="text-white font-semibold">~20 saniyede</span> tamamlanır
                {' '}—{' '}
                <span className="text-white font-semibold">hiçbir kurulum olmadan.</span>
              </p>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* HOW TO USE                                                     */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <section id="nasil-calisir" className="border-t border-white/[0.06] py-28 px-4">
          <div className="max-w-4xl mx-auto">

            <div data-reveal className="text-center mb-20">
              <p className="text-[11px] text-zinc-600 uppercase tracking-widest mb-3">Kullanım</p>
              <h2 className="text-4xl font-black text-white mb-3">3 adımda lead bul</h2>
              <p className="text-zinc-500 text-sm">Kayıt yok. Kurulum yok. Saniyeler içinde başla.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-10 sm:gap-6 relative">
              {/* Desktop connector */}
              <div className="hidden sm:block absolute h-px top-7"
                style={{
                  left: 'calc(33% + 28px)', right: 'calc(33% + 28px)',
                  background: 'linear-gradient(90deg, rgba(59,130,246,.5), rgba(59,130,246,.15), rgba(59,130,246,.5))',
                }} />

              {[
                {
                  n: '01', title: 'Sektör & İlçe Seç',
                  desc: '50\'den fazla sektör, 81 il, 957 ilçe. Hangi pazarı kazanmak istediğini seç.',
                  tag: 'Kadıköy · Kuaför',
                },
                {
                  n: '02', title: 'Sisteme Bırak',
                  desc: '58 sinyal paralel çekilir. Reklam açığı en yüksek işletmeler otomatik öne geçer.',
                  tag: '~20 saniye',
                },
                {
                  n: '03', title: 'WhatsApp\'tan Yaz',
                  desc: 'Her işletme için üretilen kişisel mesajı kopyala, tek tıkla gönder. Ajans adın imzaya eklenir.',
                  tag: 'tek tık',
                },
              ].map((s, i) => (
                <div key={s.n} data-reveal data-delay={(i * 100).toString()} className="text-center sm:text-left">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600/10 border border-blue-500/20 mb-5">
                    <span className="text-blue-400 font-black text-xl">{s.n}</span>
                  </div>
                  <h3 className="text-white font-bold text-lg mb-2">{s.title}</h3>
                  <p className="text-zinc-500 text-sm leading-relaxed mb-3">{s.desc}</p>
                  <span className="text-[11px] text-blue-400/60 bg-blue-500/[0.06] border border-blue-500/[0.12] rounded-full px-3 py-1">
                    {s.tag}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* FINAL CTA                                                      */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <section className="py-28 px-4 border-t border-white/[0.06]">
          <div data-reveal className="max-w-xl mx-auto text-center">
            <span className="inline-flex items-center gap-2 text-[11px] text-zinc-500 border border-white/[0.08] rounded-full px-4 py-1.5 mb-8">
              <span className="live w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />
              Ücretsiz · Kayıt gerektirmez
            </span>
            <h2 className="text-5xl sm:text-6xl font-black text-white mb-4 leading-tight tracking-tight">
              İlk leadini<br />şimdi bul.
            </h2>
            <p className="text-zinc-500 mb-8 text-base max-w-sm mx-auto">
              Sektörünüzdeki reklam açığı en yüksek işletmeleri saniyeler içinde keşfet.
            </p>
            <Link
              href="/analiz"
              className="glow-cta inline-block bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl px-10 py-4 text-base transition-colors"
            >
              Ücretsiz Analiz Başlat →
            </Link>
            <p className="text-zinc-700 text-xs mt-6">
              <Counter to={46} /> sinyal · 6 kaynak · ~20 saniye
            </p>
          </div>
        </section>

        {/* Footer */}
        <footer className="text-zinc-700 text-xs text-center py-10 border-t border-white/[0.05]">
          © 2026 Leadbulucu
        </footer>
      </div>
    </>
  )
}
