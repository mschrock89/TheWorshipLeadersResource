-- Rename student worship ministry labels while preserving existing ministry_type keys.

UPDATE public.custom_services
SET service_name = CASE ministry_type
  WHEN 'encounter' THEN 'HS Worship'
  WHEN 'eon' THEN 'MS Worship'
  WHEN 'eon_weekend' THEN 'MS Worship Weekend'
  ELSE service_name
END
WHERE ministry_type IN ('encounter', 'eon', 'eon_weekend')
  AND service_name IN ('Encounter', 'EON', 'EON Weekend');

CREATE OR REPLACE FUNCTION public.get_prior_song_uses(
  _song_ids uuid[],
  _before_date date,
  _campus_ids uuid[] DEFAULT NULL,
  _ministry_types text[] DEFAULT NULL
)
RETURNS TABLE(song_id uuid, usage_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _has_service_plans boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'service_plans'
  ) INTO _has_service_plans;

  IF _has_service_plans THEN
    RETURN QUERY
    WITH prior_plans AS (
      SELECT sp.id
      FROM service_plans sp
      WHERE sp.plan_date < _before_date
        AND (_campus_ids IS NULL OR sp.campus_id = ANY(_campus_ids) OR (sp.campus_id IS NULL AND _campus_ids IS NOT NULL))
        AND (
          _ministry_types IS NULL
          OR (
            CASE
              WHEN lower(sp.service_type_name) LIKE '%ms worship%' OR lower(sp.service_type_name) LIKE '%eon%' THEN 'eon'
              WHEN lower(sp.service_type_name) LIKE '%hs worship%' OR lower(sp.service_type_name) LIKE '%encounter%' THEN 'encounter'
              WHEN lower(sp.service_type_name) LIKE '%evident%' THEN 'evident'
              WHEN lower(sp.service_type_name) ~ ' er |^er | er$' THEN 'er'
              ELSE 'weekend'
            END
          ) = ANY(_ministry_types)
        )
    ),
    plan_counts AS (
      SELECT ps.song_id, count(*)::bigint AS cnt
      FROM plan_songs ps
      JOIN prior_plans pp ON ps.plan_id = pp.id
      WHERE ps.song_id = ANY(_song_ids)
      GROUP BY ps.song_id
    ),
    prior_drafts AS (
      SELECT ds.id
      FROM draft_sets ds
      WHERE ds.plan_date < _before_date
        AND ds.status = 'published'
        AND (_campus_ids IS NULL OR ds.campus_id = ANY(_campus_ids))
        AND (_ministry_types IS NULL OR ds.ministry_type = ANY(_ministry_types))
    ),
    draft_counts AS (
      SELECT dss.song_id, count(*)::bigint AS cnt
      FROM draft_set_songs dss
      JOIN prior_drafts pd ON dss.draft_set_id = pd.id
      WHERE dss.song_id = ANY(_song_ids)
      GROUP BY dss.song_id
    ),
    combined AS (
      SELECT pc.song_id AS song_id, pc.cnt AS cnt
      FROM plan_counts pc
      UNION ALL
      SELECT dc.song_id AS song_id, dc.cnt AS cnt
      FROM draft_counts dc
    )
    SELECT c.song_id AS song_id, sum(c.cnt)::bigint AS usage_count
    FROM combined c
    GROUP BY c.song_id;
  ELSE
    RETURN QUERY
    WITH prior_drafts AS (
      SELECT ds.id
      FROM draft_sets ds
      WHERE ds.plan_date < _before_date
        AND ds.status = 'published'
        AND (_campus_ids IS NULL OR ds.campus_id = ANY(_campus_ids))
        AND (_ministry_types IS NULL OR ds.ministry_type = ANY(_ministry_types))
    ),
    draft_counts AS (
      SELECT dss.song_id, count(*)::bigint AS cnt
      FROM draft_set_songs dss
      JOIN prior_drafts pd ON dss.draft_set_id = pd.id
      WHERE dss.song_id = ANY(_song_ids)
      GROUP BY dss.song_id
    )
    SELECT dc.song_id AS song_id, dc.cnt AS usage_count
    FROM draft_counts dc;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_prior_song_uses(uuid[], date, uuid[], text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.notify_chat_message_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  supabase_url text;
  service_key text;
  sender_name text;
  campus_name text;
  ministry_label text;
  message_preview text;
  recipient_user_ids jsonb;
BEGIN
  SELECT full_name INTO sender_name
  FROM public.profiles
  WHERE id = new.user_id;

  SELECT name INTO campus_name
  FROM public.campuses
  WHERE id = new.campus_id;

  ministry_label := CASE coalesce(new.ministry_type, 'weekend')
    WHEN 'weekend' THEN 'Weekend'
    WHEN 'encounter' THEN 'HS Worship'
    WHEN 'evident' THEN 'Evident'
    WHEN 'eon' THEN 'MS Worship'
    WHEN 'production' THEN 'Production'
    WHEN 'video' THEN 'Video'
    ELSE coalesce(new.ministry_type, 'weekend')
  END;

  message_preview := nullif(btrim(coalesce(new.content, '')), '');
  IF message_preview IS NULL THEN
    IF coalesce(array_length(new.attachments, 1), 0) > 1 THEN
      message_preview := 'Sent attachments';
    ELSIF coalesce(array_length(new.attachments, 1), 0) = 1 THEN
      message_preview := 'Sent an attachment';
    ELSE
      message_preview := 'Sent a message';
    END IF;
  ELSIF length(message_preview) > 120 THEN
    message_preview := left(message_preview, 117) || '...';
  END IF;

  SELECT jsonb_agg(profile.id::text)
  INTO recipient_user_ids
  FROM public.get_profiles_for_chat_mention(new.campus_id, coalesce(new.ministry_type, 'weekend')) AS profile
  WHERE profile.id IS NOT NULL
    AND profile.id <> new.user_id;

  IF recipient_user_ids IS NULL OR jsonb_array_length(recipient_user_ids) = 0 THEN
    RETURN new;
  END IF;

  BEGIN
    supabase_url := current_setting('app.settings.supabase_url', true);
  EXCEPTION WHEN others THEN
    supabase_url := NULL;
  END;

  BEGIN
    service_key := current_setting('app.settings.service_role_key', true);
  EXCEPTION WHEN others THEN
    service_key := NULL;
  END;

  IF supabase_url IS NULL OR service_key IS NULL THEN
    BEGIN
      SELECT decrypted_secret INTO supabase_url
      FROM vault.decrypted_secrets
      WHERE name = 'supabase_url'
      LIMIT 1;

      SELECT decrypted_secret INTO service_key
      FROM vault.decrypted_secrets
      WHERE name = 'service_role_key'
      LIMIT 1;
    EXCEPTION WHEN others THEN
      supabase_url := NULL;
      service_key := NULL;
    END;
  END IF;

  IF supabase_url IS NULL OR service_key IS NULL THEN
    RAISE WARNING 'notify_chat_message_insert skipped for % because Supabase config is missing', new.id;
    RETURN new;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := supabase_url || '/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      body := jsonb_build_object(
        'title', coalesce(sender_name, 'Someone') || ' in ' || trim(coalesce(campus_name, 'your campus') || ' ' || ministry_label),
        'message', message_preview,
        'url', '/chat',
        'tag', 'chat-message-' || new.id::text,
        'userIds', recipient_user_ids,
        'contextType', 'chat-message',
        'contextId', new.id::text,
        'createdBy', new.user_id::text,
        'metadata', jsonb_build_object(
          'campusId', new.campus_id,
          'ministryType', new.ministry_type,
          'messageId', new.id
        )
      )
    );
  EXCEPTION WHEN others THEN
    RAISE WARNING 'notify_chat_message_insert push dispatch failed for %: %', new.id, sqlerrm;
  END;

  RETURN new;
EXCEPTION WHEN others THEN
  RAISE WARNING 'notify_chat_message_insert failed for %: %', new.id, sqlerrm;
  RETURN new;
END;
$$;
