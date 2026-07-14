-- Service Flow tables require a concrete campus foreign key. Move Student Camp
-- templates and date-specific flows to the Network Wide sentinel campus so they
-- remain shared without using a nullable campus_id.
DO $$
DECLARE
  network_wide_campus_id uuid;
  student_camp_ministries text[] := ARRAY[
    'student_camp', 'student_camp_morning', 'student_camp_evening'
  ];
BEGIN
  SELECT id
    INTO network_wide_campus_id
    FROM public.campuses
   WHERE is_network_wide = true
   ORDER BY created_at
   LIMIT 1;

  IF network_wide_campus_id IS NULL THEN
    RAISE EXCEPTION 'Network Wide campus is required before moving Student Camp service flows';
  END IF;

  UPDATE public.service_flow_templates
     SET campus_id = network_wide_campus_id
   WHERE ministry_type = ANY (student_camp_ministries)
     AND campus_id <> network_wide_campus_id;

  UPDATE public.service_flows
     SET campus_id = network_wide_campus_id
   WHERE ministry_type = ANY (student_camp_ministries)
     AND campus_id <> network_wide_campus_id;
END $$;
