-- ── Temizlik Birimi — Program Yönetimi + Kontrol Listesi (Faz 1) ──────
-- Supabase SQL Editor'de çalıştır
-- Not: Mevcut Kat Kontrolü (patrol_*) tablolarına dokunulmadı, bu tamamen
-- ayrı bir tablo seti (sabit lokasyon + alan bazlı fotoğraflı kontrol listesi).

-- Lokasyon başına tanımlı temizlik alanları (Tuvalet/Mutfak fotoğraf zorunlu)
CREATE TABLE IF NOT EXISTS cleaning_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID REFERENCES locations(id) NOT NULL,
  name TEXT NOT NULL,
  requires_photo BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tekrarlı program tanımı (yönetici tarafından kurulur)
CREATE TABLE IF NOT EXISTS cleaning_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID REFERENCES departments(id) NOT NULL,
  location_id UUID REFERENCES locations(id) NOT NULL,
  personnel_id UUID REFERENCES personnel(id),
  recurrence_type TEXT NOT NULL DEFAULT 'daily' CHECK (recurrence_type IN ('daily', 'weekly')),
  days_of_week INT[],
  shift_code TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Günlük somut kontrol listesi (programdan türer)
CREATE TABLE IF NOT EXISTS cleaning_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID REFERENCES cleaning_programs(id),
  department_id UUID REFERENCES departments(id) NOT NULL,
  location_id UUID REFERENCES locations(id) NOT NULL,
  personnel_id UUID REFERENCES personnel(id),
  date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(location_id, date)
);

-- Her alan için tamamlanma durumu + fotoğraf
CREATE TABLE IF NOT EXISTS cleaning_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id UUID REFERENCES cleaning_checklists(id) NOT NULL,
  area_id UUID REFERENCES cleaning_areas(id) NOT NULL,
  status TEXT NOT NULL DEFAULT 'devam_ediyor' CHECK (status IN ('tamamlandı', 'devam_ediyor', 'tamamlanmadı', 'atlandı')),
  photo_url TEXT,
  completed_at TIMESTAMPTZ,
  notes TEXT
);

-- ── RLS — mevcut auth_dept_id() deseniyle departman izolasyonu ──────
ALTER TABLE cleaning_areas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cleaning_areas_all" ON cleaning_areas;
CREATE POLICY "cleaning_areas_all" ON cleaning_areas
  FOR ALL USING (location_id IN (SELECT id FROM locations WHERE department_id = public.auth_dept_id()));

ALTER TABLE cleaning_programs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cleaning_programs_all" ON cleaning_programs;
CREATE POLICY "cleaning_programs_all" ON cleaning_programs
  FOR ALL USING (department_id = public.auth_dept_id());

ALTER TABLE cleaning_checklists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cleaning_checklists_all" ON cleaning_checklists;
CREATE POLICY "cleaning_checklists_all" ON cleaning_checklists
  FOR ALL USING (department_id = public.auth_dept_id());

ALTER TABLE cleaning_checklist_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cleaning_checklist_items_all" ON cleaning_checklist_items;
CREATE POLICY "cleaning_checklist_items_all" ON cleaning_checklist_items
  FOR ALL USING (checklist_id IN (
    SELECT id FROM cleaning_checklists WHERE department_id = public.auth_dept_id()
  ));

-- ── Storage ──────────────────────────────────────────────────────────
-- "incident-photos" / "incident-videos" bucket'ları gibi bu da Supabase
-- Dashboard > Storage üzerinden manuel oluşturulmalı (public bucket):
--   Bucket adı: cleaning-checklist-photos
