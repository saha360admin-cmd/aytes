-- ============================================================
-- PHASE 4: Taşeron Arıza/Destek Takip Sistemi
-- Supabase SQL Editor'de çalıştır
-- ============================================================

CREATE TABLE IF NOT EXISTS public.service_requests (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id         uuid REFERENCES public.incidents(id) ON DELETE SET NULL,
  department_id       uuid NOT NULL REFERENCES public.departments(id),
  contractor_name     text NOT NULL,
  contractor_ticket_no text,
  description         text NOT NULL,
  location_detail     text,
  status              text NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'in_progress', 'resolved', 'cancelled')),
  opened_at           timestamptz NOT NULL DEFAULT now(),
  resolved_at         timestamptz,
  created_by          uuid REFERENCES public.personnel(id),
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Index'ler
CREATE INDEX IF NOT EXISTS idx_service_requests_status        ON public.service_requests(status);
CREATE INDEX IF NOT EXISTS idx_service_requests_department_id ON public.service_requests(department_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_incident_id   ON public.service_requests(incident_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_opened_at     ON public.service_requests(opened_at DESC);

-- updated_at otomatik güncelleme trigger'ı
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_service_requests_updated_at ON public.service_requests;
CREATE TRIGGER trg_service_requests_updated_at
  BEFORE UPDATE ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS (şimdilik açık — production öncesi daraltılacak)
ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_requests_all" ON public.service_requests;
CREATE POLICY "service_requests_all"
  ON public.service_requests
  FOR ALL
  USING (true)
  WITH CHECK (true);
