-- Sıcak Lead Tablosu: iş ilanı sinyalleri (kariyer.net, jooble TR)
-- Supabase Dashboard → SQL Editor'de çalıştırın.

CREATE TABLE IF NOT EXISTS warm_leads (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  source       text        NOT NULL CHECK (source IN ('kariyer', 'jooble')),
  company_name text        NOT NULL,
  job_title    text,
  city         text,
  posted_at    date,
  job_url      text        NOT NULL,
  snippet      text,
  is_seen      boolean     DEFAULT false,
  created_at   timestamptz DEFAULT now(),
  UNIQUE (source, job_url)
);

-- Sıralama ve filtreleme indeksleri
CREATE INDEX IF NOT EXISTS warm_leads_created_at_idx ON warm_leads (created_at DESC);
CREATE INDEX IF NOT EXISTS warm_leads_source_idx     ON warm_leads (source);
CREATE INDEX IF NOT EXISTS warm_leads_is_seen_idx    ON warm_leads (is_seen);

-- RLS: oturum açmış her kullanıcı okuyabilir (global ilan verisi)
ALTER TABLE warm_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated users can read warm leads"
  ON warm_leads FOR SELECT TO authenticated USING (true);

CREATE POLICY "service role can insert warm leads"
  ON warm_leads FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "service role can update warm leads"
  ON warm_leads FOR UPDATE TO service_role USING (true);

-- 30 günden eski kayıtları otomatik temizle (opsiyonel, şimdilik yorum satırında)
-- CREATE OR REPLACE FUNCTION delete_old_warm_leads() RETURNS void AS $$
--   DELETE FROM warm_leads WHERE created_at < now() - interval '30 days';
-- $$ LANGUAGE sql;
