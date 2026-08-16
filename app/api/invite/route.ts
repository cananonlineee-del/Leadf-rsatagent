import { type NextRequest } from 'next/server'
import { createClient } from '../../../lib/supabase/server'

// ─── E-posta HTML şablonu ─────────────────────────────────────────────────────

function buildInviteEmail(inviterEmail: string, inviteUrl: string): string {
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    body{margin:0;padding:0;background:#111115;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif}
    .wrap{max-width:480px;margin:40px auto;padding:0 20px}
    .card{background:#1c1c22;border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:32px}
    .logo{color:#2563eb;font-weight:900;font-size:16px;margin-bottom:24px;display:block;text-decoration:none}
    h1{color:#ffffff;font-size:20px;font-weight:800;margin:0 0 12px}
    p{color:#a1a1aa;font-size:14px;line-height:1.6;margin:0 0 24px}
    .inviter{color:#e4e4e7;font-weight:600}
    .btn{display:inline-block;background:#2563eb;color:#ffffff!important;text-decoration:none;font-weight:700;font-size:14px;padding:12px 24px;border-radius:12px}
    .url{color:#3f3f46;font-size:11px;word-break:break-all;margin-top:16px}
    .footer{color:#52525b;font-size:11px;margin-top:24px;text-align:center}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <span class="logo">Leadbulucu</span>
      <h1>Ekibe davet edildiniz</h1>
      <p>
        <span class="inviter">${inviterEmail}</span> sizi Leadbulucu ekibine davet etti.
        Lead analizlerini ve CRM verilerini birlikte takip etmek için daveti kabul edin.
      </p>
      <a class="btn" href="${inviteUrl}">Daveti Kabul Et &rarr;</a>
      <div class="url">${inviteUrl}</div>
    </div>
    <div class="footer">Leadbulucu &middot; Bu davet bağlantısı yalnızca size özeldir.</div>
  </div>
</body>
</html>`
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Auth — sadece giriş yapmış kullanıcı davet gönderebilir
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'Oturum gerekli.' }, { status: 401 })
  }

  // Body doğrulama
  let body: { email?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Geçersiz istek gövdesi.' }, { status: 400 })
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email || !email.includes('@') || !email.includes('.')) {
    return Response.json({ error: 'Geçerli bir e-posta adresi girin.' }, { status: 400 })
  }

  // Kendini davet etmeyi engelle
  if (email === user.email?.toLowerCase()) {
    return Response.json({ error: 'Kendinizi davet edemezsiniz.' }, { status: 400 })
  }

  // team_members tablosuna ekle; oluşan UUID'yi token olarak kullan
  const { data: member, error: insertError } = await supabase
    .from('team_members')
    .insert({ member_email: email })
    .select('id')
    .single()

  if (insertError) {
    return Response.json({ error: insertError.message }, { status: 500 })
  }

  const token = (member as { id: string }).id
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  const inviteUrl = `${siteUrl}/davet?token=${token}`

  // ── E-posta gönder (Resend REST API) ──────────────────────────────────────
  const resendKey  = process.env.RESEND_API_KEY
  const fromEmail  = process.env.RESEND_FROM_EMAIL ?? 'davet@leadbulucu.com'

  let emailSent  = false
  let emailError: string | undefined

  if (resendKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from:    `Leadbulucu <${fromEmail}>`,
          to:      [email],
          subject: 'Leadbulucu ekibine davet edildiniz',
          html:    buildInviteEmail(user.email!, inviteUrl),
        }),
      })

      if (res.ok) {
        emailSent = true
      } else {
        const errData = await res.json().catch(() => ({})) as { message?: string }
        emailError = errData.message ?? `Resend HTTP ${res.status}`
      }
    } catch (err) {
      emailError = String(err)
    }
  } else {
    // RESEND_API_KEY ayarlı değil — URL'yi döndür, admin manuel paylaşabilir
    emailError = 'RESEND_API_KEY tanımlı değil'
  }

  return Response.json({
    success: true,
    emailSent,
    // E-posta gönderilemezse yönetici URL'i manuel paylaşabilsin
    inviteUrl: emailSent ? undefined : inviteUrl,
    emailError,
  })
}
