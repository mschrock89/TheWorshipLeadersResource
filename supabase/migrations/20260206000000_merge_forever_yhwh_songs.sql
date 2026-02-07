-- Reusable function to merge two songs within the app
-- Merges source_song_id into target_song_id: all references point to target, source is deleted
CREATE OR REPLACE FUNCTION public.merge_songs(source_song_id UUID, target_song_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF source_song_id = target_song_id THEN
    RAISE EXCEPTION 'Cannot merge a song into itself';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM songs WHERE id = source_song_id) THEN
    RAISE EXCEPTION 'Source song not found';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM songs WHERE id = target_song_id) THEN
    RAISE EXCEPTION 'Target song not found';
  END IF;

  -- 1. Update plan_songs
  UPDATE plan_songs SET song_id = target_song_id WHERE song_id = source_song_id;

  -- 2. Update draft_set_songs (handle duplicates: delete source row if target already in same draft)
  DELETE FROM draft_set_songs
  WHERE song_id = source_song_id
  AND draft_set_id IN (SELECT draft_set_id FROM draft_set_songs WHERE song_id = target_song_id);
  UPDATE draft_set_songs SET song_id = target_song_id WHERE song_id = source_song_id;

  -- 3. Update service_flow_items
  UPDATE service_flow_items SET song_id = target_song_id WHERE song_id = source_song_id;

  -- 4. Update album_tracks (handle duplicates)
  DELETE FROM album_tracks
  WHERE song_id = source_song_id
  AND album_id IN (SELECT album_id FROM album_tracks WHERE song_id = target_song_id);
  UPDATE album_tracks SET song_id = target_song_id WHERE song_id = source_song_id;

  -- 5. Delete the source song
  DELETE FROM songs WHERE id = source_song_id;
END $$;

-- Grant execute to authenticated users (caller should enforce admin/leader permission in app)
GRANT EXECUTE ON FUNCTION public.merge_songs(UUID, UUID) TO authenticated;
