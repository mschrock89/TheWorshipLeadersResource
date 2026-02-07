-- Add request_type column to swap_requests to distinguish between swap and fill-in requests
ALTER TABLE public.swap_requests 
ADD COLUMN request_type text NOT NULL DEFAULT 'swap' 
CHECK (request_type IN ('swap', 'fill_in'));