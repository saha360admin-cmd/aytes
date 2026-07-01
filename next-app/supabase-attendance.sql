-- ── Beacon Tanımları ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS beacons (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
  location_id   UUID REFERENCES locations(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  uuid          TEXT NOT NULL,
  major         INTEGER DEFAULT 0,
  minor         INTEGER DEFAULT 0,
  min_rssi      INTEGER DEFAULT -80,
  active        BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(department_id, uuid)
);

-- ── Giriş/Çıkış Kayıtları ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance_records (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  personnel_id  UUID NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  location_id   UUID REFERENCES locations(id) ON DELETE SET NULL,
  type          TEXT NOT NULL CHECK (type IN ('entry', 'exit')),
  beacon_uuid   TEXT,
  rssi          INTEGER,
  verified      BOOLEAN DEFAULT false,
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attendance_personnel_date
  ON attendance_records (personnel_id, recorded_at);

CREATE INDEX IF NOT EXISTS idx_attendance_dept_date
  ON attendance_records (department_id, recorded_at);

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE beacons ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;

-- Beacons: herkes okuyabilir, admin yazabilir
CREATE POLICY "beacons_read" ON beacons
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "beacons_write" ON beacons
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Attendance: herkes kendi kaydını ekleyebilir, okuyabilir
CREATE POLICY "attendance_read" ON attendance_records
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "attendance_insert" ON attendance_records
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
