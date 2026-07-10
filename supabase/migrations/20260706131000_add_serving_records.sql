-- My Church Resource hub foundation, part 2: serving records.
--
-- One uniform shape every ministry writes its serving/attendance counts into,
-- so the hub dashboard is a single aggregation instead of a per-ministry
-- special case. category distinguishes count types within a service
-- ('servers' for volunteers on duty; ministries can add e.g. 'attendance').

CREATE TABLE public.serving_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ministry_key TEXT NOT NULL REFERENCES public.ministries(key) ON DELETE RESTRICT,
  campus_id UUID NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  service_date DATE NOT NULL,
  category TEXT NOT NULL DEFAULT 'servers',
  count INTEGER NOT NULL CHECK (count >= 0),
  recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ministry_key, campus_id, service_date, category)
);

CREATE INDEX idx_serving_records_ministry_date
  ON public.serving_records (ministry_key, service_date);
CREATE INDEX idx_serving_records_campus_date
  ON public.serving_records (campus_id, service_date);

CREATE TRIGGER update_serving_records_updated_at
  BEFORE UPDATE ON public.serving_records
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.serving_records ENABLE ROW LEVEL SECURITY;

-- Dashboard-facing data: readable and writable by that ministry's leaders
-- (and org admins, via user_leads_ministry's admin pass-through). Regular
-- members don't see counts, which keeps ministries siloed from each other.
CREATE POLICY "Ministry leaders can view serving records"
  ON public.serving_records FOR SELECT
  TO authenticated
  USING (public.user_leads_ministry(auth.uid(), ministry_key));

CREATE POLICY "Ministry leaders can insert serving records"
  ON public.serving_records FOR INSERT
  TO authenticated
  WITH CHECK (public.user_leads_ministry(auth.uid(), ministry_key));

CREATE POLICY "Ministry leaders can update serving records"
  ON public.serving_records FOR UPDATE
  TO authenticated
  USING (public.user_leads_ministry(auth.uid(), ministry_key))
  WITH CHECK (public.user_leads_ministry(auth.uid(), ministry_key));

CREATE POLICY "Ministry leaders can delete serving records"
  ON public.serving_records FOR DELETE
  TO authenticated
  USING (public.user_leads_ministry(auth.uid(), ministry_key));
