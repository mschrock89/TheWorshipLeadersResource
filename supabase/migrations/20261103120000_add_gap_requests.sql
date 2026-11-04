-- Gap requests: a campus worship pastor (or other ministry lead) has an unfilled
-- position for a date and none of the regular volunteers can cover it. They pick
-- the position plus the campuses/ministries to reach, and every matching volunteer
-- gets a push they can answer Yes or No. A Yes is only an offer: the pastor approves
-- one, and approval writes a team_member_date_overrides row that puts that volunteer
-- in the gap's slot on the scheduled team for the date (and its weekend pair day).
--
-- All writes go through the send-gap-request / respond-gap-request edge functions
-- (service role), so the tables only expose SELECT policies to clients.

create table if not exists public.gap_requests (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete cascade,
  campus_id uuid not null references public.campuses(id) on delete cascade,
  ministry_type text not null,
  schedule_date date not null,
  position text not null,
  position_slot text not null,
  covers_weekend_pair boolean not null default false,
  -- Set on approval: the team whose roster the volunteer was added to, and the dates.
  team_id uuid references public.worship_teams(id) on delete set null,
  slotted_dates date[] not null default '{}',
  message text,
  target_campus_ids uuid[] not null default '{}',
  target_ministry_types text[] not null default '{}',
  status text not null default 'open'
    check (status in ('open', 'filled', 'cancelled')),
  filled_by_user_id uuid references public.profiles(id) on delete set null,
  filled_at timestamptz,
  resource_app_key text not null default 'worship',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists gap_requests_created_by_idx
  on public.gap_requests (created_by, created_at desc);

create index if not exists gap_requests_campus_date_idx
  on public.gap_requests (campus_id, schedule_date);

create table if not exists public.gap_request_recipients (
  id uuid primary key default gen_random_uuid(),
  gap_request_id uuid not null references public.gap_requests(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  response text not null default 'pending'
    check (response in ('pending', 'yes', 'no')),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (gap_request_id, user_id)
);

create index if not exists gap_request_recipients_user_idx
  on public.gap_request_recipients (user_id, created_at desc);

drop trigger if exists update_gap_requests_updated_at on public.gap_requests;
create trigger update_gap_requests_updated_at
before update on public.gap_requests
for each row
execute function public.update_updated_at_column();

alter table public.gap_requests enable row level security;
alter table public.gap_request_recipients enable row level security;

-- Recipient check lives in a SECURITY DEFINER helper so the two tables' policies
-- don't reference each other through RLS (which would recurse).
create or replace function public.is_gap_request_recipient(_gap_request_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.gap_request_recipients r
    where r.gap_request_id = _gap_request_id
      and r.user_id = _user_id
  );
$$;

-- The creator, org admins, and ministry leads assigned to the gap's campus can
-- see a request and everyone's responses.
create or replace function public.viewer_can_manage_gap_request(_gap_request_id uuid, _viewer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.gap_requests g
    where g.id = _gap_request_id
      and (
        g.created_by = _viewer_id
        or public.has_role(_viewer_id, 'admin'::app_role)
        or public.has_role(_viewer_id, 'network_worship_pastor'::app_role)
        or public.has_role(_viewer_id, 'network_worship_leader'::app_role)
        or (
          public.viewer_can_manage_swap_ministry(_viewer_id, g.ministry_type)
          and (
            exists (
              select 1 from public.user_campuses uc
              where uc.user_id = _viewer_id and uc.campus_id = g.campus_id
            )
            or exists (
              select 1 from public.user_roles ur
              where ur.user_id = _viewer_id
                and ur.role = 'campus_admin'::app_role
                and ur.admin_campus_id = g.campus_id
            )
          )
        )
      )
  );
$$;

drop policy if exists "Recipients and managers can view gap requests" on public.gap_requests;
create policy "Recipients and managers can view gap requests"
on public.gap_requests
for select
to authenticated
using (
  public.is_gap_request_recipient(id, auth.uid())
  or public.viewer_can_manage_gap_request(id, auth.uid())
);

drop policy if exists "Recipients and managers can view gap responses" on public.gap_request_recipients;
create policy "Recipients and managers can view gap responses"
on public.gap_request_recipients
for select
to authenticated
using (
  user_id = auth.uid()
  or public.viewer_can_manage_gap_request(gap_request_id, auth.uid())
);

grant select on public.gap_requests to authenticated;
grant select on public.gap_request_recipients to authenticated;
grant all on public.gap_requests to service_role;
grant all on public.gap_request_recipients to service_role;

revoke all on function public.is_gap_request_recipient(uuid, uuid) from public, anon;
revoke all on function public.viewer_can_manage_gap_request(uuid, uuid) from public, anon;
grant execute on function public.is_gap_request_recipient(uuid, uuid) to authenticated, service_role;
grant execute on function public.viewer_can_manage_gap_request(uuid, uuid) to authenticated, service_role;

do $$
begin
  alter publication supabase_realtime add table public.gap_requests;
exception when duplicate_object then null;
end
$$;

do $$
begin
  alter publication supabase_realtime add table public.gap_request_recipients;
exception when duplicate_object then null;
end
$$;

insert into public.push_notification_definitions (
  key, label, category, description, trigger_description, recipients_description,
  title_template, body_template, deep_link_url, template_variables,
  enabled, content_from_db, is_system, sort_order
) values
(
  'gap-request',
  'Gap Request',
  'Gaps',
  'Asks volunteers in a position whether they can fill an open spot. Includes Yes / No buttons.',
  'A campus worship pastor or ministry lead sends a gap request',
  'Volunteers assigned to that position in the campuses and ministries the sender picked',
  '{{position}} needed {{date}}',
  '{{sender}} needs a {{position}} at {{campus}} for {{ministry}} on {{date}}. Can you serve?',
  null,
  array['sender', 'position', 'campus', 'ministry', 'date'],
  true,
  true,
  true,
  130
),
(
  'gap-response',
  'Gap Request Response',
  'Gaps',
  'Tells the sender that someone said yes and is waiting on approval, or that everyone has declined.',
  'A volunteer answers a gap request',
  'The person who sent the gap request',
  '{{responder}} can serve {{date}}',
  '{{responder}} said yes to {{position}} on {{date}}. Open the request to approve them.',
  null,
  array['responder', 'position', 'date'],
  true,
  false,
  true,
  131
),
(
  'gap-filled',
  'Gap Filled',
  'Gaps',
  'Tells the approved volunteer they are on the schedule, and lets other Yes responders know the spot is taken.',
  'The sender approves a volunteer or cancels the request',
  'Volunteers who said yes to the gap request',
  'You''re on the schedule {{date}}',
  '{{sender}} approved you for {{position}} at {{campus}} on {{date}}. Thank you!',
  null,
  array['sender', 'position', 'campus', 'date'],
  true,
  false,
  true,
  132
)
on conflict (key) do update set
  label = excluded.label,
  category = excluded.category,
  description = excluded.description,
  trigger_description = excluded.trigger_description,
  recipients_description = excluded.recipients_description,
  title_template = excluded.title_template,
  body_template = excluded.body_template,
  deep_link_url = excluded.deep_link_url,
  template_variables = excluded.template_variables,
  content_from_db = excluded.content_from_db,
  sort_order = excluded.sort_order,
  updated_at = now();
