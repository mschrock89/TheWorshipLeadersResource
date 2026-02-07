-- Create albums table
CREATE TABLE public.albums (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  artwork_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create album_tracks junction table (links albums to songs)
CREATE TABLE public.album_tracks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  album_id UUID NOT NULL REFERENCES public.albums(id) ON DELETE CASCADE,
  song_id UUID NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
  track_number INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(album_id, song_id),
  UNIQUE(album_id, track_number)
);

-- Enable RLS
ALTER TABLE public.albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.album_tracks ENABLE ROW LEVEL SECURITY;

-- Anyone can view albums
CREATE POLICY "Anyone can view albums" ON public.albums
  FOR SELECT USING (true);

-- Only admin can manage albums
CREATE POLICY "Admin can insert albums" ON public.albums
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );

CREATE POLICY "Admin can update albums" ON public.albums
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );

CREATE POLICY "Admin can delete albums" ON public.albums
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );

-- Anyone can view album tracks
CREATE POLICY "Anyone can view album tracks" ON public.album_tracks
  FOR SELECT USING (true);

-- Only admin can manage album tracks
CREATE POLICY "Admin can insert album tracks" ON public.album_tracks
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );

CREATE POLICY "Admin can update album tracks" ON public.album_tracks
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );

CREATE POLICY "Admin can delete album tracks" ON public.album_tracks
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );

-- Create storage bucket for album artwork
INSERT INTO storage.buckets (id, name, public) 
VALUES ('album-artwork', 'album-artwork', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies - only admin can upload artwork
CREATE POLICY "Admin can upload album artwork" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'album-artwork' AND
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );

CREATE POLICY "Admin can update album artwork" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'album-artwork' AND
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );

CREATE POLICY "Admin can delete album artwork" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'album-artwork' AND
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );

CREATE POLICY "Anyone can view album artwork" ON storage.objects
  FOR SELECT USING (bucket_id = 'album-artwork');

-- Update song-audio bucket to only allow admin uploads
DROP POLICY IF EXISTS "Admins can upload audio" ON storage.objects;
CREATE POLICY "Admin can upload song audio" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'song-audio' AND
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );

CREATE POLICY "Admin can update song audio" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'song-audio' AND
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );

CREATE POLICY "Admin can delete song audio" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'song-audio' AND
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );

-- Add trigger for updated_at on albums
CREATE TRIGGER update_albums_updated_at
  BEFORE UPDATE ON public.albums
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();