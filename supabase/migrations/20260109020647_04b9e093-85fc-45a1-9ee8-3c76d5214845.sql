-- Create break_requests table for volunteers to request time off
CREATE TABLE public.break_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rotation_period_id UUID NOT NULL REFERENCES public.rotation_periods(id) ON DELETE CASCADE,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, rotation_period_id)
);

-- Enable RLS
ALTER TABLE public.break_requests ENABLE ROW LEVEL SECURITY;

-- Users can view their own break requests
CREATE POLICY "Users can view their own break requests"
ON public.break_requests
FOR SELECT
USING (auth.uid() = user_id);

-- Admins/leaders can view all break requests
CREATE POLICY "Admins can view all break requests"
ON public.break_requests
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'leader', 'campus_admin', 'campus_worship_pastor')
  )
);

-- Users can create their own break requests
CREATE POLICY "Users can create their own break requests"
ON public.break_requests
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own pending break requests
CREATE POLICY "Users can update their own pending requests"
ON public.break_requests
FOR UPDATE
USING (auth.uid() = user_id AND status = 'pending');

-- Admins can update any break request (for approval/denial)
CREATE POLICY "Admins can update break requests"
ON public.break_requests
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'leader', 'campus_admin', 'campus_worship_pastor')
  )
);

-- Users can delete their own pending break requests
CREATE POLICY "Users can delete their own pending requests"
ON public.break_requests
FOR DELETE
USING (auth.uid() = user_id AND status = 'pending');

-- Create updated_at trigger
CREATE TRIGGER update_break_requests_updated_at
BEFORE UPDATE ON public.break_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();