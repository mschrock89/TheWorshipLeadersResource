-- Step 1: Add new role values to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'campus_worship_pastor';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'student_worship_pastor';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'volunteer';