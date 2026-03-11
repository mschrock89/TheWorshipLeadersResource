CREATE OR REPLACE FUNCTION public.can_view_drum_kits(_campus_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'campus_admin'::app_role)
      OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
      OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
      OR EXISTS (
        SELECT 1
        FROM public.user_campuses uc
        WHERE uc.user_id = auth.uid()
          AND uc.campus_id = _campus_id
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_drum_kits(_campus_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'campus_admin'::app_role)
      OR EXISTS (
        SELECT 1
        FROM public.user_campus_ministry_positions ucmp
        WHERE ucmp.user_id = auth.uid()
          AND ucmp.campus_id = _campus_id
          AND ucmp.position = 'drum_tech'
      )
    );
$$;

CREATE TABLE public.drum_kits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id uuid NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.drum_kit_pieces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kit_id uuid NOT NULL REFERENCES public.drum_kits(id) ON DELETE CASCADE,
  piece_type text NOT NULL,
  piece_label text NOT NULL,
  size_inches numeric(5,2) NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  head_brand text,
  head_model text,
  head_installed_on date,
  expected_head_life_days integer,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT drum_kit_pieces_size_positive CHECK (size_inches > 0),
  CONSTRAINT drum_kit_pieces_head_life_positive CHECK (
    expected_head_life_days IS NULL OR expected_head_life_days > 0
  )
);

CREATE INDEX idx_drum_kits_campus ON public.drum_kits(campus_id);
CREATE INDEX idx_drum_kit_pieces_kit ON public.drum_kit_pieces(kit_id, sort_order);

ALTER TABLE public.drum_kits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drum_kit_pieces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view drum kits for accessible campuses"
ON public.drum_kits
FOR SELECT
USING (public.can_view_drum_kits(campus_id));

CREATE POLICY "Drum techs can insert drum kits"
ON public.drum_kits
FOR INSERT
WITH CHECK (public.can_manage_drum_kits(campus_id));

CREATE POLICY "Drum techs can update drum kits"
ON public.drum_kits
FOR UPDATE
USING (public.can_manage_drum_kits(campus_id))
WITH CHECK (public.can_manage_drum_kits(campus_id));

CREATE POLICY "Drum techs can delete drum kits"
ON public.drum_kits
FOR DELETE
USING (public.can_manage_drum_kits(campus_id));

CREATE POLICY "Users can view drum kit pieces for accessible campuses"
ON public.drum_kit_pieces
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.drum_kits dk
    WHERE dk.id = drum_kit_pieces.kit_id
      AND public.can_view_drum_kits(dk.campus_id)
  )
);

CREATE POLICY "Drum techs can insert drum kit pieces"
ON public.drum_kit_pieces
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.drum_kits dk
    WHERE dk.id = drum_kit_pieces.kit_id
      AND public.can_manage_drum_kits(dk.campus_id)
  )
);

CREATE POLICY "Drum techs can update drum kit pieces"
ON public.drum_kit_pieces
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.drum_kits dk
    WHERE dk.id = drum_kit_pieces.kit_id
      AND public.can_manage_drum_kits(dk.campus_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.drum_kits dk
    WHERE dk.id = drum_kit_pieces.kit_id
      AND public.can_manage_drum_kits(dk.campus_id)
  )
);

CREATE POLICY "Drum techs can delete drum kit pieces"
ON public.drum_kit_pieces
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.drum_kits dk
    WHERE dk.id = drum_kit_pieces.kit_id
      AND public.can_manage_drum_kits(dk.campus_id)
  )
);
