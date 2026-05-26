-- Collapse legacy numbered camera roles into the current video camera role.
-- The numbered camera values are no longer surfaced by the app.

update public.profiles
set positions = array(
  select distinct
    case
      when position_value::text in ('camera_1', 'camera_2', 'camera_3', 'camera_4', 'camera_5', 'camera_6')
        then 'tri_pod_camera'::public.team_position
      else position_value
    end
  from unnest(coalesce(positions, '{}'::public.team_position[])) as position_value
);

update public.custom_service_assignments
set role = case
  when role::text in ('camera_1', 'camera_2', 'camera_3', 'camera_4', 'camera_5', 'camera_6')
    then 'tri_pod_camera'::public.team_position
  else role
end
where role::text in ('camera_1', 'camera_2', 'camera_3', 'camera_4', 'camera_5', 'camera_6');

update public.team_members
set position = case
  when position in ('camera_1', 'camera_2', 'camera_3', 'camera_4', 'camera_5', 'camera_6', 'Camera 1', 'Camera 2', 'Camera 3', 'Camera 4', 'Camera 5', 'Camera 6')
    then 'Tri-Pod Camera'
  else position
end,
position_slot = case
  when position_slot in ('camera_1', 'camera_2', 'camera_3', 'camera_4', 'camera_5', 'camera_6', 'Camera 1', 'Camera 2', 'Camera 3', 'Camera 4', 'Camera 5', 'Camera 6')
    then 'tri_pod_camera'
  else position_slot
end
where position in ('camera_1', 'camera_2', 'camera_3', 'camera_4', 'camera_5', 'camera_6', 'Camera 1', 'Camera 2', 'Camera 3', 'Camera 4', 'Camera 5', 'Camera 6')
   or position_slot in ('camera_1', 'camera_2', 'camera_3', 'camera_4', 'camera_5', 'camera_6', 'Camera 1', 'Camera 2', 'Camera 3', 'Camera 4', 'Camera 5', 'Camera 6');

update public.team_member_date_overrides
set position = case
  when position in ('camera_1', 'camera_2', 'camera_3', 'camera_4', 'camera_5', 'camera_6', 'Camera 1', 'Camera 2', 'Camera 3', 'Camera 4', 'Camera 5', 'Camera 6')
    then 'Tri-Pod Camera'
  else position
end,
position_slot = case
  when position_slot in ('camera_1', 'camera_2', 'camera_3', 'camera_4', 'camera_5', 'camera_6', 'Camera 1', 'Camera 2', 'Camera 3', 'Camera 4', 'Camera 5', 'Camera 6')
    then 'tri_pod_camera'
  else position_slot
end
where position in ('camera_1', 'camera_2', 'camera_3', 'camera_4', 'camera_5', 'camera_6', 'Camera 1', 'Camera 2', 'Camera 3', 'Camera 4', 'Camera 5', 'Camera 6')
   or position_slot in ('camera_1', 'camera_2', 'camera_3', 'camera_4', 'camera_5', 'camera_6', 'Camera 1', 'Camera 2', 'Camera 3', 'Camera 4', 'Camera 5', 'Camera 6');

update public.swap_requests
set position = 'Tri-Pod Camera'
where position in ('camera_1', 'camera_2', 'camera_3', 'camera_4', 'camera_5', 'camera_6', 'Camera 1', 'Camera 2', 'Camera 3', 'Camera 4', 'Camera 5', 'Camera 6');

with mapped_positions as (
  select
    id,
    user_id,
    campus_id,
    ministry_type,
    position,
    case
      when position in ('camera_1', 'camera_2', 'camera_3', 'camera_4', 'camera_5', 'camera_6', 'Camera 1', 'Camera 2', 'Camera 3', 'Camera 4', 'Camera 5', 'Camera 6')
        then 'Tri-Pod Camera'
      else position
    end as target_position
  from public.user_campus_ministry_positions
),
ranked_positions as (
  select
    *,
    row_number() over (
      partition by user_id, campus_id, ministry_type, target_position
      order by case when position = target_position then 0 else 1 end, id
    ) as row_rank
  from mapped_positions
)
delete from public.user_campus_ministry_positions ucmp
using ranked_positions ranked
where ucmp.id = ranked.id
  and ranked.row_rank > 1;

update public.user_campus_ministry_positions
set position = 'Tri-Pod Camera'
where position in ('camera_1', 'camera_2', 'camera_3', 'camera_4', 'camera_5', 'camera_6', 'Camera 1', 'Camera 2', 'Camera 3', 'Camera 4', 'Camera 5', 'Camera 6');
