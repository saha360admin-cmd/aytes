-- ── Devriye hatırlatma cron'u — pg_cron + pg_net ────────────────
-- Supabase SQL Editor'de manuel çalıştır.
--
-- Vercel Hobby planı kendi cron özelliğinde günde 1 çalışmayla
-- sınırlı; bu yüzden /api/cron/patrol-check'i her 5 dakikada bir
-- Supabase'in kendi zamanlayıcısından (pg_cron) tetikliyoruz — ekstra
-- bir dış servise ihtiyaç yok, tamamen mevcut altyapıda.
--
-- Eğer "permission denied to create extension" hatası alırsanız,
-- Dashboard > Database > Extensions sayfasından "pg_cron" ve "pg_net"i
-- elle açıp bu dosyayı tekrar çalıştırın (sadece CREATE EXTENSION
-- satırları atlanır, geri kalanı aynı çalışır).

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Aynı isimde eski bir zamanlama varsa (bu dosya tekrar çalıştırılırsa)
-- önce kaldırılır, böylece CREATE gibi idempotent davranır.
select cron.unschedule('patrol-check-every-5min')
where exists (select 1 from cron.job where jobname = 'patrol-check-every-5min');

-- ÖNEMLİ: Aşağıdaki <CRON_SECRET> yer tutucusunu çalıştırmadan önce
-- .env.local / Vercel'deki gerçek CRON_SECRET değeriyle değiştirin —
-- gerçek değer bu dosyaya (repoya) hiç yazılmamalı.
select cron.schedule(
  'patrol-check-every-5min',
  '*/5 * * * *',
  $$
  select net.http_get(
    url := 'https://aytes-gold.vercel.app/api/cron/patrol-check',
    headers := '{"Authorization": "Bearer <CRON_SECRET>"}'::jsonb,
    timeout_milliseconds := 20000
  ) as request_id;
  $$
);

-- Doğrulama: zamanlamanın kaydedildiğini kontrol et.
-- select * from cron.job where jobname = 'patrol-check-every-5min';
-- Son çalışmaların sonucunu görmek için:
-- select * from cron.job_run_details order by start_time desc limit 10;
