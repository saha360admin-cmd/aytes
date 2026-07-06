-- ── Acil Durum (Panik Butonu) MVP ─────────────────────────────
-- Supabase SQL Editor'de çalıştır
-- Not: Gerçek sunucu-taraflı otomatik eskalasyon (5 dk push/SMS) YOK,
-- bu tablo yalnızca kayıt + Supabase Realtime ile anlık görünürlük
-- sağlar. "Yanıtsız" durumu istemci tarafında okuma anında hesaplanır.

CREATE TABLE IF NOT EXISTS emergency_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID REFERENCES departments(id) NOT NULL,
  personnel_id UUID REFERENCES personnel(id) NOT NULL,
  location_id UUID REFERENCES locations(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'closed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  acknowledged_by UUID REFERENCES personnel(id),
  acknowledged_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ
);

-- RLS: kendi departmanı + İdari İşler her departmanı görebilir
-- (auth_is_idari() zaten supabase-rls-idari-comms-patch.sql'de tanımlı)
ALTER TABLE emergency_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "emergency_alerts_all" ON emergency_alerts;
CREATE POLICY "emergency_alerts_all" ON emergency_alerts
  FOR ALL USING (
    department_id = public.auth_dept_id() OR public.auth_is_idari()
  )
  WITH CHECK (
    department_id = public.auth_dept_id() OR public.auth_is_idari()
  );

-- ── Realtime ───────────────────────────────────────────────────────
-- Bu tabloda anlık (Realtime) değişiklik yayını için Supabase Dashboard
-- > Database > Replication üzerinden "emergency_alerts" tablosunu
-- açık olan publication'a (genellikle supabase_realtime) manuel eklemeniz
-- gerekiyor. Alternatif olarak burada da yapılabilir:
-- ALTER PUBLICATION supabase_realtime ADD TABLE emergency_alerts;
