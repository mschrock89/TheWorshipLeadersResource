-- Add new base roles to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'video_director';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'production_manager';