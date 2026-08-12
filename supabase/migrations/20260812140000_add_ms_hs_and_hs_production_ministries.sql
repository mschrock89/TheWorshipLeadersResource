-- Seed campus-scoped team roster templates for MS/HS Production and HS Production.
-- Each ministry uses a fixed production crew: Lyrics, Lights, FOH, and MON.
INSERT INTO public.team_template_configs (
  team_id,
  campus_id,
  ministry_type,
  template_config,
  created_at,
  updated_at
)
SELECT
  existing.team_id,
  existing.campus_id,
  scoped.ministry_type,
  jsonb_build_object(
    'vocalSlots', COALESCE(existing.template_config->'vocalSlots', '[]'::jsonb),
    'bandSlots', COALESCE(existing.template_config->'bandSlots', '[]'::jsonb),
    'productionSlots', '["foh", "mon", "lighting", "propresenter"]'::jsonb,
    'videoSlots', COALESCE(existing.template_config->'videoSlots', '[]'::jsonb)
  ),
  existing.created_at,
  existing.updated_at
FROM public.team_template_configs existing
CROSS JOIN (
  VALUES
    ('ms_hs_production'),
    ('hs_production')
) AS scoped(ministry_type)
WHERE existing.ministry_type = 'production'
  AND NOT EXISTS (
    SELECT 1
    FROM public.team_template_configs dupe
    WHERE dupe.team_id = existing.team_id
      AND dupe.campus_id IS NOT DISTINCT FROM existing.campus_id
      AND dupe.ministry_type = scoped.ministry_type
  );
