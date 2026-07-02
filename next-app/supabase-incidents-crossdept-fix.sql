-- ── INCIDENTS — çok-birimli görünürlük düzeltmesi (v4 — kalıcı) ─
-- Supabase SQL Editor'de çalıştır
--
-- v2/v3 (SECURITY DEFINER fonksiyonlar, LANGUAGE sql / plpgsql, row_security=off)
-- "infinite recursion detected in policy" hatasını ÇÖZMEDİ — Postgres'in bu recursion
-- koruması, SECURITY DEFINER'ın rol/RLS bypass semantiğinden bağımsız çalışıyor
-- (incidents ↔ incident_departments politikaları birbirini sorguladığı sürece,
-- fonksiyon sarmalasa bile tetikleniyor).
--
-- v4: Döngüyü tamamen ortadan kaldırıyoruz. incidents tablosuna hedef departman
-- id'lerini düz bir dizi (department_ids) olarak yazıyoruz (olay-bildir sayfası artık
-- bunu insert ederken dolduruyor). incidents_select artık incident_departments'a HİÇ
-- dokunmuyor — sadece kendi satırındaki diziye bakıyor. Böylece incident_departments_all
-- güvenle incidents'a bakabiliyor (tek yönlü), ama incidents artık incident_departments'a
-- bakmıyor (döngü kırıldı).

-- 1) Önceki (başarısız) fonksiyonları temizle
DROP FUNCTION IF EXISTS public.auth_incident_ids_by_dept();
DROP FUNCTION IF EXISTS public.auth_own_incident_ids();

-- 2) Yeni kolon + geriye dönük doldurma (mevcut olaylar için)
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS department_ids uuid[] NOT NULL DEFAULT '{}';

UPDATE public.incidents i
SET department_ids = COALESCE((
  SELECT array_agg(d.department_id) FROM public.incident_departments d WHERE d.incident_id = i.id
), '{}')
WHERE department_ids = '{}';

-- 3) incidents_select artık sadece kendi diziye bakıyor — incident_departments'a hiç dokunmuyor
DROP POLICY IF EXISTS "incidents_select" ON public.incidents;
CREATE POLICY "incidents_select" ON public.incidents
  FOR SELECT USING (
    department_id = public.auth_dept_id()
    OR public.auth_dept_id() = ANY(department_ids)
  );

-- 4) incident_departments_all: tek yönlü olarak incidents'a bakabilir (artık güvenli, döngü yok)
DROP POLICY IF EXISTS "incident_departments_all" ON public.incident_departments;
CREATE POLICY "incident_departments_all" ON public.incident_departments
  FOR ALL USING (
    department_id = public.auth_dept_id()
    OR incident_id IN (
      SELECT id FROM public.incidents WHERE department_id = public.auth_dept_id()
    )
  );

-- incidents_insert / incidents_update kasıtlı olarak değiştirilmedi.
