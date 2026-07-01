-- ── Department Bazlı RLS İzolasyonu ──────────────────────────
-- Supabase SQL Editor'de çalıştır

-- Yardımcı fonksiyon: mevcut kullanıcının department_id'si
CREATE OR REPLACE FUNCTION public.auth_dept_id()
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT department_id FROM public.personnel WHERE auth_id = auth.uid() LIMIT 1;
$$;

-- ── 1. PERSONNEL ───────────────────────────────────────────────
DROP POLICY IF EXISTS "personnel_read" ON public.personnel;
DROP POLICY IF EXISTS "personnel_write" ON public.personnel;
DROP POLICY IF EXISTS "personnel_all" ON public.personnel;

CREATE POLICY "personnel_select" ON public.personnel
  FOR SELECT USING (department_id = public.auth_dept_id());

CREATE POLICY "personnel_insert" ON public.personnel
  FOR INSERT WITH CHECK (department_id = public.auth_dept_id());

CREATE POLICY "personnel_update" ON public.personnel
  FOR UPDATE USING (department_id = public.auth_dept_id())
  WITH CHECK (department_id = public.auth_dept_id());

CREATE POLICY "personnel_delete" ON public.personnel
  FOR DELETE USING (
    department_id = public.auth_dept_id()
    AND public.auth_personnel_role() = 'admin'
  );

-- ── 2. PATROLS ─────────────────────────────────────────────────
ALTER TABLE public.patrols ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "patrols_all" ON public.patrols;

CREATE POLICY "patrols_select" ON public.patrols
  FOR SELECT USING (department_id = public.auth_dept_id());

CREATE POLICY "patrols_insert" ON public.patrols
  FOR INSERT WITH CHECK (department_id = public.auth_dept_id());

CREATE POLICY "patrols_update" ON public.patrols
  FOR UPDATE USING (department_id = public.auth_dept_id());

CREATE POLICY "patrols_delete" ON public.patrols
  FOR DELETE USING (department_id = public.auth_dept_id());

-- ── 3. PATROL CHECKPOINTS ──────────────────────────────────────
ALTER TABLE public.patrol_checkpoints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "checkpoints_all" ON public.patrol_checkpoints;

CREATE POLICY "checkpoints_all" ON public.patrol_checkpoints
  FOR ALL USING (
    patrol_id IN (
      SELECT id FROM public.patrols WHERE department_id = public.auth_dept_id()
    )
  );

-- ── 4. PATROL ROUTES ───────────────────────────────────────────
ALTER TABLE public.patrol_routes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "routes_all" ON public.patrol_routes;

CREATE POLICY "routes_all" ON public.patrol_routes
  FOR ALL USING (department_id = public.auth_dept_id());

-- ── 5. PATROL ROUTE POINTS ─────────────────────────────────────
ALTER TABLE public.patrol_route_points ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "route_points_all" ON public.patrol_route_points;

CREATE POLICY "route_points_all" ON public.patrol_route_points
  FOR ALL USING (
    route_id IN (
      SELECT id FROM public.patrol_routes WHERE department_id = public.auth_dept_id()
    )
  );

-- ── 6. PATROL SCHEDULES ────────────────────────────────────────
ALTER TABLE public.patrol_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "schedules_all" ON public.patrol_schedules;

CREATE POLICY "schedules_all" ON public.patrol_schedules
  FOR ALL USING (
    route_id IN (
      SELECT id FROM public.patrol_routes WHERE department_id = public.auth_dept_id()
    )
  );

-- ── 7. PATROL ASSIGNMENTS ──────────────────────────────────────
ALTER TABLE public.patrol_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "patrol_assignments_all" ON public.patrol_assignments;

CREATE POLICY "patrol_assignments_all" ON public.patrol_assignments
  FOR ALL USING (
    personnel_id IN (
      SELECT id FROM public.personnel WHERE department_id = public.auth_dept_id()
    )
  );

-- ── 8. INCIDENTS ───────────────────────────────────────────────
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "incidents_all" ON public.incidents;

CREATE POLICY "incidents_select" ON public.incidents
  FOR SELECT USING (department_id = public.auth_dept_id());

CREATE POLICY "incidents_insert" ON public.incidents
  FOR INSERT WITH CHECK (department_id = public.auth_dept_id());

CREATE POLICY "incidents_update" ON public.incidents
  FOR UPDATE USING (department_id = public.auth_dept_id());

-- ── 9. INCIDENT DEPARTMENTS ────────────────────────────────────
ALTER TABLE public.incident_departments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "incident_departments_all" ON public.incident_departments;

CREATE POLICY "incident_departments_all" ON public.incident_departments
  FOR ALL USING (
    incident_id IN (
      SELECT id FROM public.incidents WHERE department_id = public.auth_dept_id()
    )
  );

-- ── 10. SHIFT ASSIGNMENTS ──────────────────────────────────────
ALTER TABLE public.shift_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shift_assignments_all" ON public.shift_assignments;

CREATE POLICY "shift_assignments_all" ON public.shift_assignments
  FOR ALL USING (department_id = public.auth_dept_id());

-- ── 11. SHIFT TYPES ────────────────────────────────────────────
ALTER TABLE public.shift_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shift_types_all" ON public.shift_types;

CREATE POLICY "shift_types_all" ON public.shift_types
  FOR ALL USING (department_id = public.auth_dept_id());

-- ── 12. REQUESTS ───────────────────────────────────────────────
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "requests_all" ON public.requests;

CREATE POLICY "requests_select" ON public.requests
  FOR SELECT USING (department_id = public.auth_dept_id());

CREATE POLICY "requests_insert" ON public.requests
  FOR INSERT WITH CHECK (department_id = public.auth_dept_id());

CREATE POLICY "requests_update" ON public.requests
  FOR UPDATE USING (department_id = public.auth_dept_id());

-- ── 13. BEACONS ────────────────────────────────────────────────
DROP POLICY IF EXISTS "beacons_read" ON public.beacons;
DROP POLICY IF EXISTS "beacons_write" ON public.beacons;

CREATE POLICY "beacons_read" ON public.beacons
  FOR SELECT USING (department_id = public.auth_dept_id());

CREATE POLICY "beacons_write" ON public.beacons
  FOR ALL USING (
    department_id = public.auth_dept_id()
    AND public.auth_personnel_role() IN ('admin', 'supervisor')
  );

-- ── 14. ATTENDANCE RECORDS ─────────────────────────────────────
DROP POLICY IF EXISTS "attendance_read" ON public.attendance_records;
DROP POLICY IF EXISTS "attendance_insert" ON public.attendance_records;

CREATE POLICY "attendance_read" ON public.attendance_records
  FOR SELECT USING (department_id = public.auth_dept_id());

CREATE POLICY "attendance_insert" ON public.attendance_records
  FOR INSERT WITH CHECK (
    department_id = public.auth_dept_id()
    AND personnel_id IN (SELECT id FROM public.personnel WHERE auth_id = auth.uid())
  );
