-- Add request_type column to break_requests table
ALTER TABLE public.break_requests 
ADD COLUMN request_type text NOT NULL DEFAULT 'need_break';

-- Add a check constraint to ensure valid values
ALTER TABLE public.break_requests 
ADD CONSTRAINT break_requests_request_type_check 
CHECK (request_type IN ('need_break', 'willing_break'));