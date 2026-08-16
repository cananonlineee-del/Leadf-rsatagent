'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '../../lib/supabase/client'
import { Navbar } from '../components/navbar'

function DavetContent() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const token        = searchParams.get('token')

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')

  const supabase = createClient()

  useEffect(() => {
    async function acceptInvite() {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.replace(`/giris?next=/davet${token ? '?token=' + token : ''}`)
        return
      }

      if (!token) {
        setStatus('error')
        setMessage('Geçersiz davet linki.')
        return
      }

      const { error } = await supabase
        .from('team_members')
        .update({ accepted_at: new Date().toISOString() })
        .eq('id', token)
        .eq('member_email', user.email)

      if (error) {
        setStatus('error')
        setMessage('Davet kabul edilemedi: ' + error.message)
      } else {
        setStatus('success')
        setMessage('Ekibe başarıyla katıldınız! Yönlendiriliyorsunuz…')
        setTimeout(() => router.replace('/analiz'), 2000)
      }
    }

    acceptInvite()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="max-w-sm mx-auto px-4 pt-32 pb-12 text-center">
      {status === 'loading' && (
        <>
          <div className="relative h-12 w-12 mx-auto mb-4">
            <div className="absolute inset-0 rounded-full border-4 border-white/10" />
            <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-r-transparent animate-spin" />
          </div>
          <p className="text-zinc-400 text-sm">Davet işleniyor…</p>
        </>
      )}
      {status === 'success' && (
        <>
          <div className="text-4xl mb-4">✓</div>
          <p className="text-emerald-400 font-bold text-lg">Hoş geldiniz!</p>
          <p className="text-zinc-500 text-sm mt-2">{message}</p>
        </>
      )}
      {status === 'error' && (
        <>
          <div className="text-4xl mb-4">✕</div>
          <p className="text-red-400 font-bold text-lg">Hata</p>
          <p className="text-zinc-500 text-sm mt-2">{message}</p>
        </>
      )}
    </div>
  )
}

export default function DavetPage() {
  return (
    <div className="min-h-screen bg-[#111115] text-white">
      <Navbar />
      <Suspense fallback={
        <div className="max-w-sm mx-auto px-4 pt-32 pb-12 text-center">
          <div className="relative h-12 w-12 mx-auto mb-4">
            <div className="absolute inset-0 rounded-full border-4 border-white/10" />
            <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-r-transparent animate-spin" />
          </div>
          <p className="text-zinc-400 text-sm">Yükleniyor…</p>
        </div>
      }>
        <DavetContent />
      </Suspense>
    </div>
  )
}
