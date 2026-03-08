CREATE TABLE IF NOT EXISTS public.galaga_high_scores (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  score integer NOT NULL DEFAULT 0 CHECK (score >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.galaga_high_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view galaga high scores" ON public.galaga_high_scores;
CREATE POLICY "Authenticated users can view galaga high scores"
ON public.galaga_high_scores
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Users can insert their own galaga score" ON public.galaga_high_scores;
CREATE POLICY "Users can insert their own galaga score"
ON public.galaga_high_scores
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update only their own galaga score" ON public.galaga_high_scores;
CREATE POLICY "Users can update only their own galaga score"
ON public.galaga_high_scores
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS trg_galaga_high_scores_updated_at ON public.galaga_high_scores;
CREATE TRIGGER trg_galaga_high_scores_updated_at
BEFORE UPDATE ON public.galaga_high_scores
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
