-- Seed team roster templates for the new MS/HS Worship ministry by copying
-- each campus's existing Weekend Worship template (same approach used when
-- encounter / eon / eon_weekend were first scoped onto team_template_configs).
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
  'ms_hs',
  existing.template_config,
  existing.created_at,
  existing.updated_at
FROM public.team_template_configs existing
WHERE existing.ministry_type = 'weekend'
  AND NOT EXISTS (
    SELECT 1
    FROM public.team_template_configs dupe
    WHERE dupe.team_id = existing.team_id
      AND dupe.campus_id IS NOT DISTINCT FROM existing.campus_id
      AND dupe.ministry_type = 'ms_hs'
  );
