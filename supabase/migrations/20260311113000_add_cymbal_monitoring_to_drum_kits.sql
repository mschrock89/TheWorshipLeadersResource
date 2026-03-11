ALTER TABLE public.drum_kit_pieces
  ADD COLUMN cymbal_brand text,
  ADD COLUMN cymbal_model text,
  ADD COLUMN cymbal_crack_markers jsonb NOT NULL DEFAULT '[]'::jsonb;
