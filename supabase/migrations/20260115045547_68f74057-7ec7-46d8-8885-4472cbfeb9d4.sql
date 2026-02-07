-- Add BPM column to songs table
ALTER TABLE public.songs ADD COLUMN bpm numeric(5,1) NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.songs.bpm IS 'Beats per minute from Planning Center arrangement';