UPDATE public.profiles
SET positions = ARRAY(
  SELECT DISTINCT
    CASE
      WHEN position_value::text IN ('camera_1', 'camera_2', 'camera_3', 'camera_4', 'camera_5', 'camera_6')
        THEN 'tri_pod_camera'::public.team_position
      ELSE position_value
    END
  FROM unnest(COALESCE(positions, '{}'::public.team_position[])) AS position_value
)
WHERE positions && ARRAY[
  'camera_1'::public.team_position,
  'camera_2'::public.team_position,
  'camera_3'::public.team_position,
  'camera_4'::public.team_position,
  'camera_5'::public.team_position,
  'camera_6'::public.team_position,
  'chat_host'::public.team_position
];

UPDATE public.custom_service_assignments
SET role = CASE
  WHEN role::text IN ('camera_1', 'camera_2', 'camera_3', 'camera_4', 'camera_5', 'camera_6')
    THEN 'tri_pod_camera'::public.team_position
  ELSE role
END
WHERE role::text IN ('camera_1', 'camera_2', 'camera_3', 'camera_4', 'camera_5', 'camera_6');

UPDATE public.team_members
SET position = CASE
  WHEN position IN ('camera_1', 'camera_2', 'camera_3', 'camera_4', 'camera_5', 'camera_6')
    THEN 'tri_pod_camera'
  ELSE position
END,
position_slot = CASE
  WHEN position_slot IN ('camera_1', 'camera_2', 'camera_3', 'camera_4', 'camera_5', 'camera_6')
    THEN 'tri_pod_camera'
  ELSE position_slot
END
WHERE position IN ('camera_1', 'camera_2', 'camera_3', 'camera_4', 'camera_5', 'camera_6')
   OR position_slot IN ('camera_1', 'camera_2', 'camera_3', 'camera_4', 'camera_5', 'camera_6');

UPDATE public.profiles
SET positions = array_remove(COALESCE(positions, '{}'::public.team_position[]), 'chat_host'::public.team_position)
WHERE positions @> ARRAY['chat_host'::public.team_position];

DELETE FROM public.custom_service_assignments
WHERE role = 'chat_host'::public.team_position;

DELETE FROM public.team_members
WHERE position = 'chat_host'
   OR position_slot = 'chat_host';
