-- Add service configuration columns to campuses table
ALTER TABLE campuses ADD COLUMN has_saturday_service boolean DEFAULT false;
ALTER TABLE campuses ADD COLUMN has_sunday_service boolean DEFAULT true;
ALTER TABLE campuses ADD COLUMN saturday_service_time time;
ALTER TABLE campuses ADD COLUMN sunday_service_time time;

-- Set Murfreesboro Central and Cannon County to have Saturday+Sunday
UPDATE campuses 
SET has_saturday_service = true, 
    has_sunday_service = true,
    saturday_service_time = '17:00:00',
    sunday_service_time = '09:00:00'
WHERE id IN (
  'd70b980c-27a4-43b5-800b-1c58899ece90',
  '57ddbb2e-6cc5-48f1-a813-f5bbfa8ce5ad'
);

-- Ensure all others have Sunday-only with default time
UPDATE campuses 
SET has_saturday_service = false, 
    has_sunday_service = true,
    sunday_service_time = '10:00:00'
WHERE id NOT IN (
  'd70b980c-27a4-43b5-800b-1c58899ece90',
  '57ddbb2e-6cc5-48f1-a813-f5bbfa8ce5ad'
);