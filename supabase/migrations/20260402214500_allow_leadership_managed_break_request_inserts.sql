drop policy if exists "Users can create their own break requests" on public.break_requests;
drop policy if exists "Leadership can create break requests" on public.break_requests;

create policy "Leadership can create break requests"
on public.break_requests
for insert
with check (
  auth.uid() = user_id
  or public.can_review_break_request(user_id)
);
