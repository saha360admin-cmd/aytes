-- ── Talep red nedeni — requests.rejection_note ──
-- Supabase SQL Editor'de çalıştır
-- Not: requests tablosunun DDL'i repoda yok (dashboard'dan oluşturulmuş).
-- incident_departments.rejection_note ile aynı desen: yönetici reddederken
-- bir not giriyor, bu not sadece talebi yapan personelin kendi
-- "Taleplerim" görünümünde gösteriliyor (personel zaten sadece
-- personnel_id = kendisi olan satırları görüyor).

ALTER TABLE requests ADD COLUMN IF NOT EXISTS rejection_note TEXT;
