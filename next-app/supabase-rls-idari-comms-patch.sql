-- ── İdari İşler yöneticisi çok-departmanlı duyuru yetkisi ──────
-- Supabase SQL Editor'de çalıştır
--
-- supabase-rls-dept-patch.sql, communications tablosunu department_id = auth_dept_id()
-- ile kilitlemişti (her yönetici yalnızca kendi departmanına yazabilir/okuyabilir).
-- İdari İşler yöneticisinin Güvenlik/Teknik/Temizlik'e duyuru göndermesi bu yüzden
-- 403 (RLS) hatası veriyor. Bu patch, İdari İşler departmanındaki kullanıcılara
-- tüm departmanlar için communications + communication_reads erişimi tanır;
-- diğer departmanlar için davranış değişmez (yine yalnızca kendi departmanları).

CREATE OR REPLACE FUNCTION public.auth_is_idari()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.personnel p
    JOIN public.departments d ON d.id = p.department_id
    WHERE p.auth_id = auth.uid() AND d.slug = 'idari'
  );
$$;

-- communications: İdari İşler her departmana yazabilir/okuyabilir
DROP POLICY IF EXISTS "communications_all" ON public.communications;
CREATE POLICY "communications_all" ON public.communications
  FOR ALL USING (
    department_id = public.auth_dept_id() OR public.auth_is_idari()
  )
  WITH CHECK (
    department_id = public.auth_dept_id() OR public.auth_is_idari()
  );

-- communication_reads: İdari İşler diğer departmanların okuma durumunu görebilir
DROP POLICY IF EXISTS "comm_reads_all" ON public.communication_reads;
CREATE POLICY "comm_reads_all" ON public.communication_reads
  FOR ALL USING (
    communication_id IN (
      SELECT id FROM public.communications
      WHERE department_id = public.auth_dept_id() OR public.auth_is_idari()
    )
  ) WITH CHECK (
    communication_id IN (
      SELECT id FROM public.communications WHERE department_id = public.auth_dept_id()
    )
    AND personnel_id = (SELECT id FROM public.personnel WHERE auth_id = auth.uid() LIMIT 1)
  );
