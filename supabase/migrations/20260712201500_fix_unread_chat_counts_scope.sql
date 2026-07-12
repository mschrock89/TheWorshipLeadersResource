-- Fix inflated chat unread badges (often showing "99+").
--
-- get_unread_chat_counts is SECURITY DEFINER, so it bypasses chat RLS. The
-- previous version only required campus membership (user_campuses) and treated
-- a missing message_read_status row as "every historical message is unread".
-- That counted ministries the user cannot open and years of backlog they never
-- saw — while the Chat page itself treats a missing last_read_at as 0 unread.
--
-- Align the RPC with chat access + Chat page semantics:
--   1. Scope app chats with user_can_access_chat (and camp chats with
--      user_can_access_camp_instance).
--   2. Only count messages after an existing last_read_at cursor.
--   3. Normalize weekend ministry aliases on both sides of the join.

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
      public.normalize_chat_ministry_type(cm.ministry_type) AS ministry_type,
      cm.created_at
    FROM chat_messages cm
    WHERE cm.user_id <> auth.uid()
      AND (
        (
          p_camp_instance_id IS NOT NULL
          AND cm.camp_instance_id = p_camp_instance_id
          AND public.user_can_access_camp_instance(auth.uid(), p_camp_instance_id)
        )
        OR (
          p_camp_instance_id IS NULL
          AND cm.resource_app_key = p_resource_app_key
          AND cm.camp_instance_id IS NULL
          AND public.user_can_access_chat(
            auth.uid(),
            cm.campus_id,
            coalesce(cm.ministry_type, 'weekend')
          )
        )
      )
  )
  SELECT
    sm.campus_id,
    sm.ministry_type,
    COUNT(*)::bigint AS unread_count
  FROM scoped_messages sm
  INNER JOIN message_read_status mrs
    ON mrs.user_id = auth.uid()
   AND mrs.campus_id = sm.campus_id
   AND public.normalize_chat_ministry_type(mrs.ministry_type) = sm.ministry_type
   AND mrs.resource_app_key = p_resource_app_key
   AND (
     (p_camp_instance_id IS NOT NULL AND mrs.camp_instance_id = p_camp_instance_id)
     OR (p_camp_instance_id IS NULL AND mrs.camp_instance_id IS NULL)
   )
  WHERE sm.created_at > mrs.last_read_at
  GROUP BY sm.campus_id, sm.ministry_type;
$$;

GRANT EXECUTE ON FUNCTION public.get_unread_chat_counts(text, uuid) TO authenticated;
