-- Create enum for swap request status
CREATE TYPE public.swap_request_status AS ENUM ('pending', 'accepted', 'declined', 'cancelled');

-- Create swap_requests table
CREATE TABLE public.swap_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  original_date date NOT NULL,
  swap_date date, -- null for open requests
  target_user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE, -- null for open requests
  position text NOT NULL,
  team_id uuid NOT NULL REFERENCES public.worship_teams(id) ON DELETE CASCADE,
  status public.swap_request_status NOT NULL DEFAULT 'pending',
  accepted_by_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  message text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  resolved_at timestamp with time zone
);

-- Enable RLS
ALTER TABLE public.swap_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Users can view swap requests:
-- 1. Their own requests (as requester)
-- 2. Requests directed at them (as target)
-- 3. Open requests for their position (target_user_id is null)
CREATE POLICY "Users can view relevant swap requests"
ON public.swap_requests
FOR SELECT
USING (
  auth.uid() = requester_id
  OR auth.uid() = target_user_id
  OR (
    target_user_id IS NULL 
    AND position IN (
      SELECT tm.position FROM public.team_members tm WHERE tm.user_id = auth.uid()
    )
  )
  OR has_role(auth.uid(), 'leader'::app_role)
);

-- Users can create swap requests for their own scheduled dates
CREATE POLICY "Users can create own swap requests"
ON public.swap_requests
FOR INSERT
WITH CHECK (
  auth.uid() = requester_id
  AND EXISTS (
    SELECT 1 FROM public.team_members tm
    JOIN public.team_schedule ts ON tm.team_id = ts.team_id
    WHERE tm.user_id = auth.uid()
    AND ts.schedule_date = original_date
    AND tm.team_id = swap_requests.team_id
  )
);

-- Users can update swap requests they're involved with
CREATE POLICY "Users can update relevant swap requests"
ON public.swap_requests
FOR UPDATE
USING (
  -- Requester can cancel their own pending requests
  (auth.uid() = requester_id AND status = 'pending')
  -- Target can accept/decline direct requests
  OR (auth.uid() = target_user_id AND status = 'pending')
  -- Users with same position can accept open requests
  OR (
    target_user_id IS NULL 
    AND status = 'pending'
    AND auth.uid() != requester_id
    AND position IN (
      SELECT tm.position FROM public.team_members tm WHERE tm.user_id = auth.uid()
    )
  )
  OR has_role(auth.uid(), 'leader'::app_role)
);

-- Users can delete their own cancelled/declined requests
CREATE POLICY "Users can delete own resolved requests"
ON public.swap_requests
FOR DELETE
USING (
  auth.uid() = requester_id 
  AND status IN ('cancelled', 'declined')
);

-- Enable realtime for swap_requests
ALTER PUBLICATION supabase_realtime ADD TABLE public.swap_requests;