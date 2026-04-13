ALTER TABLE public.team_template_configs
ADD COLUMN IF NOT EXISTS ministry_type text;

UPDATE public.team_template_configs
SET ministry_type = 'weekend'
WHERE ministry_type IS NULL;

ALTER TABLE public.team_template_configs
ALTER COLUMN ministry_type SET DEFAULT 'weekend';

ALTER TABLE public.team_template_configs
ALTER COLUMN ministry_type SET NOT NULL;

DROP INDEX IF EXISTS public.team_template_configs_team_campus_unique;

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
  existing.template_config,
  existing.created_at,
  existing.updated_at
FROM public.team_template_configs existing
CROSS JOIN (
  VALUES
    ('production'),
    ('video'),
    ('encounter'),
    ('eon'),
    ('eon_weekend'),
    ('evident'),
    ('er'),
    ('speaker'),
    ('prayer_night'),
    ('audition')
) AS scoped(ministry_type)
WHERE existing.ministry_type = 'weekend'
  AND NOT EXISTS (
    SELECT 1
    FROM public.team_template_configs dupe
    WHERE dupe.team_id = existing.team_id
      AND dupe.campus_id IS NOT DISTINCT FROM existing.campus_id
      AND dupe.ministry_type = scoped.ministry_type
  );

CREATE UNIQUE INDEX IF NOT EXISTS team_template_configs_team_campus_ministry_unique
ON public.team_template_configs(team_id, campus_id, ministry_type);

CREATE INDEX IF NOT EXISTS idx_team_template_configs_team_campus_ministry
ON public.team_template_configs(team_id, campus_id, ministry_type);
