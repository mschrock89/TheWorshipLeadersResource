-- Create song_keys lookup table
CREATE TABLE public.song_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_name text NOT NULL UNIQUE,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.song_keys ENABLE ROW LEVEL SECURITY;

-- Everyone can view keys
CREATE POLICY "Anyone can view song keys"
  ON public.song_keys FOR SELECT
  USING (true);

-- Admins and leaders can manage keys
CREATE POLICY "Leaders can manage song keys"
  ON public.song_keys FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'leader', 'campus_worship_pastor', 'network_worship_pastor', 'network_worship_leader')
    )
  );

-- Seed with standard musical keys (major and minor)
INSERT INTO public.song_keys (key_name, display_order) VALUES
  ('C', 1), ('C#', 2), ('Db', 3), ('D', 4), ('D#', 5), ('Eb', 6),
  ('E', 7), ('F', 8), ('F#', 9), ('Gb', 10), ('G', 11), ('G#', 12),
  ('Ab', 13), ('A', 14), ('A#', 15), ('Bb', 16), ('B', 17),
  ('Cm', 18), ('C#m', 19), ('Dm', 20), ('D#m', 21), ('Ebm', 22),
  ('Em', 23), ('Fm', 24), ('F#m', 25), ('Gm', 26), ('G#m', 27),
  ('Am', 28), ('A#m', 29), ('Bbm', 30), ('Bm', 31);

-- Also add any unique keys from existing PCO plan_songs data
INSERT INTO public.song_keys (key_name, display_order)
SELECT DISTINCT ps.song_key, 100
FROM public.plan_songs ps
WHERE ps.song_key IS NOT NULL 
  AND ps.song_key != ''
  AND NOT EXISTS (
    SELECT 1 FROM public.song_keys sk WHERE sk.key_name = ps.song_key
  );

-- Create index for faster lookups
CREATE INDEX idx_song_keys_display_order ON public.song_keys(display_order);