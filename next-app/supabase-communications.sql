-- ── İletişim Sistemi Migration ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS communications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type         TEXT NOT NULL DEFAULT 'duyuru', -- duyuru | gorev | talimat
  priority     TEXT NOT NULL DEFAULT 'normal', -- normal | urgent
  title        TEXT NOT NULL,
  content      TEXT NOT NULL,
  target_type  TEXT NOT NULL DEFAULT 'all',    -- all | location
  location_id  UUID REFERENCES locations(id) ON DELETE SET NULL,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  created_by   UUID NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS communication_reads (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  communication_id UUID NOT NULL REFERENCES communications(id) ON DELETE CASCADE,
  personnel_id     UUID NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
  read_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(communication_id, personnel_id)
);

ALTER TABLE communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "communications_all" ON communications;
CREATE POLICY "communications_all" ON communications
  FOR ALL USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "communication_reads_all" ON communication_reads;
CREATE POLICY "communication_reads_all" ON communication_reads
  FOR ALL USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
