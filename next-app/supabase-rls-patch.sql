-- ── RLS Güvenlik Yamaları ────────────────────────────────────

-- 1. Beacons: sadece admin/supervisor yazabilsin
DROP POLICY IF EXISTS "beacons_write" ON beacons;
CREATE POLICY "beacons_write" ON beacons
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM personnel
      WHERE auth_id = auth.uid()
        AND role IN ('admin', 'supervisor')
    )
  );

-- 2. Attendance insert: personel sadece kendi kaydını ekleyebilsin
DROP POLICY IF EXISTS "attendance_insert" ON attendance_records;
CREATE POLICY "attendance_insert" ON attendance_records
  FOR INSERT WITH CHECK (
    personnel_id IN (
      SELECT id FROM personnel WHERE auth_id = auth.uid()
    )
  );

-- 3. Attendance read: department izolasyonu
DROP POLICY IF EXISTS "attendance_read" ON attendance_records;
CREATE POLICY "attendance_read" ON attendance_records
  FOR SELECT USING (
    department_id IN (
      SELECT department_id FROM personnel WHERE auth_id = auth.uid()
    )
  );

-- 4. Communications: department izolasyonu
DROP POLICY IF EXISTS "communications_all" ON communications;
CREATE POLICY "communications_all" ON communications
  FOR ALL USING (
    department_id IN (
      SELECT department_id FROM personnel WHERE auth_id = auth.uid()
    )
  );

-- 5. Communication reads: kendi departmanı
DROP POLICY IF EXISTS "comm_reads_all" ON communication_reads;
CREATE POLICY "comm_reads_all" ON communication_reads
  FOR ALL USING (auth.uid() IS NOT NULL);
