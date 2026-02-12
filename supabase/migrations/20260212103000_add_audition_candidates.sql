ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'audition_candidate';

CREATE TABLE IF NOT EXISTS public.auditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  campus_id UUID REFERENCES public.campuses(id) ON DELETE SET NULL,
  audition_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  stage TEXT NOT NULL DEFAULT 'pre_audition' CHECK (stage IN ('pre_audition', 'audition')),
  candidate_track TEXT NOT NULL DEFAULT 'vocalist' CHECK (candidate_track IN ('vocalist', 'instrumentalist')),
  lead_song TEXT,
  harmony_song TEXT,
  song_one TEXT,
  song_two TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auditions_candidate_date
  ON public.auditions(candidate_id, audition_date);

ALTER TABLE public.auditions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Candidates can view own auditions" ON public.auditions;
CREATE POLICY "Candidates can view own auditions"
ON public.auditions
FOR SELECT
USING (
  auth.uid() = candidate_id
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'campus_admin'::app_role)
  OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'network_worship_leader'::app_role)
);

DROP POLICY IF EXISTS "Leaders can insert auditions" ON public.auditions;
CREATE POLICY "Leaders can insert auditions"
ON public.auditions
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'campus_admin'::app_role)
  OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'network_worship_leader'::app_role)
);

DROP POLICY IF EXISTS "Leaders can update auditions" ON public.auditions;
CREATE POLICY "Leaders can update auditions"
ON public.auditions
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'campus_admin'::app_role)
  OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'network_worship_leader'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'campus_admin'::app_role)
  OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'network_worship_leader'::app_role)
);

DROP POLICY IF EXISTS "Leaders can delete auditions" ON public.auditions;
CREATE POLICY "Leaders can delete auditions"
ON public.auditions
FOR DELETE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'campus_admin'::app_role)
  OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'network_worship_leader'::app_role)
);

DROP TRIGGER IF EXISTS update_auditions_updated_at ON public.auditions;
CREATE TRIGGER update_auditions_updated_at
BEFORE UPDATE ON public.auditions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
