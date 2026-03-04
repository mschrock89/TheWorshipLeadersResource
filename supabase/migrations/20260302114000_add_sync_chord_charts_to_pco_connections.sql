alter table public.pco_connections
  add column if not exists sync_chord_charts boolean not null default true;

drop function if exists public.get_my_pco_connection();

create or replace function public.get_my_pco_connection()
returns table (
  id uuid,
  user_id uuid,
  campus_id uuid,
  pco_organization_name text,
  connected_at timestamptz,
  last_sync_at timestamptz,
  sync_team_members boolean,
  sync_positions boolean,
  sync_birthdays boolean,
  sync_phone_numbers boolean,
  sync_chord_charts boolean,
  sync_active_only boolean
)
language sql
security definer
set search_path = public
as $$
  select
    id,
    user_id,
    campus_id,
    pco_organization_name,
    connected_at,
    last_sync_at,
    sync_team_members,
    sync_positions,
    sync_birthdays,
    sync_phone_numbers,
    sync_chord_charts,
    sync_active_only
  from public.pco_connections
  where user_id = auth.uid();
$$;

grant execute on function public.get_my_pco_connection() to authenticated;
