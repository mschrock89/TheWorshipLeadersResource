create or replace function public.can_view_drum_kits(_campus_id uuid)
returns boolean
language sql
stable
as $$
  select
    auth.uid() is not null
    and (
      has_role(auth.uid(), 'admin'::app_role)
      or has_role(auth.uid(), 'campus_admin'::app_role)
      or has_role(auth.uid(), 'campus_worship_pastor'::app_role)
      or has_role(auth.uid(), 'student_worship_pastor'::app_role)
      or exists (
        select 1
        from public.user_campuses uc
        where uc.user_id = auth.uid()
          and uc.campus_id = _campus_id
      )
      or exists (
        select 1
        from public.user_campus_ministry_positions ucmp
        where ucmp.user_id = auth.uid()
          and ucmp.campus_id = _campus_id
          and ucmp.position in ('drums', 'drum_tech')
      )
    );
$$;

drop policy if exists "Authenticated users can view drum tech comments" on public.drum_tech_comments;
drop policy if exists "Authenticated users can create drum tech comments" on public.drum_tech_comments;
drop policy if exists "Users can update their own drum tech comments" on public.drum_tech_comments;
drop policy if exists "Users can delete their own drum tech comments or admins can delete any" on public.drum_tech_comments;

create policy "Accessible users can view drum tech comments"
  on public.drum_tech_comments
  for select
  using (public.can_view_drum_kits(campus_id));

create policy "Accessible users can create drum tech comments"
  on public.drum_tech_comments
  for insert
  with check (
    auth.uid() = user_id
    and public.can_view_drum_kits(campus_id)
  );

create policy "Users can update accessible drum tech comments"
  on public.drum_tech_comments
  for update
  using (
    (auth.uid() = user_id and public.can_view_drum_kits(campus_id))
    or has_role(auth.uid(), 'admin'::app_role)
  )
  with check (
    (auth.uid() = user_id and public.can_view_drum_kits(campus_id))
    or has_role(auth.uid(), 'admin'::app_role)
  );

create policy "Users can delete accessible drum tech comments"
  on public.drum_tech_comments
  for delete
  using (
    (auth.uid() = user_id and public.can_view_drum_kits(campus_id))
    or has_role(auth.uid(), 'admin'::app_role)
  );
