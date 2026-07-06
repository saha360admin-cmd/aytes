-- ── "Giriş Desteği" talep tipini requests.type CHECK kısıtına ekle ──
-- Supabase SQL Editor'de çalıştır
-- Not: requests tablosunun DDL'i repoda yok (dashboard'dan oluşturulmuş),
-- bu yüzden mevcut kısıt kaldırılıp bilinen değerler + yeni değerle
-- yeniden oluşturuluyor.

ALTER TABLE requests DROP CONSTRAINT IF EXISTS requests_type_check;
ALTER TABLE requests ADD CONSTRAINT requests_type_check
  CHECK (type IN ('unpaid', 'annual', 'medical', 'resign', 'other', 'giris_destek'));
