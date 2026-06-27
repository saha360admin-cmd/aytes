-- ============================================================
-- AYTES Güvenlik Migration - Supabase SQL Editor'de çalıştır
-- Mevcut tablolara dokunmaz, sadece eksikleri ekler
-- ============================================================

-- ============================================================
-- 1. KRİTİK FIX: personnel UPDATE privilege escalation
-- ============================================================

DROP POLICY IF EXISTS "Admin can update personnel" ON personnel;

-- Kullanıcı kendi profilini güncelleyebilir ama role/dept değiştiremez
CREATE POLICY "User can update own profile" ON personnel
    FOR UPDATE USING (
        auth_id = auth.uid()
    )
    WITH CHECK (
        auth_id = auth.uid()
        AND role = (SELECT role FROM personnel WHERE auth_id = auth.uid())
        AND department_id = (SELECT department_id FROM personnel WHERE auth_id = auth.uid())
    );

-- Sadece admin başkasını güncelleyebilir
CREATE POLICY "Admin can update other personnel" ON personnel
    FOR UPDATE USING (
        auth_id != auth.uid()
        AND EXISTS (
            SELECT 1 FROM personnel WHERE auth_id = auth.uid() AND role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM personnel WHERE auth_id = auth.uid() AND role = 'admin'
        )
    );

-- ============================================================
-- 2. EKSİK TABLOLAR
-- ============================================================

-- Devriyeler
CREATE TABLE IF NOT EXISTS patrols (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
    personnel_id UUID REFERENCES personnel(id) ON DELETE SET NULL,
    route_name TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
    total_checkpoints INT NOT NULL DEFAULT 0,
    completed_checkpoints INT NOT NULL DEFAULT 0,
    duration_seconds INT,
    started_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Devriye kontrol noktaları
CREATE TABLE IF NOT EXISTS patrol_checkpoints (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    patrol_id UUID REFERENCES patrols(id) ON DELETE CASCADE,
    checkpoint_order INT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed')),
    scanned_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Olaylar
CREATE TABLE IF NOT EXISTS incidents (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
    reported_by UUID REFERENCES personnel(id) ON DELETE SET NULL,
    patrol_id UUID REFERENCES patrols(id) ON DELETE SET NULL,
    type TEXT,
    severity TEXT NOT NULL DEFAULT 'low' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    title TEXT NOT NULL,
    description TEXT,
    location TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'closed')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Talepler
CREATE TABLE IF NOT EXISTS requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    personnel_id UUID REFERENCES personnel(id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    details TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by UUID REFERENCES personnel(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 3. RLS AKTİF ET
-- ============================================================

ALTER TABLE patrols ENABLE ROW LEVEL SECURITY;
ALTER TABLE patrol_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE requests ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. POLİTİKALAR
-- ============================================================

-- Patrols
DROP POLICY IF EXISTS "Patrols viewable by self or admin/supervisor" ON patrols;
CREATE POLICY "Patrols viewable by self or admin/supervisor" ON patrols
    FOR SELECT USING (
        personnel_id = (SELECT id FROM personnel WHERE auth_id = auth.uid())
        OR EXISTS (
            SELECT 1 FROM personnel
            WHERE auth_id = auth.uid()
            AND role IN ('admin', 'supervisor')
            AND department_id = patrols.department_id
        )
    );

DROP POLICY IF EXISTS "Patrols insertable by self" ON patrols;
CREATE POLICY "Patrols insertable by self" ON patrols
    FOR INSERT WITH CHECK (
        personnel_id = (SELECT id FROM personnel WHERE auth_id = auth.uid())
        AND department_id = (SELECT department_id FROM personnel WHERE auth_id = auth.uid())
    );

DROP POLICY IF EXISTS "Patrols updatable by self" ON patrols;
CREATE POLICY "Patrols updatable by self" ON patrols
    FOR UPDATE USING (
        personnel_id = (SELECT id FROM personnel WHERE auth_id = auth.uid())
    )
    WITH CHECK (
        personnel_id = (SELECT id FROM personnel WHERE auth_id = auth.uid())
    );

-- Patrol Checkpoints
DROP POLICY IF EXISTS "Patrol checkpoints viewable via own patrol" ON patrol_checkpoints;
CREATE POLICY "Patrol checkpoints viewable via own patrol" ON patrol_checkpoints
    FOR SELECT USING (
        patrol_id IN (
            SELECT id FROM patrols
            WHERE personnel_id = (SELECT id FROM personnel WHERE auth_id = auth.uid())
        )
        OR EXISTS (
            SELECT 1 FROM personnel
            WHERE auth_id = auth.uid() AND role IN ('admin', 'supervisor')
        )
    );

DROP POLICY IF EXISTS "Patrol checkpoints updatable by patrol owner" ON patrol_checkpoints;
CREATE POLICY "Patrol checkpoints updatable by patrol owner" ON patrol_checkpoints
    FOR UPDATE USING (
        patrol_id IN (
            SELECT id FROM patrols
            WHERE personnel_id = (SELECT id FROM personnel WHERE auth_id = auth.uid())
        )
    )
    WITH CHECK (
        patrol_id IN (
            SELECT id FROM patrols
            WHERE personnel_id = (SELECT id FROM personnel WHERE auth_id = auth.uid())
        )
    );

-- Incidents
DROP POLICY IF EXISTS "Incidents viewable by department" ON incidents;
CREATE POLICY "Incidents viewable by department" ON incidents
    FOR SELECT USING (
        department_id = (SELECT department_id FROM personnel WHERE auth_id = auth.uid())
    );

DROP POLICY IF EXISTS "Incidents insertable by own department only" ON incidents;
CREATE POLICY "Incidents insertable by own department only" ON incidents
    FOR INSERT WITH CHECK (
        reported_by = (SELECT id FROM personnel WHERE auth_id = auth.uid())
        AND department_id = (SELECT department_id FROM personnel WHERE auth_id = auth.uid())
    );

DROP POLICY IF EXISTS "Incidents updatable by admin/supervisor" ON incidents;
CREATE POLICY "Incidents updatable by admin/supervisor" ON incidents
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM personnel
            WHERE auth_id = auth.uid()
            AND role IN ('admin', 'supervisor')
            AND department_id = incidents.department_id
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM personnel
            WHERE auth_id = auth.uid()
            AND role IN ('admin', 'supervisor')
            AND department_id = incidents.department_id
        )
    );

-- Requests
DROP POLICY IF EXISTS "Requests viewable by self or admin/supervisor" ON requests;
CREATE POLICY "Requests viewable by self or admin/supervisor" ON requests
    FOR SELECT USING (
        personnel_id = (SELECT id FROM personnel WHERE auth_id = auth.uid())
        OR EXISTS (
            SELECT 1 FROM personnel
            WHERE auth_id = auth.uid()
            AND role IN ('admin', 'supervisor')
            AND department_id = requests.department_id
        )
    );

DROP POLICY IF EXISTS "Requests insertable by self in own department" ON requests;
CREATE POLICY "Requests insertable by self in own department" ON requests
    FOR INSERT WITH CHECK (
        personnel_id = (SELECT id FROM personnel WHERE auth_id = auth.uid())
        AND department_id = (SELECT department_id FROM personnel WHERE auth_id = auth.uid())
    );

DROP POLICY IF EXISTS "Requests updatable by admin/supervisor only" ON requests;
CREATE POLICY "Requests updatable by admin/supervisor only" ON requests
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM personnel
            WHERE auth_id = auth.uid()
            AND role IN ('admin', 'supervisor')
            AND department_id = requests.department_id
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM personnel
            WHERE auth_id = auth.uid()
            AND role IN ('admin', 'supervisor')
            AND department_id = requests.department_id
        )
    );

-- ============================================================
-- 5. UPDATED_AT TRİGGERLARI (fonksiyon zaten mevcut)
-- ============================================================

DROP TRIGGER IF EXISTS incidents_updated_at ON incidents;
CREATE TRIGGER incidents_updated_at
    BEFORE UPDATE ON incidents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS requests_updated_at ON requests;
CREATE TRIGGER requests_updated_at
    BEFORE UPDATE ON requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
