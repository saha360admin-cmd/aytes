-- ── Kat Kontrolü — QR doğrulama kolonları ──────────────────────
-- Supabase SQL Editor'de çalıştır

ALTER TABLE patrol_route_points ADD COLUMN IF NOT EXISTS qr_token TEXT UNIQUE;
ALTER TABLE patrol_route_points ADD COLUMN IF NOT EXISTS detail TEXT; -- "10. Kat WC" gibi serbest metin

ALTER TABLE patrol_checkpoints ADD COLUMN IF NOT EXISTS qr_token TEXT;
ALTER TABLE patrol_checkpoints ADD COLUMN IF NOT EXISTS detail TEXT;
