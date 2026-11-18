-- MS/HS Worship and Evident publish without setlist approval, matching
-- Kids Camp, HS Worship, MS Worship, and MS Worship Weekend.
-- Weekend Worship stays on the default rule, which still requires approval.

UPDATE public.setlist_approval_rules
SET
  requires_approval = false,
  approver_user_id = NULL,
  note = 'Publishes without approval.',
  updated_at = now()
WHERE resource_app = 'worship'
  AND campus_id IS NULL
  AND ministry_type IN ('ms_hs', 'evident');

INSERT INTO public.setlist_approval_rules (
  resource_app,
  campus_id,
  ministry_type,
  requires_approval,
  approver_user_id,
  note
)
SELECT
  'worship',
  NULL,
  ministry_type,
  false,
  NULL,
  'Publishes without approval.'
FROM (VALUES ('ms_hs'), ('evident')) AS ministries(ministry_type)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.setlist_approval_rules existing
  WHERE existing.resource_app = 'worship'
    AND existing.campus_id IS NULL
    AND existing.ministry_type = ministries.ministry_type
);
