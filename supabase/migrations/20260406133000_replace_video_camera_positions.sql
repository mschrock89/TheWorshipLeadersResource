ALTER TYPE public.team_position ADD VALUE IF NOT EXISTS 'tri_pod_camera';
ALTER TYPE public.team_position ADD VALUE IF NOT EXISTS 'hand_held_camera';

UPDATE public.profiles
SET positions = ARRAY(
  SELECT DISTINCT
    CASE
      WHEN position_value::text IN ('camera_1', 'camera_2', 'camera_3', 'camera_4', 'camera_5', 'camera_6')
        THEN 'tri_pod_camera'::public.team_position
      ELSE position_value
    END
  FROM unnest(COALESCE(positions, '{}'::public.team_position[])) AS position_value
);

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
