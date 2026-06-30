-- ============================================================
-- PRODUCTION MIGRATION — RLS Sıkılaştırma + Güvenlik
-- Supabase SQL Editor'de çalıştır
-- ============================================================

-- ─────────────────────────────────────────────
-- 1. YARDIMCI FONKSİYONLAR
--    auth.uid() → personnel.id / role
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.auth_personnel_id()
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT id FROM public.personnel WHERE auth_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.auth_personnel_role()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role FROM public.personnel WHERE auth_id = auth.uid() LIMIT 1;
$$;


-- ─────────────────────────────────────────────
-- 2. SERVICE_REQUESTS — RLS Sıkılaştırma
-- ─────────────────────────────────────────────

-- Eski açık politikayı kaldır
DROP POLICY IF EXISTS "service_requests_all" ON public.service_requests;

-- SELECT: sadece admin ve supervisor
CREATE POLICY "sr_select"
  ON public.service_requests FOR SELECT
  USING (public.auth_personnel_role() IN ('admin', 'supervisor'));

-- INSERT: sadece admin ve supervisor
CREATE POLICY "sr_insert"
  ON public.service_requests FOR INSERT
  WITH CHECK (public.auth_personnel_role() IN ('admin', 'supervisor'));

-- UPDATE: sadece admin ve supervisor
CREATE POLICY "sr_update"
  ON public.service_requests FOR UPDATE
  USING  (public.auth_personnel_role() IN ('admin', 'supervisor'))
  WITH CHECK (public.auth_personnel_role() IN ('admin', 'supervisor'));

-- DELETE: sadece admin
CREATE POLICY "sr_delete"
  ON public.service_requests FOR DELETE
  USING (public.auth_personnel_role() = 'admin');


-- ─────────────────────────────────────────────
-- 3. SERVICE_REQUESTS — created_by + opened_at Trigger
--    Client'tan gelen değerleri override et
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_service_request_author()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  NEW.created_by := public.auth_personnel_id();
  NEW.opened_at  := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_service_request_author ON public.service_requests;
CREATE TRIGGER trg_service_request_author
  BEFORE INSERT ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_service_request_author();


-- ─────────────────────────────────────────────
-- 4. CONTRACTORS — created_by kolonu
-- ─────────────────────────────────────────────

ALTER TABLE public.contractors
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.personnel(id);

-- ─────────────────────────────────────────────
-- 5. CONTRACTORS — RLS Sıkılaştırma
-- ─────────────────────────────────────────────

-- Eski açık politikayı kaldır
DROP POLICY IF EXISTS "contractors_all" ON public.contractors;

-- SELECT: giriş yapmış herkes (arıza formundaki dropdown için)
CREATE POLICY "con_select"
  ON public.contractors FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- INSERT: sadece admin ve supervisor
CREATE POLICY "con_insert"
  ON public.contractors FOR INSERT
  WITH CHECK (public.auth_personnel_role() IN ('admin', 'supervisor'));

-- UPDATE: sadece admin ve supervisor
CREATE POLICY "con_update"
  ON public.contractors FOR UPDATE
  USING  (public.auth_personnel_role() IN ('admin', 'supervisor'))
  WITH CHECK (public.auth_personnel_role() IN ('admin', 'supervisor'));

-- DELETE: sadece admin
CREATE POLICY "con_delete"
  ON public.contractors FOR DELETE
  USING (public.auth_personnel_role() = 'admin');


-- ─────────────────────────────────────────────
-- 6. CONTRACTORS — created_by Trigger
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_contractor_author()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  NEW.created_by := public.auth_personnel_id();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contractor_author ON public.contractors;
CREATE TRIGGER trg_contractor_author
  BEFORE INSERT ON public.contractors
  FOR EACH ROW EXECUTE FUNCTION public.set_contractor_author();


-- ─────────────────────────────────────────────
-- 7. UZUNLUK KISITLAMALARI
-- ─────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE public.service_requests
    ADD CONSTRAINT chk_sr_description_len
    CHECK (char_length(description) <= 2000);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.service_requests
    ADD CONSTRAINT chk_sr_notes_len
    CHECK (char_length(notes) <= 5000);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.service_requests
    ADD CONSTRAINT chk_sr_location_len
    CHECK (char_length(location_detail) <= 500);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.service_requests
    ADD CONSTRAINT chk_sr_ticket_len
    CHECK (char_length(contractor_ticket_no) <= 100);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.contractors
    ADD CONSTRAINT chk_con_name_len
    CHECK (char_length(name) <= 200);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.contractors
    ADD CONSTRAINT chk_con_description_len
    CHECK (char_length(description) <= 1000);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ─────────────────────────────────────────────
-- 8. DOĞRULAMA — Politikaları listele
-- ─────────────────────────────────────────────
SELECT schemaname, tablename, policyname, cmd, qual
FROM pg_policies
WHERE tablename IN ('service_requests', 'contractors')
ORDER BY tablename, policyname;
