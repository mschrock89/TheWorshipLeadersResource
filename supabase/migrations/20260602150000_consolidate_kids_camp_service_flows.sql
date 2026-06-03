-- Kids Camp service flows were previously stored per-session (kids_camp_morning /
-- kids_camp_afternoon). The service flow generator now produces a single combined
-- "kids_camp" flow per custom-service occurrence that spans both sessions.
--
-- This migration:
--   1. Removes items from morning/afternoon Kids Camp flows so they get regenerated
--      as a combined flow the next time a setlist is published or the editor opens.
--   2. Normalises those flow rows to ministry_type = 'kids_camp'.
--   3. De-duplicates: if multiple flows now share the same
--      (campus_id, service_date, ministry_type='kids_camp', custom_service_id)
--      after normalisation, keep the most-recently-updated one and delete the rest.

-- Step 1: Delete items from Kids Camp morning/afternoon flows that have a custom_service_id
-- (the combined flow will be regenerated with songs from both sessions on next access).
DELETE FROM service_flow_items
WHERE service_flow_id IN (
  SELECT id
  FROM service_flows
  WHERE ministry_type IN ('kids_camp_morning', 'kids_camp_afternoon')
    AND custom_service_id IS NOT NULL
);

-- Step 1.5: Remove any existing 'kids_camp' flows that share the same
-- (campus_id, service_date, custom_service_id) as the rows about to be renamed.
-- Without this, the Step 2 UPDATE hits the unique constraint before Step 3
-- can clean up the duplicates.
DELETE FROM service_flows
WHERE ministry_type = 'kids_camp'
  AND custom_service_id IS NOT NULL
  AND (campus_id, service_date, custom_service_id) IN (
    SELECT campus_id, service_date, custom_service_id
    FROM service_flows
    WHERE ministry_type IN ('kids_camp_morning', 'kids_camp_afternoon')
      AND custom_service_id IS NOT NULL
  );

-- Step 2: Normalise ministry_type → 'kids_camp' for those flows.
UPDATE service_flows
SET ministry_type = 'kids_camp',
    updated_at    = now()
WHERE ministry_type IN ('kids_camp_morning', 'kids_camp_afternoon')
  AND custom_service_id IS NOT NULL;

-- Step 3: De-duplicate — if we now have multiple 'kids_camp' flows for the same
-- (campus_id, service_date, custom_service_id), keep the newest and delete the rest.
DELETE FROM service_flows
WHERE id IN (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY campus_id, service_date, custom_service_id
             ORDER BY updated_at DESC
           ) AS rn
    FROM service_flows
    WHERE ministry_type = 'kids_camp'
      AND custom_service_id IS NOT NULL
  ) ranked
  WHERE rn > 1
);
