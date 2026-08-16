-- Ekip CRM Paylaşımı: crm_leads tablosuna ekip üyesi okuma izni
--
-- Ekip sahibi (user_id = auth.uid()) her zaman kendi CRM leadlerini okuyabilir.
-- Kabul etmiş ekip üyeleri (accepted_at IS NOT NULL ve member_email = auth.email())
-- de sahibin CRM leadlerini okuyabilir.
--
-- Supabase Dashboard → SQL Editor'de çalıştırın.

-- ── 1. Mevcut politikaları temizle (idempotent) ───────────────────────────────

DROP POLICY IF EXISTS "crm_leads_owner_select" ON crm_leads;
DROP POLICY IF EXISTS "crm_leads_owner_insert" ON crm_leads;
DROP POLICY IF EXISTS "crm_leads_owner_update" ON crm_leads;
DROP POLICY IF EXISTS "crm_leads_owner_delete" ON crm_leads;
DROP POLICY IF EXISTS "crm_leads_team_select"  ON crm_leads;

-- ── 2. Sahip politikaları ─────────────────────────────────────────────────────

CREATE POLICY "crm_leads_owner_select"
  ON crm_leads FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "crm_leads_owner_insert"
  ON crm_leads FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "crm_leads_owner_update"
  ON crm_leads FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "crm_leads_owner_delete"
  ON crm_leads FOR DELETE
  USING (auth.uid() = user_id);

-- ── 3. Ekip üyesi okuma politikası ───────────────────────────────────────────
-- Kabul etmiş (accepted_at IS NOT NULL) ekip üyeleri, sahibin CRM leadlerini
-- okuyabilir. Yazma izni yoktur — sadece okuma.

CREATE POLICY "crm_leads_team_select"
  ON crm_leads FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM team_members tm
      WHERE tm.owner_id   = crm_leads.user_id
        AND tm.member_email = auth.email()
        AND tm.accepted_at IS NOT NULL
    )
  );

-- ── 4. RLS etkin mi kontrol et ────────────────────────────────────────────────
-- crm_leads tablosunda RLS açık olmalı:
-- ALTER TABLE crm_leads ENABLE ROW LEVEL SECURITY;
