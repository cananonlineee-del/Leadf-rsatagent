import type { Lead } from '../app/api/analyze/route'

export async function generateLeadPDF(
  lead: Lead,
  senderName: string,
  agencyName: string
): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ format: 'a4', unit: 'mm' })

  const W = 210
  const margin = 18
  const contentW = W - margin * 2
  let y = margin

  // ── Renk yardımcısı
  function rgb(r: number, g: number, b: number) {
    doc.setTextColor(r, g, b)
  }
  function fill(r: number, g: number, b: number) {
    doc.setFillColor(r, g, b)
  }
  function draw(r: number, g: number, b: number) {
    doc.setDrawColor(r, g, b)
  }

  function addText(
    text: string,
    x: number,
    yPos: number,
    opts: { size?: number; bold?: boolean; color?: [number, number, number] } = {}
  ) {
    doc.setFontSize(opts.size ?? 10)
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal')
    if (opts.color) doc.setTextColor(...opts.color)
    doc.text(text, x, yPos)
  }

  // ─── HEADER ───────────────────────────────────────────────────────────────
  fill(22, 22, 34)
  doc.rect(0, 0, W, 36, 'F')

  addText('Leadbulucu', margin, y + 6, { size: 11, bold: true, color: [99, 102, 241] })
  addText('Dijital Analiz Raporu', margin, y + 12, { size: 8, color: [160, 160, 180] })

  const dateStr = new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date())
  addText(dateStr, W - margin, y + 6, { size: 8, color: [120, 120, 140] })
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(120, 120, 140)
  doc.text(dateStr, W - margin, y + 6, { align: 'right' })

  y = 44

  // ─── İŞLETME ADI ──────────────────────────────────────────────────────────
  rgb(255, 255, 255)
  addText(lead.name, margin, y, { size: 18, bold: true, color: [30, 30, 40] })
  y += 7

  if (lead.address) {
    addText(lead.address, margin, y, { size: 9, color: [100, 100, 120] })
    y += 5
  }
  if (lead.phone) {
    addText(lead.phone, margin, y, { size: 9, color: [100, 100, 120] })
    y += 5
  }
  if (lead.website) {
    addText(lead.website, margin, y, { size: 9, color: [80, 80, 200] })
    y += 5
  }

  y += 4

  // ─── SKOR GÖSTERGESI ──────────────────────────────────────────────────────
  const scoreColor: [number, number, number] = lead.score >= 70
    ? [239, 68, 68]
    : lead.score >= 40
      ? [245, 158, 11]
      : [113, 113, 122]

  fill(...scoreColor)
  doc.roundedRect(margin, y, 45, 22, 3, 3, 'F')

  addText(String(lead.score), margin + 8, y + 10, { size: 20, bold: true, color: [255, 255, 255] })
  addText('/100', margin + 20, y + 10, { size: 9, color: [255, 255, 255] })
  addText('Reklam İhtiyacı', margin + 2, y + 18, { size: 7, color: [255, 255, 255] })

  const needLabel = lead.score >= 70 ? 'YÜKSEK' : lead.score >= 40 ? 'ORTA' : 'DÜŞÜK'
  addText(needLabel, margin + 50, y + 10, { size: 14, bold: true, color: scoreColor })
  addText('öncelik', margin + 50, y + 16, { size: 8, color: [150, 150, 160] })

  y += 30

  // ─── BÖLÜCÜ ───────────────────────────────────────────────────────────────
  draw(220, 220, 230)
  doc.setLineWidth(0.3)
  doc.line(margin, y, W - margin, y)
  y += 8

  // ─── 3 SÜTUNLU TABLO: Web / Sosyal / Reklam ──────────────────────────────
  const colW = contentW / 3
  const cols = [
    {
      title: 'Web Sitesi',
      checks: [
        { label: 'Web sitesi', ok: lead.websiteSource !== 'none' },
        { label: 'SSL (HTTPS)', ok: lead.siteAnalysis?.ssl ?? false },
        { label: 'Mobil uyumlu', ok: (lead.siteAnalysis?.mobileScore ?? 0) >= 70 },
        { label: 'WhatsApp butonu', ok: lead.siteAnalysis?.hasWhatsApp ?? false },
        { label: 'İletişim formu', ok: lead.siteAnalysis?.hasContactForm ?? false },
      ],
    },
    {
      title: 'Sosyal Medya',
      checks: [
        { label: 'Instagram', ok: !!lead.instagramHandle },
        { label: 'Aktif içerik', ok: lead.instagram?.activity === 'active' },
        { label: 'Facebook', ok: !!lead.facebook },
        { label: 'TikTok', ok: !!lead.tiktok },
        { label: 'Meta Reklamları', ok: lead.metaAds?.hasActiveAds ?? false },
      ],
    },
    {
      title: 'Reklam Altyapısı',
      checks: [
        { label: 'Meta Pixel', ok: lead.siteAnalysis?.hasPixel ?? false },
        { label: 'Google Ads kodu', ok: lead.siteAnalysis?.hasGoogleAds ?? false },
        { label: 'Analytics', ok: lead.siteAnalysis?.hasAnalytics ?? false },
        { label: 'GTM', ok: lead.siteAnalysis?.hasGTM ?? false },
        { label: 'Aktif reklam', ok: lead.metaAds?.hasActiveAds ?? false },
      ],
    },
  ]

  addText('Durum Özeti', margin, y, { size: 10, bold: true, color: [40, 40, 60] })
  y += 6

  for (let ci = 0; ci < cols.length; ci++) {
    const col = cols[ci]
    const cx = margin + ci * colW

    fill(240, 240, 248)
    doc.rect(cx, y, colW - 2, 7, 'F')
    addText(col.title, cx + 3, y + 5, { size: 8, bold: true, color: [60, 60, 80] })

    let rowY = y + 10
    for (const check of col.checks) {
      const okColor: [number, number, number] = check.ok ? [16, 185, 129] : [239, 68, 68]
      addText(check.ok ? '✓' : '✕', cx + 2, rowY, { size: 8, color: okColor })
      addText(check.label, cx + 7, rowY, { size: 7, color: [80, 80, 100] })
      rowY += 5
    }
  }

  y += 42

  // ─── TESPİT EDİLEN EKSİKLER ───────────────────────────────────────────────
  draw(220, 220, 230)
  doc.line(margin, y, W - margin, y)
  y += 8

  addText('Tespit Edilen Eksikler', margin, y, { size: 10, bold: true, color: [40, 40, 60] })
  y += 6

  const gaps = lead.gaps.slice(0, 6)
  for (const gap of gaps) {
    fill(254, 242, 242)
    doc.roundedRect(margin, y - 3, contentW, 7, 1, 1, 'F')
    addText('▸', margin + 2, y + 2, { size: 8, color: [239, 68, 68] })
    const wrapped = doc.splitTextToSize(gap, contentW - 10)
    addText(wrapped[0], margin + 8, y + 2, { size: 7.5, color: [60, 60, 80] })
    y += 8
  }

  y += 4

  // ─── ÖNERİLEN HİZMETLER ───────────────────────────────────────────────────
  if (y < 240) {
    draw(220, 220, 230)
    doc.line(margin, y, W - margin, y)
    y += 8

    addText('Önerilen Hizmetler', margin, y, { size: 10, bold: true, color: [40, 40, 60] })
    y += 6

    const services: string[] = []
    if (lead.websiteSource === 'none') services.push('Profesyonel web sitesi tasarımı ve geliştirme')
    if (!lead.siteAnalysis?.hasPixel) services.push('Meta Pixel kurulumu ve reklam altyapısı')
    if (!lead.siteAnalysis?.hasGoogleAds) services.push('Google Ads dönüşüm takibi entegrasyonu')
    if (lead.instagram?.activity !== 'active') services.push('Instagram içerik yönetimi ve büyüme stratejisi')
    if (!lead.facebook) services.push('Facebook sayfa kurulumu ve yönetimi')
    if (lead.reviewCount < 20) services.push('Google yorum kampanyası ve itibar yönetimi')
    if (!lead.siteAnalysis?.ssl) services.push('SSL sertifikası kurulumu')
    if (!lead.siteAnalysis?.hasWhatsApp) services.push('WhatsApp iletişim entegrasyonu')

    for (const svc of services.slice(0, 5)) {
      fill(240, 248, 255)
      doc.roundedRect(margin, y - 3, contentW, 7, 1, 1, 'F')
      addText('→', margin + 2, y + 2, { size: 8, color: [99, 102, 241] })
      addText(svc, margin + 8, y + 2, { size: 7.5, color: [60, 60, 80] })
      y += 8
    }
  }

  // ─── FOOTER ───────────────────────────────────────────────────────────────
  const footerY = 285
  draw(220, 220, 230)
  doc.line(margin, footerY - 4, W - margin, footerY - 4)

  const footerParts = [senderName, agencyName].filter(Boolean)
  const footerLeft = footerParts.join(' · ')
  addText(footerLeft, margin, footerY, { size: 7.5, color: [120, 120, 140] })
  addText('Leadbulucu ile hazırlandı', W - margin, footerY, { size: 7.5, color: [150, 150, 200] })
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(150, 150, 200)
  doc.text('Leadbulucu ile hazırlandı', W - margin, footerY, { align: 'right' })

  // ── Kaydet
  const filename = `${lead.name.replace(/[^a-z0-9]/gi, '_')}_dijital_analiz.pdf`
  doc.save(filename)
}
