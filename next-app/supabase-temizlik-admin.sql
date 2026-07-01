-- ── Temizlik Departmanı + Admin Kullanıcı ────────────────────
-- Supabase SQL Editor'de çalıştır

DO $$
DECLARE
  v_dept_id   UUID;
  v_auth_id   UUID;
BEGIN

  -- 1. Departman oluştur (yoksa)
  INSERT INTO public.departments (name, slug, icon, color)
  VALUES ('Temizlik', 'temizlik', 'cleaning_services', '#4CAF50')
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO v_dept_id FROM public.departments WHERE slug = 'temizlik';

  -- 2. Auth kullanıcı oluştur
  v_auth_id := gen_random_uuid();

  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    role,
    aud
  ) VALUES (
    v_auth_id,
    '00000000-0000-0000-0000-000000000000',
    'temizlik@aytes.com',
    crypt('123456', gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    false,
    'authenticated',
    'authenticated'
  )
  ON CONFLICT (email) DO UPDATE SET
    encrypted_password = crypt('123456', gen_salt('bf')),
    updated_at = now()
  RETURNING id INTO v_auth_id;

  -- email çakışması durumunda mevcut auth_id'yi al
  IF v_auth_id IS NULL THEN
    SELECT id INTO v_auth_id FROM auth.users WHERE email = 'temizlik@aytes.com';
  END IF;

  -- 3. Personnel kaydı oluştur
  INSERT INTO public.personnel (
    auth_id,
    department_id,
    full_name,
    email,
    role,
    status
  ) VALUES (
    v_auth_id,
    v_dept_id,
    'Temizlik Yönetici',
    'temizlik@aytes.com',
    'admin',
    'active'
  )
  ON CONFLICT (auth_id) DO UPDATE SET
    role = 'admin',
    status = 'active';

END $$;
