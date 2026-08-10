-- Allow owners to edit and delete their own approved break/blackout requests
-- (previously limited to pending only, which blocked blackouts after auto-approval).

drop policy if exists "Users can update their own pending requests" on public.break_requests;
create policy "Users can update their own pending or approved requests"
on public.break_requests
for update
using (auth.uid() = user_id and status in ('pending', 'approved'))
with check (auth.uid() = user_id and status in ('pending', 'approved'));

drop policy if exists "Users can delete their own pending requests" on public.break_requests;
create policy "Users can delete their own pending or approved requests"
on public.break_requests
for delete
using (auth.uid() = user_id and status in ('pending', 'approved'));

-- Owners must not self-approve or otherwise change review status on full-trimester breaks.
-- Blackout rows continue to be forced to approved by auto_approve_blackout_break_request.
create or replace function public.preserve_owner_break_request_review_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if new.request_scope = 'blackout_dates' then
    return new;
  end if;

  if auth.uid() is distinct from new.user_id then
    return new;
  end if;

  if public.can_review_break_request_row(new.user_id, new.rotation_period_id) then
    return new;
  end if;

  -- Owners may edit content, but review fields stay under leadership control.
  -- Exception: editing an approved full-trimester break reopens it as pending.
  if old.status = 'approved'
     and (
       new.reason is distinct from old.reason
       or new.request_type is distinct from old.request_type
       or new.ministry_type is distinct from old.ministry_type
       or new.rotation_period_id is distinct from old.rotation_period_id
       or new.request_scope is distinct from old.request_scope
     ) then
    new.status := 'pending';
    new.reviewed_by := null;
    new.reviewed_at := null;
  else
    new.status := old.status;
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
  end if;

  return new;
end;
$function$;

drop trigger if exists preserve_owner_break_request_review_fields on public.break_requests;
create trigger preserve_owner_break_request_review_fields
before update on public.break_requests
for each row
execute function public.preserve_owner_break_request_review_fields();
