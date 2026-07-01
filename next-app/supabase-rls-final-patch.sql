-- ── RLS Final Düzeltmeleri ─────────────────────────────────────
-- Supabase SQL Editor'de çalıştır

-- ── 1. SERVICE_REQUESTS — department izolasyonu ekle ──────────
DROP POLICY IF EXISTS "sr_select"  ON public.service_requests;
DROP POLICY IF EXISTS "sr_insert"  ON public.service_requests;
DROP POLICY IF EXISTS "sr_update"  ON public.service_requests;
DROP POLICY IF EXISTS "sr_delete"  ON public.service_requests;

CREATE POLICY "sr_select" ON public.service_requests
  FOR SELECT USING (
    public.auth_personnel_role() IN ('admin', 'supervisor')
    AND department_id = public.auth_dept_id()
  );

CREATE POLICY "sr_insert" ON public.service_requests
  FOR INSERT WITH CHECK (
    public.auth_personnel_role() IN ('admin', 'supervisor')
    AND department_id = public.auth_dept_id()
  );

CREATE POLICY "sr_update" ON public.service_requests
  FOR UPDATE USING (
    public.auth_personnel_role() IN ('admin', 'supervisor')
    AND department_id = public.auth_dept_id()
  ) WITH CHECK (
    public.auth_personnel_role() IN ('admin', 'supervisor')
    AND department_id = public.auth_dept_id()
  );

CREATE POLICY "sr_delete" ON public.service_requests
  FOR DELETE USING (
    public.auth_personnel_role() = 'admin'
    AND department_id = public.auth_dept_id()
  );

-- ── 2. INCIDENT_DEPARTMENTS — çok-birimli olay erişimi ────────
-- Hem raporlayan hem atanan departman kendi satırlarını görebilir
DROP POLICY IF EXISTS "incident_departments_all" ON public.incident_departments;

CREATE POLICY "incident_departments_all" ON public.incident_departments
  FOR ALL USING (
    department_id = public.auth_dept_id()
    OR incident_id IN (
      SELECT id FROM public.incidents WHERE department_id = public.auth_dept_id()
    )
  );

-- ── 3. COMMUNICATION_READS — personnel_id doğrulaması ─────────
DROP POLICY IF EXISTS "comm_reads_all"           ON public.communication_reads;
DROP POLICY IF EXISTS "communication_reads_all"  ON public.communication_reads;

CREATE POLICY "comm_reads_all" ON public.communication_reads
  FOR ALL USING (
    communication_id IN (
      SELECT id FROM public.communications WHERE department_id = public.auth_dept_id()
    )
  ) WITH CHECK (
    communication_id IN (
      SELECT id FROM public.communications WHERE department_id = public.auth_dept_id()
    )
    AND personnel_id = (SELECT id FROM public.personnel WHERE auth_id = auth.uid() LIMIT 1)
  );
