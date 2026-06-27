-- AYTES Personel Yönetim Sistemi - Supabase Şeması
-- Bu SQL'i Supabase Dashboard > SQL Editor'de çalıştırın

-- Departmanlar tablosu
CREATE TABLE departments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    icon TEXT NOT NULL DEFAULT 'business',
    color TEXT NOT NULL DEFAULT '#0058be',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Varsayılan departmanlar
INSERT INTO departments (name, slug, icon, color) VALUES
    ('İdari İşler', 'idari', 'admin_panel_settings', '#0058be'),
    ('Güvenlik', 'guvenlik', 'security', '#006c49'),
    ('Teknik', 'teknik', 'engineering', '#825100'),
    ('Temizlik', 'temizlik', 'cleaning_services', '#004191');

-- Personel tablosu
CREATE TABLE personnel (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    auth_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    full_name TEXT NOT NULL,
    tc_no TEXT UNIQUE,
    phone TEXT,
    email TEXT,
    role TEXT NOT NULL DEFAULT 'personel' CHECK (role IN ('admin', 'supervisor', 'personel')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'on_leave')),
    avatar_url TEXT,
    position TEXT,
    location TEXT,
    hired_at DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Vardiyalar tablosu
CREATE TABLE shifts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Varsayılan vardiyalar
INSERT INTO shifts (department_id, name, start_time, end_time)
SELECT d.id, s.name, s.start_time::TIME, s.end_time::TIME
FROM departments d
CROSS JOIN (VALUES
    ('Sabah Vardiyası', '08:00', '16:00'),
    ('Akşam Vardiyası', '16:00', '00:00'),
    ('Gece Vardiyası', '00:00', '08:00')
) AS s(name, start_time, end_time)
WHERE d.slug = 'guvenlik';

-- Devam/yoklama tablosu
CREATE TABLE attendance (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    personnel_id UUID REFERENCES personnel(id) ON DELETE CASCADE,
    shift_id UUID REFERENCES shifts(id) ON DELETE SET NULL,
    check_in TIMESTAMPTZ,
    check_out TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'absent', 'late', 'on_leave', 'excused')),
    note TEXT,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Görevler tablosu
CREATE TABLE tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
    assigned_to UUID REFERENCES personnel(id) ON DELETE SET NULL,
    created_by UUID REFERENCES personnel(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    due_date DATE,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Duyurular tablosu
CREATE TABLE announcements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
    created_by UUID REFERENCES personnel(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    is_pinned BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Lokasyonlar / Bölgeler tablosu
CREATE TABLE locations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Mevcut tabloya kolon eklemek için (tablo zaten varsa)
-- ALTER TABLE personnel ADD COLUMN IF NOT EXISTS position TEXT;
-- ALTER TABLE personnel ADD COLUMN IF NOT EXISTS location TEXT;

-- Row Level Security (RLS)
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE personnel ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

-- Herkes departmanları görebilir
CREATE POLICY "Departments are viewable by everyone" ON departments
    FOR SELECT USING (true);

-- Personel kendi bilgilerini görebilir, admin herşeyi görebilir
CREATE POLICY "Personnel viewable by own department" ON personnel
    FOR SELECT USING (
        auth.uid() = auth_id
        OR department_id IN (
            SELECT department_id FROM personnel WHERE auth_id = auth.uid() AND role = 'admin'
        )
    );

-- Vardiyalar departman bazlı
CREATE POLICY "Shifts viewable by department" ON shifts
    FOR SELECT USING (
        department_id IN (
            SELECT department_id FROM personnel WHERE auth_id = auth.uid()
        )
    );

-- Yoklama kayıtları
CREATE POLICY "Attendance viewable by department" ON attendance
    FOR SELECT USING (
        personnel_id IN (
            SELECT id FROM personnel WHERE auth_id = auth.uid()
        )
        OR personnel_id IN (
            SELECT p2.id FROM personnel p1
            JOIN personnel p2 ON p1.department_id = p2.department_id
            WHERE p1.auth_id = auth.uid() AND p1.role IN ('admin', 'supervisor')
        )
    );

-- Görevler departman bazlı
CREATE POLICY "Tasks viewable by department" ON tasks
    FOR SELECT USING (
        department_id IN (
            SELECT department_id FROM personnel WHERE auth_id = auth.uid()
        )
    );

-- Duyurular departman bazlı
CREATE POLICY "Announcements viewable by department" ON announcements
    FOR SELECT USING (
        department_id IN (
            SELECT department_id FROM personnel WHERE auth_id = auth.uid()
        )
    );

-- Lokasyonlar departman bazlı
CREATE POLICY "Locations viewable by department" ON locations
    FOR SELECT USING (
        department_id IN (
            SELECT department_id FROM personnel WHERE auth_id = auth.uid()
        )
    );

-- INSERT politikaları
CREATE POLICY "Admin can insert personnel" ON personnel
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM personnel WHERE auth_id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admin/Supervisor can insert attendance" ON attendance
    FOR INSERT WITH CHECK (
        personnel_id = (SELECT id FROM personnel WHERE auth_id = auth.uid())
        OR EXISTS (
            SELECT 1 FROM personnel WHERE auth_id = auth.uid() AND role IN ('admin', 'supervisor')
        )
    );

CREATE POLICY "Admin/Supervisor can insert tasks" ON tasks
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM personnel WHERE auth_id = auth.uid() AND role IN ('admin', 'supervisor')
        )
    );

CREATE POLICY "Admin/Supervisor can insert announcements" ON announcements
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM personnel WHERE auth_id = auth.uid() AND role IN ('admin', 'supervisor')
        )
    );

-- UPDATE politikaları

-- Kullanıcı kendi profilini güncelleyebilir ANCAK role/department_id/auth_id değiştiremez
CREATE POLICY "User can update own profile" ON personnel
    FOR UPDATE USING (
        auth_id = auth.uid()
    )
    WITH CHECK (
        auth_id = auth.uid()
        AND role = (SELECT role FROM personnel WHERE auth_id = auth.uid())
        AND department_id = (SELECT department_id FROM personnel WHERE auth_id = auth.uid())
    );

-- Sadece admin başkasını güncelleyebilir (kendi kaydı hariç, yukarıdaki policy kapsar)
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

CREATE POLICY "Tasks updatable by assignee or admin" ON tasks
    FOR UPDATE USING (
        assigned_to = (SELECT id FROM personnel WHERE auth_id = auth.uid())
        OR EXISTS (
            SELECT 1 FROM personnel WHERE auth_id = auth.uid() AND role IN ('admin', 'supervisor')
        )
    );

-- ============================================================
-- EKSİK TABLOLAR (kodda kullanılıyor, schema'da yoktu)
-- ============================================================

-- Devriyeler tablosu
CREATE TABLE patrols (
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
CREATE TABLE patrol_checkpoints (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    patrol_id UUID REFERENCES patrols(id) ON DELETE CASCADE,
    checkpoint_order INT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed')),
    scanned_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Olaylar tablosu
CREATE TABLE incidents (
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

-- Talepler tablosu
CREATE TABLE requests (
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

-- RLS aktif et
ALTER TABLE patrols ENABLE ROW LEVEL SECURITY;
ALTER TABLE patrol_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE requests ENABLE ROW LEVEL SECURITY;

-- Patrols politikaları
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

CREATE POLICY "Patrols insertable by self" ON patrols
    FOR INSERT WITH CHECK (
        personnel_id = (SELECT id FROM personnel WHERE auth_id = auth.uid())
        AND department_id = (SELECT department_id FROM personnel WHERE auth_id = auth.uid())
    );

CREATE POLICY "Patrols updatable by self" ON patrols
    FOR UPDATE USING (
        personnel_id = (SELECT id FROM personnel WHERE auth_id = auth.uid())
    )
    WITH CHECK (
        personnel_id = (SELECT id FROM personnel WHERE auth_id = auth.uid())
    );

-- Patrol checkpoints politikaları
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

-- Incidents politikaları
CREATE POLICY "Incidents viewable by department" ON incidents
    FOR SELECT USING (
        department_id = (SELECT department_id FROM personnel WHERE auth_id = auth.uid())
    );

CREATE POLICY "Incidents insertable by own department only" ON incidents
    FOR INSERT WITH CHECK (
        reported_by = (SELECT id FROM personnel WHERE auth_id = auth.uid())
        AND department_id = (SELECT department_id FROM personnel WHERE auth_id = auth.uid())
    );

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

-- Requests politikaları
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

CREATE POLICY "Requests insertable by self in own department" ON requests
    FOR INSERT WITH CHECK (
        personnel_id = (SELECT id FROM personnel WHERE auth_id = auth.uid())
        AND department_id = (SELECT department_id FROM personnel WHERE auth_id = auth.uid())
    );

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

-- incidents ve requests için updated_at trigger
CREATE TRIGGER incidents_updated_at
    BEFORE UPDATE ON incidents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER requests_updated_at
    BEFORE UPDATE ON requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================

-- updated_at otomatik güncelleme
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER personnel_updated_at
    BEFORE UPDATE ON personnel
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tasks_updated_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
