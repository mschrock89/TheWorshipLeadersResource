insert into public.worship_teams (id, name, color, icon, resource_app_key, template_config)
values
  ('9c95bf00-0000-4a00-9000-000000000101', 'Hospitality', '#0EA5E9', 'heart', 'students_hs', '{}'::jsonb),
  ('9c95bf00-0000-4a00-9000-000000000102', 'Hype', '#F97316', 'zap', 'students_hs', '{}'::jsonb),
  ('9c95bf00-0000-4a00-9000-000000000103', 'Prayer', '#8B5CF6', 'star', 'students_hs', '{}'::jsonb),
  ('9c95bf00-0000-4a00-9000-000000000104', 'Cafe', '#22C55E', 'diamond', 'students_hs', '{}'::jsonb),
  ('9c95bf00-0000-4a00-9000-000000000201', 'Hospitality', '#0EA5E9', 'heart', 'students_ms', '{}'::jsonb),
  ('9c95bf00-0000-4a00-9000-000000000202', 'Hype', '#F97316', 'zap', 'students_ms', '{}'::jsonb),
  ('9c95bf00-0000-4a00-9000-000000000203', 'Prayer', '#8B5CF6', 'star', 'students_ms', '{}'::jsonb),
  ('9c95bf00-0000-4a00-9000-000000000204', 'Cafe', '#22C55E', 'diamond', 'students_ms', '{}'::jsonb)
on conflict (id) do update set
  name = excluded.name,
  color = excluded.color,
  icon = excluded.icon,
  resource_app_key = excluded.resource_app_key,
  template_config = excluded.template_config;
