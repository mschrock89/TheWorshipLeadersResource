-- Cleanup: a client bug carried weekend rundown form state from one weekend
-- into another when switching dates, silently saving feedback rows for songs
-- (and song/vocalist pairs) that were never part of that weekend's set. This
-- removes those stale rows so past-rundown notes show accurate dates.
--
-- Safety: rows are only deleted when at least one weekend draft set exists
-- for the rundown's campus and weekend, so feedback is never removed just
-- because set data is missing.

delete from public.weekend_rundown_vocal_feedback vf
using public.weekend_rundowns wr
where wr.id = vf.rundown_id
  and wr.resource_app_key = 'worship'
  and exists (
    select 1
    from public.draft_sets ds
    where ds.campus_id = wr.campus_id
      and ds.ministry_type = 'weekend'
      and ds.plan_date in (wr.weekend_date, wr.weekend_date - 1)
  )
  and not exists (
    select 1
    from public.draft_sets ds
    join public.draft_set_songs dss on dss.draft_set_id = ds.id
    left join public.draft_set_song_vocalists dsv on dsv.draft_set_song_id = dss.id
    where ds.campus_id = wr.campus_id
      and ds.ministry_type = 'weekend'
      and ds.plan_date in (wr.weekend_date, wr.weekend_date - 1)
      and dss.song_id = vf.song_id
      and (dsv.vocalist_id = vf.vocalist_id or dss.vocalist_id = vf.vocalist_id)
  );

delete from public.weekend_rundown_song_feedback sf
using public.weekend_rundowns wr
where wr.id = sf.rundown_id
  and wr.resource_app_key = 'worship'
  and exists (
    select 1
    from public.draft_sets ds
    where ds.campus_id = wr.campus_id
      and ds.ministry_type = 'weekend'
      and ds.plan_date in (wr.weekend_date, wr.weekend_date - 1)
  )
  and not exists (
    select 1
    from public.draft_sets ds
    join public.draft_set_songs dss on dss.draft_set_id = ds.id
    where ds.campus_id = wr.campus_id
      and ds.ministry_type = 'weekend'
      and ds.plan_date in (wr.weekend_date, wr.weekend_date - 1)
      and dss.song_id = sf.song_id
  );
