alter table public.life_groups
drop constraint if exists life_groups_resource_grade_chk;

alter table public.life_groups
add constraint life_groups_resource_grade_chk
check (
  (resource_app_key = 'students_ms' and grade_level = 8)
  or (resource_app_key = 'students_hs' and grade_level between 9 and 12)
);
