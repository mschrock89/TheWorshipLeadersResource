
-- Create a table to track when users dismiss/pass on open swap requests
CREATE TABLE public.swap_request_dismissals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  swap_request_id UUID NOT NULL REFERENCES public.swap_requests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  dismissed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(swap_request_id, user_id)
);

-- Enable RLS
ALTER TABLE public.swap_request_dismissals ENABLE ROW LEVEL SECURITY;

-- Users can view their own dismissals
CREATE POLICY "Users can view own dismissals"
ON public.swap_request_dismissals
FOR SELECT
USING (auth.uid() = user_id);

-- Users can create their own dismissals
CREATE POLICY "Users can dismiss requests"
ON public.swap_request_dismissals
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own dismissals (if they want to un-dismiss)
CREATE POLICY "Users can remove own dismissals"
ON public.swap_request_dismissals
FOR DELETE
USING (auth.uid() = user_id);
