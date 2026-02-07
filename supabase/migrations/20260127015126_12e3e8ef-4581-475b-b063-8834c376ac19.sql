-- Add audio_url column to songs table
ALTER TABLE public.songs ADD COLUMN IF NOT EXISTS audio_url TEXT;

-- Create storage bucket for song audio files
INSERT INTO storage.buckets (id, name, public) 
VALUES ('song-audio', 'song-audio', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policy: Admins can upload audio files
CREATE POLICY "Admins can upload audio" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'song-audio' AND
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'campus_admin', 'campus_worship_pastor', 'student_worship_pastor')
    )
  );

-- RLS policy: Admins can update audio files
CREATE POLICY "Admins can update audio" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'song-audio' AND
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'campus_admin', 'campus_worship_pastor', 'student_worship_pastor')
    )
  );

-- RLS policy: Admins can delete audio files
CREATE POLICY "Admins can delete audio" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'song-audio' AND
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'campus_admin', 'campus_worship_pastor', 'student_worship_pastor')
    )
  );

-- RLS policy: Anyone authenticated can view audio files
CREATE POLICY "Anyone can view audio" ON storage.objects
  FOR SELECT USING (bucket_id = 'song-audio');