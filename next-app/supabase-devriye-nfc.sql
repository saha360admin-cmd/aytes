-- Devriye kontrol noktalarına NFC etiket doğrulaması eklendi.
-- Supabase SQL Editor'de çalıştır.
--
-- patrol_route_points: admin tarafından bir noktaya atanan fiziksel NFC
-- etiketinin UID'si (örn. "04:a1:b2:c3:d4:e5:f6").
-- patrol_checkpoints: devriye başlarken patrol_route_points.nfc_uid'den
-- kopyalanan, o çalıştırmadaki checkpoint'in beklenen UID'si.
--
-- qr_token alanına dokunulmuyor — kat-kontrol'ün ayrı QR sistemi onu kullanıyor.

ALTER TABLE patrol_route_points ADD COLUMN IF NOT EXISTS nfc_uid text;
ALTER TABLE patrol_checkpoints ADD COLUMN IF NOT EXISTS nfc_uid text;
