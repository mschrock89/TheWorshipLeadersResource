ALTER TABLE public.draft_sets
  ADD COLUMN IF NOT EXISTS custom_service_id UUID REFERENCES public.custom_services(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_draft_sets_custom_service
  ON public.draft_sets(custom_service_id);
