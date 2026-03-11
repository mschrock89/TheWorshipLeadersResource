ALTER TABLE public.drum_kit_pieces
  RENAME COLUMN head_brand TO batter_head_brand;

ALTER TABLE public.drum_kit_pieces
  RENAME COLUMN head_model TO batter_head_model;

ALTER TABLE public.drum_kit_pieces
  RENAME COLUMN head_installed_on TO batter_head_installed_on;

ALTER TABLE public.drum_kit_pieces
  RENAME COLUMN expected_head_life_days TO batter_expected_head_life_days;

ALTER TABLE public.drum_kit_pieces
  ADD COLUMN reso_head_brand text,
  ADD COLUMN reso_head_model text,
  ADD COLUMN reso_head_installed_on date,
  ADD COLUMN reso_expected_head_life_days integer;

ALTER TABLE public.drum_kit_pieces
  DROP CONSTRAINT IF EXISTS drum_kit_pieces_head_life_positive;

ALTER TABLE public.drum_kit_pieces
  ADD CONSTRAINT drum_kit_pieces_batter_head_life_positive CHECK (
    batter_expected_head_life_days IS NULL OR batter_expected_head_life_days > 0
  ),
  ADD CONSTRAINT drum_kit_pieces_reso_head_life_positive CHECK (
    reso_expected_head_life_days IS NULL OR reso_expected_head_life_days > 0
  );
