-- ── Bir personelin aynı gün birden fazla lokasyonda görev alabilmesi ──
-- Supabase SQL Editor'de çalıştır
--
-- Senaryo: bir güvenlik görevlisi aynı gün X lokasyonunda 1. vardiya,
-- Y lokasyonunda 2. vardiya alabilir (çakışmayan saatler). Şu ana kadar
-- personnel_id+shift_date üzerindeki tekillik bunu engelliyordu (bir
-- kişi günde sadece TEK satıra sahip olabiliyordu, lokasyon fark etmeksizin).
-- Tekillik artık personnel_id+shift_date+location_id — kişi aynı gün
-- birden fazla lokasyonda satıra sahip olabilir, ama aynı lokasyonda hâlâ tek satır.
--
-- Not: shift_assignments tablosunun DDL'i repoda yok (dashboard'dan
-- oluşturulmuş). Aşağıdaki eski kısıt adı Postgres'in varsayılan
-- adlandırma kuralına göre tahmin ediliyor. DROP CONSTRAINT hata
-- verirse önce gerçek adı bul:
--   SELECT conname FROM pg_constraint WHERE conrelid = 'shift_assignments'::regclass AND contype = 'u';
-- ve aşağıdaki DROP satırındaki ismi onunla değiştir.

ALTER TABLE shift_assignments DROP CONSTRAINT IF EXISTS shift_assignments_personnel_id_shift_date_key;
ALTER TABLE shift_assignments ADD CONSTRAINT shift_assignments_personnel_id_shift_date_location_id_key UNIQUE (personnel_id, shift_date, location_id);
