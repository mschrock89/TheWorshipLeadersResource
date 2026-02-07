-- Add submitted_for_approval_at column to track when setlist was submitted for approval
ALTER TABLE public.draft_sets 
ADD COLUMN IF NOT EXISTS submitted_for_approval_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone;

-- Create a table to track setlist approvals
CREATE TABLE public.setlist_approvals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  draft_set_id uuid NOT NULL REFERENCES public.draft_sets(id) ON DELETE CASCADE,
  submitted_by uuid NOT NULL REFERENCES public.profiles(id),
  submitted_at timestamp with time zone NOT NULL DEFAULT now(),
  approver_id uuid REFERENCES public.profiles(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  notes text,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.setlist_approvals ENABLE ROW LEVEL SECURITY;

-- Create policies for setlist_approvals
-- Anyone can view approvals (for transparency)
CREATE POLICY "Users can view setlist approvals" 
ON public.setlist_approvals 
FOR SELECT 
USING (true);

-- Only campus admins and above can submit for approval
CREATE POLICY "Authorized users can submit for approval" 
ON public.setlist_approvals 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'campus_admin', 'campus_worship_pastor', 'network_worship_pastor', 'network_worship_leader')
  )
);

-- Kyle Elkins and admins can update approvals (approve/reject)
CREATE POLICY "Approvers can update approvals" 
ON public.setlist_approvals 
FOR UPDATE 
USING (
  -- Kyle Elkins specifically
  auth.uid() = '22c10f05-955a-498c-b18f-2ac570868b35'::uuid
  OR
  -- Or admins/network worship leaders
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'network_worship_pastor', 'network_worship_leader')
  )
);

-- Create index for faster lookups
CREATE INDEX idx_setlist_approvals_draft_set_id ON public.setlist_approvals(draft_set_id);
CREATE INDEX idx_setlist_approvals_status ON public.setlist_approvals(status);
CREATE INDEX idx_setlist_approvals_submitted_at ON public.setlist_approvals(submitted_at DESC);

-- Enable realtime for approvals
ALTER PUBLICATION supabase_realtime ADD TABLE public.setlist_approvals;