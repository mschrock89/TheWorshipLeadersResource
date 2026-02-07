-- Change single time columns to arrays for multiple service times
ALTER TABLE campuses 
  ALTER COLUMN saturday_service_time TYPE text[] USING CASE 
    WHEN saturday_service_time IS NOT NULL THEN ARRAY[saturday_service_time::text] 
    ELSE NULL 
  END;

ALTER TABLE campuses 
  ALTER COLUMN sunday_service_time TYPE text[] USING CASE 
    WHEN sunday_service_time IS NOT NULL THEN ARRAY[sunday_service_time::text] 
    ELSE NULL 
  END;