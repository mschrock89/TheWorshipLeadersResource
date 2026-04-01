CREATE TABLE IF NOT EXISTS public.user_serving_requirements (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  following_jesus boolean NOT NULL DEFAULT false,
  serves_somewhere_else boolean NOT NULL DEFAULT false,
  attended_six_months boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_serving_requirements_user_id
  ON public.user_serving_requirements(user_id);

DROP TRIGGER IF EXISTS trg_user_serving_requirements_updated_at ON public.user_serving_requirements;
CREATE TRIGGER trg_user_serving_requirements_updated_at
BEFORE UPDATE ON public.user_serving_requirements
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.user_serving_requirements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own serving requirements" ON public.user_serving_requirements;
CREATE POLICY "Users can view own serving requirements"
ON public.user_serving_requirements
FOR SELECT
USING (
  auth.uid() = user_id
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'campus_admin'::app_role)
  OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'network_worship_leader'::app_role)
);

DROP POLICY IF EXISTS "Leaders can upsert serving requirements" ON public.user_serving_requirements;
CREATE POLICY "Leaders can upsert serving requirements"
ON public.user_serving_requirements
FOR ALL
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
