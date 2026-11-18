-- Replace the all-ministry default with an explicit Weekend Worship rule.
-- weekend, weekend_team, and sunday_am are the same ministry in the app;
-- the rule is stored as weekend. Ministries with no rule publish immediately.

INSERT INTO public.setlist_approval_rules (
  resource_app,
  campus_id,
  ministry_type,
  requires_approval,
  approver_user_id,
  note
)
SELECT
  existing.resource_app,
  existing.campus_id,
  'weekend',
  existing.requires_approval,
  COALESCE(
    existing.approver_user_id,
    (SELECT id FROM auth.users WHERE id = '22c10f05-955a-498c-b18f-2ac570868b35')
  ),
  'Weekend Worship requires approval.'
FROM public.setlist_approval_rules existing
WHERE existing.ministry_type IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.setlist_approval_rules weekend
    WHERE weekend.resource_app = existing.resource_app
      AND weekend.campus_id IS NOT DISTINCT FROM existing.campus_id
      AND weekend.ministry_type = 'weekend'
  );

DELETE FROM public.setlist_approval_rules
WHERE ministry_type IS NULL;
