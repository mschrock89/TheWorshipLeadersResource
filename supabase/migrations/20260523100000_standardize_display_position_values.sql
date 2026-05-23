-- Store human-readable position names consistently across scheduled rows and
-- eligibility rows. Slot-specific instruments keep the slot label (EG 1, AG 2),
-- while broad roles use their display label (Keys, Bass, Vocalist).

update public.team_members
set position = case
  when position_slot = 'ag_1' then 'AG 1'
  when position_slot = 'ag_2' then 'AG 2'
  when position_slot = 'eg_1' then 'EG 1'
  when position_slot = 'eg_2' then 'EG 2'
  when position_slot = 'eg_3' then 'EG 3'
  when position_slot = 'eg_4' then 'EG 4'
  when position_slot like 'vocalist_%' then 'Vocalist'
  when position in ('keys', 'Keys') then 'Keys'
  when position in ('bass', 'Bass') then 'Bass'
  when position in ('drums', 'Drums') then 'Drums'
  when position in ('pad', 'Pad') then 'Pad'
  when position in ('acoustic_guitar', 'acoustic_1', 'AG 1') then 'AG 1'
  when position in ('acoustic_2', 'AG 2') then 'AG 2'
  when position in ('electric_guitar', 'electric_1', 'EG 1') then 'EG 1'
  when position in ('electric_2', 'EG 2') then 'EG 2'
  when position in ('electric_3', 'EG 3') then 'EG 3'
  when position in ('electric_4', 'EG 4') then 'EG 4'
  when position in ('vocalist', 'Vocalist 1', 'Vocalist 2', 'Vocalist 3', 'Vocalist 4', 'Vocalist 5', 'Vocalist 6', 'Vocalist 7', 'Vocalist 8') then 'Vocalist'
  when position in ('sound_tech', 'foh', 'FOH') then 'FOH'
  when position in ('mon', 'MON') then 'MON'
  when position in ('media', 'Lyrics') then 'Lyrics'
  when position = 'audio_shadow' then 'Audio Shadow'
  when position = 'drum_tech' then 'Drum Tech'
  when position = 'closing_prayer' then 'Closing Prayer'
  when position = 'announcement' then 'Announcements'
  when position = 'broadcast' then 'Broadcast'
  when position = 'director' then 'Director'
  when position = 'graphics' then 'Graphics'
  when position = 'lighting' then 'Lighting'
  when position = 'piano' then 'Piano'
  when position = 'producer' then 'Producer'
  when position = 'switcher' then 'Switcher'
  when position = 'other_instrument' then 'Other Instrument'
  when position = 'camera_1' then 'Camera 1'
  when position = 'camera_2' then 'Camera 2'
  when position = 'camera_3' then 'Camera 3'
  when position = 'camera_4' then 'Camera 4'
  when position = 'camera_5' then 'Camera 5'
  when position = 'camera_6' then 'Camera 6'
  when position = 'tri_pod_camera' then 'Tri-Pod Camera'
  when position = 'hand_held_camera' then 'Hand-Held Camera'
  else position
end;

update public.team_member_date_overrides
set position = case
  when position_slot = 'ag_1' then 'AG 1'
  when position_slot = 'ag_2' then 'AG 2'
  when position_slot = 'eg_1' then 'EG 1'
  when position_slot = 'eg_2' then 'EG 2'
  when position_slot = 'eg_3' then 'EG 3'
  when position_slot = 'eg_4' then 'EG 4'
  when position_slot like 'vocalist_%' then 'Vocalist'
  when position in ('keys', 'Keys') then 'Keys'
  when position in ('bass', 'Bass') then 'Bass'
  when position in ('drums', 'Drums') then 'Drums'
  when position in ('pad', 'Pad') then 'Pad'
  when position in ('acoustic_guitar', 'acoustic_1', 'AG 1') then 'AG 1'
  when position in ('acoustic_2', 'AG 2') then 'AG 2'
  when position in ('electric_guitar', 'electric_1', 'EG 1') then 'EG 1'
  when position in ('electric_2', 'EG 2') then 'EG 2'
  when position in ('electric_3', 'EG 3') then 'EG 3'
  when position in ('electric_4', 'EG 4') then 'EG 4'
  when position in ('vocalist', 'Vocalist 1', 'Vocalist 2', 'Vocalist 3', 'Vocalist 4', 'Vocalist 5', 'Vocalist 6', 'Vocalist 7', 'Vocalist 8') then 'Vocalist'
  when position in ('sound_tech', 'foh', 'FOH') then 'FOH'
  when position in ('mon', 'MON') then 'MON'
  when position in ('media', 'Lyrics') then 'Lyrics'
  when position = 'audio_shadow' then 'Audio Shadow'
  when position = 'drum_tech' then 'Drum Tech'
  when position = 'closing_prayer' then 'Closing Prayer'
  when position = 'announcement' then 'Announcements'
  when position = 'broadcast' then 'Broadcast'
  when position = 'director' then 'Director'
  when position = 'graphics' then 'Graphics'
  when position = 'lighting' then 'Lighting'
  when position = 'piano' then 'Piano'
  when position = 'producer' then 'Producer'
  when position = 'switcher' then 'Switcher'
  when position = 'other_instrument' then 'Other Instrument'
  when position = 'camera_1' then 'Camera 1'
  when position = 'camera_2' then 'Camera 2'
  when position = 'camera_3' then 'Camera 3'
  when position = 'camera_4' then 'Camera 4'
  when position = 'camera_5' then 'Camera 5'
  when position = 'camera_6' then 'Camera 6'
  when position = 'tri_pod_camera' then 'Tri-Pod Camera'
  when position = 'hand_held_camera' then 'Hand-Held Camera'
  else position
end;

with mapped_positions as (
  select
    id,
    user_id,
    campus_id,
    ministry_type,
    position,
    case position
      when 'keys' then 'Keys'
      when 'bass' then 'Bass'
      when 'drums' then 'Drums'
      when 'pad' then 'Pad'
      when 'acoustic_guitar' then 'AG 1'
      when 'acoustic_1' then 'AG 1'
      when 'acoustic_2' then 'AG 2'
      when 'electric_guitar' then 'EG 1'
      when 'electric_1' then 'EG 1'
      when 'electric_2' then 'EG 2'
      when 'electric_3' then 'EG 3'
      when 'electric_4' then 'EG 4'
      when 'vocalist' then 'Vocalist'
      when 'sound_tech' then 'FOH'
      when 'mon' then 'MON'
      when 'media' then 'Lyrics'
      when 'audio_shadow' then 'Audio Shadow'
      when 'drum_tech' then 'Drum Tech'
      when 'closing_prayer' then 'Closing Prayer'
      when 'announcement' then 'Announcements'
      when 'broadcast' then 'Broadcast'
      when 'director' then 'Director'
      when 'graphics' then 'Graphics'
      when 'lighting' then 'Lighting'
      when 'piano' then 'Piano'
      when 'producer' then 'Producer'
      when 'switcher' then 'Switcher'
      when 'other_instrument' then 'Other Instrument'
      when 'camera_1' then 'Camera 1'
      when 'camera_2' then 'Camera 2'
      when 'camera_3' then 'Camera 3'
      when 'camera_4' then 'Camera 4'
      when 'camera_5' then 'Camera 5'
      when 'camera_6' then 'Camera 6'
      when 'tri_pod_camera' then 'Tri-Pod Camera'
      when 'hand_held_camera' then 'Hand-Held Camera'
      else position
    end as target_position
  from public.user_campus_ministry_positions
),
ranked_positions as (
  select
    *,
    row_number() over (
      partition by user_id, campus_id, ministry_type, target_position
      order by case when position = target_position then 0 else 1 end, id
    ) as row_rank
  from mapped_positions
)
delete from public.user_campus_ministry_positions ucmp
using ranked_positions ranked
where ucmp.id = ranked.id
  and ranked.row_rank > 1;

update public.user_campus_ministry_positions
set position = case position
  when 'keys' then 'Keys'
  when 'bass' then 'Bass'
  when 'drums' then 'Drums'
  when 'pad' then 'Pad'
  when 'acoustic_guitar' then 'AG 1'
  when 'acoustic_1' then 'AG 1'
  when 'acoustic_2' then 'AG 2'
  when 'electric_guitar' then 'EG 1'
  when 'electric_1' then 'EG 1'
  when 'electric_2' then 'EG 2'
  when 'electric_3' then 'EG 3'
  when 'electric_4' then 'EG 4'
  when 'vocalist' then 'Vocalist'
  when 'sound_tech' then 'FOH'
  when 'mon' then 'MON'
  when 'media' then 'Lyrics'
  when 'audio_shadow' then 'Audio Shadow'
  when 'drum_tech' then 'Drum Tech'
  when 'closing_prayer' then 'Closing Prayer'
  when 'announcement' then 'Announcements'
  when 'broadcast' then 'Broadcast'
  when 'director' then 'Director'
  when 'graphics' then 'Graphics'
  when 'lighting' then 'Lighting'
  when 'piano' then 'Piano'
  when 'producer' then 'Producer'
  when 'switcher' then 'Switcher'
  when 'other_instrument' then 'Other Instrument'
  when 'camera_1' then 'Camera 1'
  when 'camera_2' then 'Camera 2'
  when 'camera_3' then 'Camera 3'
  when 'camera_4' then 'Camera 4'
  when 'camera_5' then 'Camera 5'
  when 'camera_6' then 'Camera 6'
  when 'tri_pod_camera' then 'Tri-Pod Camera'
  when 'hand_held_camera' then 'Hand-Held Camera'
  else position
end;
