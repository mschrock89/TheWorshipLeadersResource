-- Create songs table to store song library
CREATE TABLE public.songs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pco_song_id TEXT UNIQUE,
  title TEXT NOT NULL,
  author TEXT,
  ccli_number TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create service_plans table to store PCO plans
CREATE TABLE public.service_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pco_plan_id TEXT UNIQUE NOT NULL,
  campus_id UUID REFERENCES public.campuses(id),
  service_type_name TEXT NOT NULL,
  plan_date DATE NOT NULL,
  plan_title TEXT,
  synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create plan_songs junction table to track songs in each plan
CREATE TABLE public.plan_songs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id UUID NOT NULL REFERENCES public.service_plans(id) ON DELETE CASCADE,
  song_id UUID NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
  sequence_order INTEGER NOT NULL DEFAULT 0,
  song_key TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(plan_id, song_id, sequence_order)
);

-- Create indexes for performance
CREATE INDEX idx_songs_title ON public.songs(title);
CREATE INDEX idx_songs_pco_id ON public.songs(pco_song_id);
CREATE INDEX idx_service_plans_date ON public.service_plans(plan_date);
CREATE INDEX idx_service_plans_campus ON public.service_plans(campus_id);
CREATE INDEX idx_plan_songs_plan ON public.plan_songs(plan_id);
CREATE INDEX idx_plan_songs_song ON public.plan_songs(song_id);

-- Enable RLS
ALTER TABLE public.songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_songs ENABLE ROW LEVEL SECURITY;

-- RLS for songs - all authenticated users can view, admins/pastors can manage
CREATE POLICY "Authenticated users can view songs"
  ON public.songs FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins and pastors can manage songs"
  ON public.songs FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'student_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'campus_admin'::app_role)
  );

-- RLS for service_plans - view based on campus, admins/pastors can manage
CREATE POLICY "Users can view plans for their campuses"
  ON public.service_plans FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    campus_id IS NULL OR
    campus_id IN (SELECT campus_id FROM user_campuses WHERE user_id = auth.uid())
  );

CREATE POLICY "Admins and pastors can manage service plans"
  ON public.service_plans FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'student_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'campus_admin'::app_role)
  );

-- RLS for plan_songs - follows plan access
CREATE POLICY "Users can view plan songs for accessible plans"
  ON public.plan_songs FOR SELECT
  USING (
    plan_id IN (
      SELECT id FROM service_plans WHERE
        has_role(auth.uid(), 'admin'::app_role) OR
        campus_id IS NULL OR
        campus_id IN (SELECT campus_id FROM user_campuses WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Admins and pastors can manage plan songs"
  ON public.plan_songs FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'student_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'campus_admin'::app_role)
  );

-- Trigger for updated_at on songs
CREATE TRIGGER update_songs_updated_at
  BEFORE UPDATE ON public.songs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();