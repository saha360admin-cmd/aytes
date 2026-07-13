-- ── Bildirim Altyapısı (push_tokens + notifications) ────────────
-- Supabase SQL Editor'de manuel çalıştır.
-- auth_personnel_id() zaten supabase-prod-migration.sql'de tanımlı.

-- ── 1. PUSH TOKENS ───────────────────────────────────────────────
-- Bir personelin birden fazla cihazı/sekmesi olabilir (telefon + tarayıcı),
-- bu yüzden personnel_id başına birden fazla satır olabilir; token tekil.
CREATE TABLE IF NOT EXISTS public.push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  personnel_id UUID NOT NULL REFERENCES public.personnel(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL CHECK (platform IN ('web', 'android')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS push_tokens_personnel_idx ON public.push_tokens(personnel_id);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "push_tokens_select" ON public.push_tokens;
DROP POLICY IF EXISTS "push_tokens_delete" ON public.push_tokens;

-- Personel sadece kendi token'larını görebilir/silebilir (örn. çıkış yaparken).
-- Insert/update yalnızca sunucu tarafında (service role) yapılır — client'tan
-- doğrudan yazma yolu yok, bu yüzden INSERT/UPDATE policy'si tanımlanmadı.
CREATE POLICY "push_tokens_select" ON public.push_tokens
  FOR SELECT USING (personnel_id = public.auth_personnel_id());

CREATE POLICY "push_tokens_delete" ON public.push_tokens
  FOR DELETE USING (personnel_id = public.auth_personnel_id());

-- ── 2. NOTIFICATIONS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  personnel_id UUID NOT NULL REFERENCES public.personnel(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('vardiya', 'devriye', 'olay')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS notifications_personnel_idx ON public.notifications(personnel_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notifications_select" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update" ON public.notifications;

-- Personel sadece kendi bildirimlerini görebilir ve "okundu" işaretleyebilir
-- (read_at). Insert sadece sunucu tarafında (service role, notifyPersonnel).
CREATE POLICY "notifications_select" ON public.notifications
  FOR SELECT USING (personnel_id = public.auth_personnel_id());

CREATE POLICY "notifications_update" ON public.notifications
  FOR UPDATE USING (personnel_id = public.auth_personnel_id())
  WITH CHECK (personnel_id = public.auth_personnel_id());

-- ── 3. DEVRİYE HATIRLATMA — tekrar bildirim engelleme ────────────
ALTER TABLE public.patrol_assignments
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

-- ── 4. REALTIME ───────────────────────────────────────────────────
-- Bildirim zili anlık rozet güncellemesi için "notifications" tablosunu
-- Supabase Dashboard > Database > Replication üzerinden açık olan
-- publication'a (genellikle supabase_realtime) manuel eklemeniz gerekir
-- — emergency_alerts (supabase-acil-durum.sql) ile aynı adım:
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
