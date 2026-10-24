-- New swap requests must be swaps. Existing cover rows stay so accepted
-- coverage still shows on rosters and pending covers can still be resolved.

create or replace function public.reject_new_cover_requests()
returns trigger
language plpgsql
as $$
begin
  if new.request_type = 'fill_in'
     and (tg_op = 'INSERT' or old.request_type is distinct from 'fill_in') then
    raise exception 'Cover requests are no longer allowed'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists reject_new_cover_requests on public.swap_requests;

create trigger reject_new_cover_requests
before insert or update of request_type on public.swap_requests
for each row
execute function public.reject_new_cover_requests();
