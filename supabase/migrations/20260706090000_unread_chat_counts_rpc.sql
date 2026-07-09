-- The unread-message badge counted unreads with one HEAD request per
-- campus x chat-ministry pair (35-55 requests per page load, run twice because
-- both the bottom nav and the Chat page mount the hook). Replace the fan-out
-- with a single grouped query.
--
-- Uses auth.uid() rather than a user parameter so callers can only ever read
-- their own counts. Weekend aliases are normalized to 'weekend' to match the
-- client's normalizeChatMinistryType and how message_read_status rows are keyed.

CREATE OR REPLACE FUNCTION public.get_unread_chat_counts(
  p_resource_app_key text,
  p_camp_instance_id uuid DEFAULT NULL
)
RETURNS TABLE (campus_id uuid, ministry_type text, unread_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH scoped_messages AS (
    SELECT
      cm.campus_id,
      CASE
        WHEN cm.ministry_type IN ('weekend_team', 'sunday_am') THEN 'weekend'
        ELSE cm.ministry_type
      END AS ministry_type,
      cm.created_at
    FROM chat_messages cm
    JOIN user_campuses uc
      ON uc.campus_id = cm.campus_id
     AND uc.user_id = auth.uid()
    WHERE cm.user_id <> auth.uid()
      AND (
        (p_camp_instance_id IS NOT NULL AND cm.camp_instance_id = p_camp_instance_id)
        OR (
          p_camp_instance_id IS NULL
          AND cm.resource_app_key = p_resource_app_key
          AND cm.camp_instance_id IS NULL
        )
      )
  )
  SELECT
    sm.campus_id,
    sm.ministry_type,
    COUNT(*)::bigint AS unread_count
  FROM scoped_messages sm
  LEFT JOIN message_read_status mrs
    ON mrs.user_id = auth.uid()
   AND mrs.campus_id = sm.campus_id
   AND mrs.ministry_type = sm.ministry_type
   AND mrs.resource_app_key = p_resource_app_key
   AND (
     (p_camp_instance_id IS NOT NULL AND mrs.camp_instance_id = p_camp_instance_id)
     OR (p_camp_instance_id IS NULL AND mrs.camp_instance_id IS NULL)
   )
  WHERE mrs.last_read_at IS NULL OR sm.created_at > mrs.last_read_at
  GROUP BY sm.campus_id, sm.ministry_type;
$$;

GRANT EXECUTE ON FUNCTION public.get_unread_chat_counts(text, uuid) TO authenticated;
