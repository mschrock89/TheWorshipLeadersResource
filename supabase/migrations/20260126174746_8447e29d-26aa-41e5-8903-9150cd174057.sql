-- Add ministry_type column to break_requests
ALTER TABLE public.break_requests 
ADD COLUMN ministry_type text;

-- Add comment to explain the column
COMMENT ON COLUMN public.break_requests.ministry_type IS 'Optional ministry type the break request applies to (e.g., weekend, student)';