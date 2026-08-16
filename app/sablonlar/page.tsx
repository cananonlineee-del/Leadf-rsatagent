'use client'

import { useState, useEffect } from 'react'
import { Navbar } from '../components/navbar'
import {
  listTemplates, saveTemplate, deleteTemplate, applyTemplate,
  type MessageTemplate,
} from '../../lib/templates'

const DEMO_LEAD = {
  name: 'Kafe Luna',
  primaryType: 'Kafe',
  gaps: ['Instagram hesabı 45 gündür güncellenmemiş', 'Web sitesinde Meta Pixel yok'],
} as const

function TemplateCard({
  template,
  onDelete,
}: {
  template: MessageTemplate
  onDelete: () => void
}) {
  const [showLong, setShowLong] = useState(false)
  const [copied, setCopied]     = useState(false)

  const previewSender = { name: 'Siz', agency: 'Ajansınız', website: 'www.ajans.com' }
  const previewText = applyTemplate(
    showLong ? template.long_template : template.short_template,
    DEMO_LEAD as never,
    previewSender
  )

  async function handleCopy() {
    await navigator.clipboard.writeText(previewText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="bg-[#1c1c22] border border-white/[0.12] rounded-2xl overflow-hidden">
      <div className="px-5 py-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-white truncate">{template.name}</h3>
          {template.sector && (
            <span className="text-[11px] text-blue-400 font-medium">{template.sector}</span>
          )}
        </div>
        <button
          onClick={onDelete}
          className="shrink-0 text-xs text-zinc-600 hover:text-red-400 transition-colors px-2 py-1"
        >
          Sil
        </button>
      </div>

      {/* Toggle */}
      <div className="px-5 pb-3">
        <div className="flex rounded-xl bg-white/[0.06] p-1 mb-3">
          <button
            type="button"
            onClick={() => setShowLong(false)}
            className={`flex-1 py-1 rounded-lg text-xs font-semibold transition-colors ${
              !showLong ? 'bg-white/10 text-white' : 'text-zinc-500'
            }`}
          >
            Kısa
          </button>
          <button
            type="button"
            onClick={() => setShowLong(true)}
            className={`flex-1 py-1 rounded-lg text-xs font-semibold transition-colors ${
              showLong ? 'bg-white/10 text-white' : 'text-zinc-500'
            }`}
          >
            Uzun
          </button>
        </div>

        <pre className="bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-3 text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap font-sans max-h-40 overflow-y-auto">
          {previewText}
        </pre>

        <button
          onClick={handleCopy}
          className={`mt-2 w-full text-xs font-semibold py-2 rounded-xl border transition-colors ${
            copied
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
              : 'border-white/[0.12] text-zinc-500 hover:text-white hover:bg-white/[0.06]'
          }`}
        >
          {copied ? '✓ Kopyalandı' : 'Önizlemeyi Kopyala'}
        </button>
      </div>
    </div>
  )
}

export default function SablonlarPage() {
  const [templates, setTemplates]     = useState<MessageTemplate[]>([])
  const [loading, setLoading]         = useState(true)
  const [showForm, setShowForm]       = useState(false)

  const [name, setName]               = useState('')
  const [sector, setSector]           = useState('')
  const [shortTpl, setShortTpl]       = useState('')
  const [longTpl, setLongTpl]         = useState('')
  const [saving, setSaving]           = useState(false)
  const [livePreviewShort, setLivePreviewShort] = useState(true)

  const demoSender = { name: 'Siz', agency: 'Ajansınız', website: 'www.ajans.com' }
  const livePreview = applyTemplate(
    livePreviewShort ? shortTpl : longTpl,
    DEMO_LEAD as never,
    demoSender
  )

  async function load() {
    setLoading(true)
    setTemplates(await listTemplates())
    setLoading(false)
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!name || !shortTpl || !longTpl) return
    setSaving(true)
    await saveTemplate({ name, sector: sector || null, short_template: shortTpl, long_template: longTpl })
    setName(''); setSector(''); setShortTpl(''); setLongTpl('')
    setShowForm(false)
    await load()
    setSaving(false)
  }

  async function handleDelete(id: string) {
    await deleteTemplate(id)
    setTemplates(t => t.filter(x => x.id !== id))
  }

  const VARS = '{{işletmeAdı}}, {{sektör}}, {{gap1}}, {{gap2}}, {{gönderenAd}}, {{ajansAd}}, {{ajansWeb}}'

  return (
    <div className="min-h-screen bg-[#111115] text-white">
      <Navbar />
      <div className="max-w-2xl mx-auto px-4 pt-14 pb-12">

        <div className="text-center mb-8 pt-10">
          <h1 className="text-3xl font-black text-white tracking-tight">Mesaj Şablonları</h1>
          <p className="text-zinc-500 text-sm mt-2">Sektöre özel mesaj şablonları oluştur, leadlere tek tıkla uygula.</p>
        </div>

        {/* Yeni şablon butonu */}
        <div className="flex justify-end mb-4">
          <button
            onClick={() => setShowForm(v => !v)}
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
          >
            {showForm ? '✕ İptal' : '+ Yeni Şablon'}
          </button>
        </div>

        {/* Yeni şablon formu */}
        {showForm && (
          <form
            onSubmit={handleSave}
            className="bg-[#1c1c22] border border-white/[0.12] rounded-2xl p-5 mb-6 space-y-4"
          >
            <h2 className="text-sm font-bold text-white">Yeni Şablon</h2>

            <p className="text-[11px] text-zinc-600">
              Kullanılabilir değişkenler: <span className="text-zinc-400">{VARS}</span>
            </p>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5">Şablon Adı *</label>
                <input
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Restoran Kısa"
                  className="w-full bg-white/[0.07] border border-white/[0.12] text-white rounded-xl px-3 py-2.5 text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition"
                />
              </div>
              <div className="flex-1">
                <label className="block text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5">Sektör (opsiyonel)</label>
                <input
                  value={sector}
                  onChange={e => setSector(e.target.value)}
                  placeholder="restoran"
                  className="w-full bg-white/[0.07] border border-white/[0.12] text-white rounded-xl px-3 py-2.5 text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5">Kısa Mesaj *</label>
              <textarea
                required
                value={shortTpl}
                onChange={e => setShortTpl(e.target.value)}
                rows={3}
                placeholder="Merhaba, {{işletmeAdı}}'nı inceledim — {{gap1}}..."
                className="w-full bg-white/[0.07] border border-white/[0.12] text-white rounded-xl px-3 py-2.5 text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition resize-none"
              />
            </div>

            <div>
              <label className="block text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5">Uzun Mesaj *</label>
              <textarea
                required
                value={longTpl}
                onChange={e => setLongTpl(e.target.value)}
                rows={6}
                placeholder="Merhaba, {{işletmeAdı}} sayfanızı inceleyerek size ulaşmak istedim..."
                className="w-full bg-white/[0.07] border border-white/[0.12] text-white rounded-xl px-3 py-2.5 text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition resize-none"
              />
            </div>

            {/* Canlı önizleme */}
            {(shortTpl || longTpl) && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Canlı Önizleme</span>
                  <div className="flex rounded-lg bg-white/[0.06] p-0.5">
                    <button type="button" onClick={() => setLivePreviewShort(true)} className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${livePreviewShort ? 'bg-white/10 text-white' : 'text-zinc-500'}`}>Kısa</button>
                    <button type="button" onClick={() => setLivePreviewShort(false)} className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${!livePreviewShort ? 'bg-white/10 text-white' : 'text-zinc-500'}`}>Uzun</button>
                  </div>
                </div>
                <pre className="bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-3 text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap font-sans max-h-40 overflow-y-auto">
                  {livePreview || '(önizleme için şablon girin)'}
                </pre>
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl py-2.5 text-sm transition-colors disabled:opacity-50"
            >
              {saving ? 'Kaydediliyor…' : 'Şablonu Kaydet'}
            </button>
          </form>
        )}

        {/* Liste */}
        {loading ? (
          <div className="text-center py-12 text-zinc-600 text-sm">Yükleniyor…</div>
        ) : templates.length === 0 ? (
          <div className="text-center py-16 border border-white/[0.07] rounded-2xl bg-white/[0.02]">
            <div className="text-4xl mb-4">📝</div>
            <p className="text-zinc-300 text-sm font-semibold mb-1">Henüz şablon yok</p>
            <p className="text-zinc-600 text-xs mb-5 max-w-xs mx-auto leading-relaxed">
              Sektöre özel mesaj şablonları oluşturun. Leadlere tek tıkla uygulayın, zamandan tasarruf edin.
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-5 py-2.5 rounded-xl transition-colors"
            >
              + İlk Şablonu Oluştur
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {templates.map(t => (
              <TemplateCard
                key={t.id}
                template={t}
                onDelete={() => handleDelete(t.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
