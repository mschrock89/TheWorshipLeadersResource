-- Fixes "infinite recursion detected in policy for relation admin_pings" (42P17).
--
-- The admin_pings SELECT policy referenced admin_ping_recipients, while the
-- admin_ping_recipients SELECT policy referenced admin_pings. Each table's RLS
-- check triggered the other's, producing mutual recursion. Move the cross-table
-- lookups into SECURITY DEFINER helpers (which bypass RLS) to break the cycle.

create or replace function public.is_admin_ping_recipient(
  _ping_id uuid,
  _user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_ping_recipients apr
    where apr.ping_id = _ping_id
      and apr.user_id = _user_id
  )
$$;

create or replace function public.can_view_admin_ping(
  _ping_id uuid,
  _user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_pings ap
    where ap.id = _ping_id
      and (
        ap.sent_by_user_id = _user_id
        or public.has_role(_user_id, 'admin'::app_role)
        or public.is_student_resource_app_admin(_user_id, ap.resource_app_key)
      )
  )
$$;

-- Recreate admin_pings recipient policy without referencing admin_ping_recipients directly.
drop policy if exists "Recipients can view their admin pings" on public.admin_pings;
create policy "Recipients can view their admin pings"
on public.admin_pings
for select
using (
  public.is_admin_ping_recipient(admin_pings.id, auth.uid())
);

-- Recreate admin_ping_recipients policy without referencing admin_pings directly.
drop policy if exists "Users can view their admin ping recipients" on public.admin_ping_recipients;
create policy "Users can view their admin ping recipients"
on public.admin_ping_recipients
for select
using (
  user_id = auth.uid()
  or public.can_view_admin_ping(admin_ping_recipients.ping_id, auth.uid())
);
