create table if not exists public.drum_tech_comment_replies (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.drum_tech_comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists drum_tech_comment_replies_comment_id_created_at_idx
  on public.drum_tech_comment_replies(comment_id, created_at asc);

create trigger trg_drum_tech_comment_replies_updated_at
before update on public.drum_tech_comment_replies
for each row
execute function public.update_updated_at_column();

alter table public.drum_tech_comment_replies enable row level security;

create policy "Accessible users can view drum tech comment replies"
  on public.drum_tech_comment_replies
  for select
  using (
    exists (
      select 1
      from public.drum_tech_comments c
      where c.id = drum_tech_comment_replies.comment_id
        and public.can_view_drum_kits(c.campus_id)
    )
  );

create policy "Accessible users can create drum tech comment replies"
  on public.drum_tech_comment_replies
  for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.drum_tech_comments c
      where c.id = drum_tech_comment_replies.comment_id
        and public.can_view_drum_kits(c.campus_id)
    )
  );

create policy "Users can update accessible drum tech comment replies"
  on public.drum_tech_comment_replies
  for update
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.drum_tech_comments c
      where c.id = drum_tech_comment_replies.comment_id
        and public.can_view_drum_kits(c.campus_id)
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.drum_tech_comments c
      where c.id = drum_tech_comment_replies.comment_id
        and public.can_view_drum_kits(c.campus_id)
    )
  );

create policy "Users can delete accessible drum tech comment replies"
  on public.drum_tech_comment_replies
  for delete
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.drum_tech_comments c
      where c.id = drum_tech_comment_replies.comment_id
        and public.can_view_drum_kits(c.campus_id)
    )
  );

alter publication supabase_realtime add table public.drum_tech_comment_replies;
