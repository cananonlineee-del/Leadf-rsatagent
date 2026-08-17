-- CRM Takip Tarihi: crm_leads tablosuna follow_up_date eklenir
-- Supabase Dashboard → SQL Editor'de çalıştırın.

ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS follow_up_date DATE;
