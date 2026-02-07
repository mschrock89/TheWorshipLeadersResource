-- Add display_order column to albums for custom ordering
ALTER TABLE public.albums ADD COLUMN display_order integer DEFAULT 0;

-- Create index for efficient ordering
CREATE INDEX idx_albums_display_order ON public.albums(display_order);