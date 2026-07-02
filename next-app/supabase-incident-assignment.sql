-- ── Olay → Personel Atama ───────────────────────────────────────
-- Supabase SQL Editor'de çalıştır

ALTER TABLE incident_departments ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES personnel(id) ON DELETE SET NULL;
