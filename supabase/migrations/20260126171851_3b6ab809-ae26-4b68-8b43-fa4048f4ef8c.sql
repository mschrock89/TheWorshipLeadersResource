-- Drop the overly permissive SELECT policy
DROP POLICY IF EXISTS "Admins can view all break requests" ON public.break_requests;

-- Drop the overly permissive UPDATE policy  
DROP POLICY IF EXISTS "Admins can update break requests" ON public.break_requests;

-- Create a function to check if the viewer is a Campus Worship Pastor for the user's campus
CREATE OR REPLACE FUNCTION public.can_view_break_request(_request_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    -- Global admins can see all
    has_role(auth.uid(), 'admin'::app_role)
    OR
    -- Campus Worship Pastors can only see requests from users at their campus
    (
      has_role(auth.uid(), 'campus_worship_pastor'::app_role)
      AND shares_campus_with(auth.uid(), _request_user_id)
    )
$$;

-- Create a function to check if the viewer can review (update) a break request
CREATE OR REPLACE FUNCTION public.can_review_break_request(_request_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    -- Global admins can review all
    has_role(auth.uid(), 'admin'::app_role)
    OR
    -- Campus Worship Pastors can only review requests from users at their campus
    (
      has_role(auth.uid(), 'campus_worship_pastor'::app_role)
      AND shares_campus_with(auth.uid(), _request_user_id)
    )
$$;

-- Create new restrictive SELECT policy for admins - global admin only
CREATE POLICY "Global admins can view all break requests"
ON public.break_requests
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create SELECT policy for Campus Worship Pastors - campus-scoped
CREATE POLICY "Campus Worship Pastors can view campus break requests"
ON public.break_requests
FOR SELECT
USING (
  has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  AND shares_campus_with(auth.uid(), user_id)
);

-- Create new restrictive UPDATE policy for global admins
CREATE POLICY "Global admins can update break requests"
ON public.break_requests
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create UPDATE policy for Campus Worship Pastors - campus-scoped
CREATE POLICY "Campus Worship Pastors can update campus break requests"
ON public.break_requests
FOR UPDATE
USING (
  has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  AND shares_campus_with(auth.uid(), user_id)
);