'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../lib/supabase/client'

type Step = 1 | 2 | 3

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>(1)

  // Adım 2 form alanları
  const [senderName,    setSenderName]    = useState('')
  const [agencyName,    setAgencyName]    = useState('')
  const [agencyWebsite, setAgencyWebsite] = useState('')

  useEffect(() => {
    // localStorage hızlı cache: zaten onboard edildiyse direk /analiz'e
    if (localStorage.getItem('lb_onboarded')) {
      router.replace('/analiz')
      return
    }
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.replace('/giris'); return }
      // Sunucu tarafı kontrol: başka cihazda onboard edilmişse
      if (data.user.user_metadata?.onboarded) {
        localStorage.setItem('lb_onboarded', 'true')
        router.replace('/analiz')
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleStep2(e: React.FormEvent) {
    e.preventDefault()
    if (!senderName.trim()) return
    localStorage.setItem('lb_sender', JSON.stringify({
      name:    senderName.trim(),
      agency:  agencyName.trim(),
      website: agencyWebsite.trim(),
    }))
    setStep(3)
  }

  async function handleFinish() {
    const supabase = createClient()
    // Sunucuya yaz — cihazdan bağımsız kalıcı
    await supabase.auth.updateUser({ data: { onboarded: true } })
    // localStorage cache
    localStorage.setItem('lb_onboarded', 'true')
    router.replace('/analiz')
  }

  const steps: Step[] = [1, 2, 3]

  return (
    <>
      <style>{`
        @keyframes stepIn {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .step-enter { animation: stepIn 0.28s ease both; }
      `}</style>

      <div className="min-h-screen bg-[#111115] flex items-center justify-center px-4">
        <div className="w-full max-w-md">

          {/* Progress dots */}
          <div className="flex justify-center gap-2 mb-8">
            {steps.map(s => (
              <div
                key={s}
                className={`h-2 rounded-full transition-all duration-300 ${
                  s === step
                    ? 'w-8 bg-blue-500'
                    : s < step
                    ? 'w-2 bg-blue-500/50'
                    : 'w-2 bg-white/10'
                }`}
              />
            ))}
          </div>

          {/* Card */}
          <div className="bg-[#1c1c22] border border-white/[0.12] rounded-2xl p-8 shadow-2xl shadow-black/40">

            {/* Step 1 — Hoş Geldiniz */}
            {step === 1 && (
              <div key="step-1" className="step-enter text-center">
                <div className="text-5xl mb-6">🎯</div>
                <h1 className="text-2xl font-black text-white mb-3">
                  Lead Ajanına Hoş Geldiniz
                </h1>
                <p className="text-zinc-400 text-sm mb-8">
                  Google Maps&rsquo;ten potansiyel müşterileri bulun, yapay zeka ile analiz edin, PDF rapor indirin.
                </p>
                <ul className="text-left space-y-3 mb-8">
                  <li className="flex items-start gap-3">
                    <span className="text-blue-400 font-bold mt-0.5 leading-5">·</span>
                    <span className="text-zinc-300 text-sm">Google Maps verisiyle hızlı lead tespiti</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-blue-400 font-bold mt-0.5 leading-5">·</span>
                    <span className="text-zinc-300 text-sm">Yapay zeka ile otomatik uyum skoru</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-blue-400 font-bold mt-0.5 leading-5">·</span>
                    <span className="text-zinc-300 text-sm">PDF rapor ile müşteride kalıcı iz bırakın</span>
                  </li>
                </ul>
                <button
                  onClick={() => setStep(2)}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl py-3 text-sm transition-colors"
                >
                  Başlayalım →
                </button>
              </div>
            )}

            {/* Step 2 — Seni Tanıyalım */}
            {step === 2 && (
              <div key="step-2" className="step-enter">
                <h2 className="text-2xl font-black text-white mb-2 text-center">Seni Tanıyalım</h2>
                <p className="text-zinc-500 text-sm mb-6 text-center">
                  PDF&rsquo;ler ve mesajlarında otomatik kullanılır
                </p>
                <form onSubmit={handleStep2} className="space-y-4">
                  <div>
                    <label className="block text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5">
                      Ad Soyad <span className="text-blue-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={senderName}
                      onChange={e => setSenderName(e.target.value)}
                      placeholder="Ahmet Yılmaz"
                      className="w-full bg-white/[0.07] border border-white/[0.12] text-white rounded-xl px-3 py-2.5 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5">
                      Ajans / Şirket <span className="text-zinc-600">(opsiyonel)</span>
                    </label>
                    <input
                      type="text"
                      value={agencyName}
                      onChange={e => setAgencyName(e.target.value)}
                      placeholder="Dijital Ajans"
                      className="w-full bg-white/[0.07] border border-white/[0.12] text-white rounded-xl px-3 py-2.5 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5">
                      Web Sitesi <span className="text-zinc-600">(opsiyonel)</span>
                    </label>
                    <input
                      type="text"
                      value={agencyWebsite}
                      onChange={e => setAgencyWebsite(e.target.value)}
                      placeholder="www.ajansim.com"
                      className="w-full bg-white/[0.07] border border-white/[0.12] text-white rounded-xl px-3 py-2.5 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl py-3 text-sm transition-colors mt-2"
                  >
                    Devam Et →
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="w-full text-xs text-zinc-600 hover:text-zinc-400 transition-colors py-1"
                  >
                    ← Geri
                  </button>
                </form>
              </div>
            )}

            {/* Step 3 — Hazırsın! */}
            {step === 3 && (
              <div key="step-3" className="step-enter text-center">
                <div className="text-5xl mb-6">🚀</div>
                <h2 className="text-2xl font-black text-white mb-3">
                  {senderName ? `${senderName}, her şey hazır!` : 'Her şey hazır!'}
                </h2>
                <p className="text-zinc-400 text-sm mb-8">
                  İşte nasıl kullanacağınız:
                </p>
                <ol className="text-left space-y-4 mb-8">
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
                      1
                    </span>
                    <span className="text-zinc-300 text-sm pt-0.5">
                      Analiz sayfasında sektör ve ilçe seçin — sistem işletmeleri otomatik bulur
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
                      2
                    </span>
                    <span className="text-zinc-300 text-sm pt-0.5">
                      Yapay zeka her işletmenin dijital açıklarını tespit eder ve uyum skoru verir
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
                      3
                    </span>
                    <span className="text-zinc-300 text-sm pt-0.5">
                      PDF raporu indirin, takibe alın ve CRM&rsquo;den ilerlemesini izleyin
                    </span>
                  </li>
                </ol>
                <button
                  onClick={handleFinish}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl py-3 text-sm transition-colors mb-3"
                >
                  İlk Aramayı Yap →
                </button>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="w-full text-xs text-zinc-600 hover:text-zinc-400 transition-colors py-1"
                >
                  ← Geri
                </button>
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  )
}
