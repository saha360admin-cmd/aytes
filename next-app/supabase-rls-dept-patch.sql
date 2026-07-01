-- ── RLS Düzeltme Yaması ────────────────────────────────────────
-- shift_assignments tablosunun department_id kolonu yok;
-- izolasyon personnel_id → personnel.department_id üzerinden yapılır.
-- Diğer eksik politikalar da burada tamamlanır.
-- Supabase SQL Editor'de çalıştır

-- ── SHIFT ASSIGNMENTS (department_id kolonu YOK) ───────────────
ALTER TABLE public.shift_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shift_assignments_all" ON public.shift_assignments;

CREATE POLICY "shift_assignments_all" ON public.shift_assignments
  FOR ALL USING (
    personnel_id IN (
      SELECT id FROM public.personnel WHERE department_id = public.auth_dept_id()
    )
  );

-- ── SHIFT TYPES ────────────────────────────────────────────────
ALTER TABLE public.shift_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shift_types_all" ON public.shift_types;

CREATE POLICY "shift_types_all" ON public.shift_types
  FOR ALL USING (department_id = public.auth_dept_id());

-- ── REQUESTS ──────────────────────────────────────────────────
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "requests_all" ON public.requests;
DROP POLICY IF EXISTS "requests_select" ON public.requests;
DROP POLICY IF EXISTS "requests_insert" ON public.requests;
DROP POLICY IF EXISTS "requests_update" ON public.requests;

CREATE POLICY "requests_all" ON public.requests
  FOR ALL USING (department_id = public.auth_dept_id());

-- ── COMMUNICATIONS (department_id var, policy yenile) ──────────
DROP POLICY IF EXISTS "communications_all" ON public.communications;

CREATE POLICY "communications_all" ON public.communications
  FOR ALL USING (department_id = public.auth_dept_id())
  WITH CHECK (department_id = public.auth_dept_id());

-- ── COMMUNICATION READS (personnel_id üzerinden) ──────────────
DROP POLICY IF EXISTS "comm_reads_all" ON public.communication_reads;
DROP POLICY IF EXISTS "communication_reads_all" ON public.communication_reads;

CREATE POLICY "comm_reads_all" ON public.communication_reads
  FOR ALL USING (
    communication_id IN (
      SELECT id FROM public.communications WHERE department_id = public.auth_dept_id()
    )
  );
