-- ── Devriye Atama Sistemi Migration ────────────────────────────────────────

-- 1) patrol_schedules'a hangi vardiya için olduğunu belirten kolon
ALTER TABLE patrol_schedules ADD COLUMN IF NOT EXISTS shift_code TEXT DEFAULT NULL;

-- 2) Personele özel günlük devriye atama tablosu
CREATE TABLE IF NOT EXISTS patrol_assignments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  personnel_id   UUID NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
  route_id       UUID NOT NULL REFERENCES patrol_routes(id) ON DELETE CASCADE,
  date           DATE NOT NULL,
  scheduled_time TIME NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending',  -- pending | active | completed | missed
  patrol_id      UUID REFERENCES patrols(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(personnel_id, date, scheduled_time)
);

ALTER TABLE patrol_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "patrol_assignments_all" ON patrol_assignments;

CREATE POLICY "patrol_assignments_all" ON patrol_assignments
  FOR ALL USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
