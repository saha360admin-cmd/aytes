-- ── Temizlik Departmanı + Admin Kullanıcı ────────────────────
-- ⚠ ARTIK KULLANILMIYOR — bu dosyayı tekrar çalıştırmayın.
-- Temizlik girişi telefon-bazlı şemaya taşındı (auth email artık
-- {telefon}@aytes.app, temizlik@aytes.com değil). Bu script email'i
-- temizlik@aytes.com üzerinden arayıp bulamayacağı için tekrar
-- çalıştırılırsa YENİ bir "Temizlik Yönetici" kaydı/duplike auth
-- kullanıcısı oluşturur. Auth kullanıcı değişiklikleri için ham SQL
-- değil Supabase Admin API kullanın.
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

  -- 2. Auth kullanıcı — önce var mı kontrol et
  SELECT id INTO v_auth_id FROM auth.users WHERE email = 'temizlik@aytes.com';

  IF v_auth_id IS NULL THEN
    -- Yoksa oluştur
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
      gen_random_uuid(),
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
    ) RETURNING id INTO v_auth_id;
  ELSE
    -- Varsa şifreyi güncelle
    UPDATE auth.users
    SET encrypted_password = crypt('123456', gen_salt('bf')),
        updated_at = now()
    WHERE id = v_auth_id;
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
