create table if not exists public.drum_tech_comment_reactions (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.drum_tech_comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction_type text not null check (reaction_type in ('like', 'dislike')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (comment_id, user_id)
);

create index if not exists drum_tech_comment_reactions_comment_id_idx
  on public.drum_tech_comment_reactions(comment_id);

create index if not exists drum_tech_comment_reactions_user_id_idx
  on public.drum_tech_comment_reactions(user_id);

create trigger trg_drum_tech_comment_reactions_updated_at
before update on public.drum_tech_comment_reactions
for each row
execute function public.update_updated_at_column();

alter table public.drum_tech_comment_reactions enable row level security;

create policy "Accessible users can view drum tech comment reactions"
  on public.drum_tech_comment_reactions
  for select
  using (
    exists (
      select 1
      from public.drum_tech_comments c
      where c.id = drum_tech_comment_reactions.comment_id
        and public.can_view_drum_kits(c.campus_id)
    )
  );

create policy "Accessible users can create drum tech comment reactions"
  on public.drum_tech_comment_reactions
  for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.drum_tech_comments c
      where c.id = drum_tech_comment_reactions.comment_id
        and public.can_view_drum_kits(c.campus_id)
    )
  );

create policy "Users can update accessible drum tech comment reactions"
  on public.drum_tech_comment_reactions
  for update
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.drum_tech_comments c
      where c.id = drum_tech_comment_reactions.comment_id
        and public.can_view_drum_kits(c.campus_id)
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.drum_tech_comments c
      where c.id = drum_tech_comment_reactions.comment_id
        and public.can_view_drum_kits(c.campus_id)
    )
  );

create policy "Users can delete accessible drum tech comment reactions"
  on public.drum_tech_comment_reactions
  for delete
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.drum_tech_comments c
      where c.id = drum_tech_comment_reactions.comment_id
        and public.can_view_drum_kits(c.campus_id)
    )
  );

alter publication supabase_realtime add table public.drum_tech_comment_reactions;
