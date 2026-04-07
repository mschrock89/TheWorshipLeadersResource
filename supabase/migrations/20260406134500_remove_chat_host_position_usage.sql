UPDATE public.profiles
SET positions = array_remove(COALESCE(positions, '{}'::public.team_position[]), 'chat_host'::public.team_position)
WHERE positions @> ARRAY['chat_host'::public.team_position];

DELETE FROM public.custom_service_assignments
WHERE role = 'chat_host'::public.team_position;

DELETE FROM public.team_members
WHERE position = 'chat_host'
   OR position_slot = 'chat_host';
