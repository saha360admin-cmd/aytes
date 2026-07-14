-- ── Giriş/Çıkış etiketlerine QR desteği ──────────────────────────
-- Supabase SQL Editor'de manuel çalıştır.
--
-- devriye'deki patrol_route_points.qr_token ile aynı desen: NFC'nin
-- yanına, iOS Safari'de (Web NFC desteklenmiyor) de çalışacak kamera
-- tabanlı QR doğrulaması için bir kolon.

ALTER TABLE public.beacons ADD COLUMN IF NOT EXISTS qr_token TEXT UNIQUE;
