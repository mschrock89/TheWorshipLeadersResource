-- Add column to track welcome email status
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS welcome_email_sent_at timestamp with time zone DEFAULT NULL;