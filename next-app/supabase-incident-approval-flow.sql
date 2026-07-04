-- ============================================================
-- OLAY ONAY AKIŞI — pending_approval durumu + ret notu + RLS
-- Supabase SQL Editor'de çalıştır
-- ============================================================

-- 1. Ret notu kolonu
ALTER TABLE public.incident_departments
  ADD COLUMN IF NOT EXISTS rejection_note TEXT;

-- 2. CHECK constraint güncelle
-- NOT: incident_departments Dashboard'da elle oluşturulmuş, DDL repoda yok.
-- Aşağıdaki isim varsayılan Postgres adlandırma kuralına göre tahmindir.
-- Hata alırsan önce gerçek adı bul:
--   SELECT conname FROM pg_constraint
--   WHERE conrelid = 'public.incident_departments'::regclass AND contype = 'c';
ALTER TABLE public.incident_departments
  DROP CONSTRAINT IF EXISTS incident_departments_status_check;
ALTER TABLE public.incident_departments
  ADD CONSTRAINT incident_departments_status_check
  CHECK (status IN ('open', 'in_progress', 'pending_approval', 'closed'));

-- 3. RLS — rol bazlı UPDATE ayrımı
-- auth_dept_id(), auth_personnel_role(), auth_personnel_id() zaten tanımlı
-- (supabase-rls-dept-isolation.sql, supabase-prod-migration.sql).
DROP POLICY IF EXISTS "incident_departments_all" ON public.incident_departments;
DROP POLICY IF EXISTS "incident_departments_select" ON public.incident_departments;
DROP POLICY IF EXISTS "incident_departments_insert" ON public.incident_departments;
DROP POLICY IF EXISTS "incident_departments_update_technician" ON public.incident_departments;
DROP POLICY IF EXISTS "incident_departments_update_manager" ON public.incident_departments;

CREATE POLICY "incident_departments_select" ON public.incident_departments
  FOR SELECT USING (
    department_id = public.auth_dept_id()
    OR incident_id IN (SELECT id FROM public.incidents WHERE department_id = public.auth_dept_id())
  );

CREATE POLICY "incident_departments_insert" ON public.incident_departments
  FOR INSERT WITH CHECK (
    department_id = public.auth_dept_id()
    OR incident_id IN (SELECT id FROM public.incidents WHERE department_id = public.auth_dept_id())
  );

-- Teknisyen: sadece kendine atanmış, in_progress kaydı, sadece pending_approval'a taşıyabilir
CREATE POLICY "incident_departments_update_technician" ON public.incident_departments
  FOR UPDATE USING (
    department_id = public.auth_dept_id()
    AND assigned_to = public.auth_personnel_id()
    AND status = 'in_progress'
  ) WITH CHECK (
    department_id = public.auth_dept_id()
    AND assigned_to = public.auth_personnel_id()
    AND status = 'pending_approval'
  );

-- Yönetici/admin: kendi departmanında serbest (mevcut geniş davranış + onay/red)
CREATE POLICY "incident_departments_update_manager" ON public.incident_departments
  FOR UPDATE USING (
    department_id = public.auth_dept_id()
    AND public.auth_personnel_role() IN ('admin', 'supervisor')
  ) WITH CHECK (
    department_id = public.auth_dept_id()
    AND public.auth_personnel_role() IN ('admin', 'supervisor')
  );
