drop policy if exists "Leadership can delete managed sits" on public.break_requests;

create policy "Leadership can delete managed sits"
on public.break_requests
for delete
using (
  public.can_review_break_request(user_id)
  and request_scope = 'full_trimester'
  and status = 'approved'
  and coalesce(reason, '') like 'Sat from Team Builder%'
);
