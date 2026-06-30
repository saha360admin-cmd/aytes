-- patrol_plans: planlı devriye şablonları
CREATE TABLE IF NOT EXISTS public.patrol_plans (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id    uuid NOT NULL REFERENCES public.departments(id),
  name             text NOT NULL,
  start_time       time NOT NULL,
  end_time         time NOT NULL,
  interval_minutes integer NOT NULL DEFAULT 60,
  repeat_type      text NOT NULL DEFAULT 'daily' CHECK (repeat_type IN ('daily','weekly')),
  repeat_days      integer[],  -- ISO weekday: 1=Mon..7=Sun; NULL means daily
  is_active        boolean NOT NULL DEFAULT true,
  created_by       uuid REFERENCES public.personnel(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.patrol_assignments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id       uuid NOT NULL REFERENCES public.patrol_plans(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.departments(id),
  personnel_id  uuid NOT NULL REFERENCES public.personnel(id),
  assigned_date date NOT NULL,
  status        text NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned','started','completed','missed')),
  patrol_id     uuid REFERENCES public.patrols(id),
  assigned_by   uuid REFERENCES public.personnel(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patrol_plans_dept   ON public.patrol_plans(department_id);
CREATE INDEX IF NOT EXISTS idx_patrol_assign_plan  ON public.patrol_assignments(plan_id);
CREATE INDEX IF NOT EXISTS idx_patrol_assign_date  ON public.patrol_assignments(assigned_date);
CREATE INDEX IF NOT EXISTS idx_patrol_assign_pers  ON public.patrol_assignments(personnel_id);

ALTER TABLE public.patrol_plans       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patrol_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "patrol_plans_all"       ON public.patrol_plans;
DROP POLICY IF EXISTS "patrol_assignments_all" ON public.patrol_assignments;
CREATE POLICY "patrol_plans_all"       ON public.patrol_plans       FOR ALL USING (true);
CREATE POLICY "patrol_assignments_all" ON public.patrol_assignments FOR ALL USING (true);

-- reuse set_updated_at() if it exists, else create
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_patrol_plans_upd ON public.patrol_plans;
CREATE TRIGGER trg_patrol_plans_upd BEFORE UPDATE ON public.patrol_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_patrol_assignments_upd ON public.patrol_assignments;
CREATE TRIGGER trg_patrol_assignments_upd BEFORE UPDATE ON public.patrol_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
