-- ── Kendi Kendine Şifre Sıfırlama — Güvenlik Kodu ────────────────
-- Supabase SQL Editor'de çalıştır

ALTER TABLE personnel ADD COLUMN IF NOT EXISTS security_code TEXT;
