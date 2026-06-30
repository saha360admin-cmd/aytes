-- ============================================================
-- Lokasyon Hedef Güvenlik Sayısı
-- Supabase SQL Editor'de çalıştır
-- ============================================================

ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS target_count integer NOT NULL DEFAULT 0;

UPDATE public.locations SET target_count = CASE name
  WHEN 'Ataşehir Trafo Merkezi'                              THEN 4
  WHEN 'Beykoz Operasyon Merkezi'                            THEN 4
  WHEN 'Erenköy Operasyon Merkezi'                           THEN 5
  WHEN 'Genel Müdürlük'                                      THEN 20
  WHEN 'Istanbul Anadolu Yakasi Elektrik Dagitim Dudullu'    THEN 8
  WHEN 'Kadıköy Operasyon Merkezi'                           THEN 4
  WHEN 'Karadeniz (Sancaktepe) Dagitim Op. Bolge Md.'        THEN 9
  WHEN 'Kurtköy Operasyon Merkezi'                           THEN 4
  WHEN 'Marmara (Kartal) Dagitim Op. Bolge Md.'              THEN 8
  WHEN 'Pendik LHM'                                          THEN 7
  WHEN 'SCADA Operasyon Kontrol Merkezi'                     THEN 4
  WHEN 'Şile Merkez Operasyon Müdürlügü'                     THEN 1
  WHEN 'Şile Ova Indirici Merkezi'                           THEN 4
  WHEN 'Tuzla-Pendik Operasyon Merkezi (Tavşantepe)'         THEN 4
  WHEN 'Ümraniye Operasyon Merkezi'                          THEN 5
  WHEN 'Üsküdar Operasyon Merkezi'                           THEN 4
  WHEN 'Vaniköy Operasyon Merkezi'                           THEN 4
  WHEN 'Yunus Eğitim Merkezi'                                THEN 4
  ELSE 0
END;

-- Doğrulama
SELECT name, target_count FROM public.locations ORDER BY name;
