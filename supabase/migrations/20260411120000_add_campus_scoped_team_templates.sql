CREATE TABLE public.team_template_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.worship_teams(id) ON DELETE CASCADE,
  campus_id UUID NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  template_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX team_template_configs_team_campus_unique
ON public.team_template_configs(team_id, campus_id)
WHERE campus_id IS NOT NULL;

CREATE INDEX idx_team_template_configs_team_id
ON public.team_template_configs(team_id);

CREATE INDEX idx_team_template_configs_campus_id
ON public.team_template_configs(campus_id);

INSERT INTO public.team_template_configs (team_id, campus_id, template_config)
SELECT wt.id, NULL, wt.template_config
FROM public.worship_teams wt
WHERE NOT EXISTS (
  SELECT 1
  FROM public.team_template_configs ttc
  WHERE ttc.team_id = wt.id
    AND ttc.campus_id IS NULL
);

UPDATE public.worship_teams
SET template_config = CASE name
  WHEN 'Team 1' THEN jsonb_build_object(
    'vocalSlots', jsonb_build_array(
      jsonb_build_object('slot', 'vocalist_1', 'gender', 'male'),
      jsonb_build_object('slot', 'vocalist_2', 'gender', 'female'),
      jsonb_build_object('slot', 'vocalist_3', 'gender', 'female'),
      jsonb_build_object('slot', 'vocalist_4', 'gender', 'female')
    ),
    'bandSlots', jsonb_build_array('drums', 'bass', 'keys', 'eg_1', 'eg_2', 'ag_1')
  )
  WHEN 'Team 2' THEN jsonb_build_object(
    'vocalSlots', jsonb_build_array(
      jsonb_build_object('slot', 'vocalist_1', 'gender', 'male'),
      jsonb_build_object('slot', 'vocalist_2', 'gender', 'female'),
      jsonb_build_object('slot', 'vocalist_3', 'gender', 'female'),
      jsonb_build_object('slot', 'vocalist_4', 'gender', 'female')
    ),
    'bandSlots', jsonb_build_array('drums', 'bass', 'keys', 'eg_1', 'eg_2', 'ag_1', 'ag_2')
  )
  WHEN 'Team 3' THEN jsonb_build_object(
    'vocalSlots', jsonb_build_array(
      jsonb_build_object('slot', 'vocalist_1', 'gender', 'male'),
      jsonb_build_object('slot', 'vocalist_2', 'gender', 'female'),
      jsonb_build_object('slot', 'vocalist_3', 'gender', 'female'),
      jsonb_build_object('slot', 'vocalist_4', 'gender', 'female')
    ),
    'bandSlots', jsonb_build_array('drums', 'bass', 'keys', 'eg_1', 'eg_2', 'ag_1', 'ag_2')
  )
  WHEN 'Team 4' THEN jsonb_build_object(
    'vocalSlots', jsonb_build_array(
      jsonb_build_object('slot', 'vocalist_1', 'gender', 'male'),
      jsonb_build_object('slot', 'vocalist_2', 'gender', 'female'),
      jsonb_build_object('slot', 'vocalist_3', 'gender', 'female'),
      jsonb_build_object('slot', 'vocalist_4', 'gender', 'female')
    ),
    'bandSlots', jsonb_build_array('drums', 'bass', 'keys', 'eg_1', 'eg_2', 'ag_1')
  )
  ELSE template_config
END
WHERE name IN ('Team 1', 'Team 2', 'Team 3', 'Team 4');

UPDATE public.team_template_configs ttc
SET
  template_config = wt.template_config,
  updated_at = now()
FROM public.worship_teams wt
JOIN public.campuses c
  ON c.name = 'Murfreesboro Central'
WHERE wt.name IN ('Team 1', 'Team 2', 'Team 3', 'Team 4')
  AND ttc.team_id = wt.id
  AND ttc.campus_id = c.id;

INSERT INTO public.team_template_configs (team_id, campus_id, template_config)
SELECT
  wt.id,
  c.id,
  wt.template_config
FROM public.worship_teams wt
JOIN public.campuses c
  ON c.name = 'Murfreesboro Central'
WHERE wt.name IN ('Team 1', 'Team 2', 'Team 3', 'Team 4')
  AND NOT EXISTS (
    SELECT 1
    FROM public.team_template_configs existing
    WHERE existing.team_id = wt.id
      AND existing.campus_id = c.id
  );

ALTER TABLE public.team_template_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view team template configs"
ON public.team_template_configs
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Team managers can manage team template configs"
ON public.team_template_configs
FOR ALL
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'network_worship_leader'::app_role)
  OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
  OR (
    has_role(auth.uid(), 'campus_admin'::app_role)
    AND campus_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'campus_admin'::app_role
        AND ur.admin_campus_id = team_template_configs.campus_id
    )
  )
  OR (
    (
      has_role(auth.uid(), 'campus_worship_pastor'::app_role)
      OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
      OR has_role(auth.uid(), 'video_director'::app_role)
      OR has_role(auth.uid(), 'production_manager'::app_role)
    )
    AND campus_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_campuses uc
      WHERE uc.user_id = auth.uid()
        AND uc.campus_id = team_template_configs.campus_id
    )
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'network_worship_leader'::app_role)
  OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
  OR (
    has_role(auth.uid(), 'campus_admin'::app_role)
    AND campus_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'campus_admin'::app_role
        AND ur.admin_campus_id = team_template_configs.campus_id
    )
  )
  OR (
    (
      has_role(auth.uid(), 'campus_worship_pastor'::app_role)
      OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
      OR has_role(auth.uid(), 'video_director'::app_role)
      OR has_role(auth.uid(), 'production_manager'::app_role)
    )
    AND campus_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_campuses uc
      WHERE uc.user_id = auth.uid()
        AND uc.campus_id = team_template_configs.campus_id
    )
  )
);

DROP TRIGGER IF EXISTS update_team_template_configs_updated_at ON public.team_template_configs;
CREATE TRIGGER update_team_template_configs_updated_at
BEFORE UPDATE ON public.team_template_configs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
