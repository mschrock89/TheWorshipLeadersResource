-- Update user_roles RLS policies to use 'admin' instead of 'leader'
DROP POLICY IF EXISTS "Leaders can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Leaders can view all roles" ON public.user_roles;

CREATE POLICY "Admins can manage roles" 
ON public.user_roles 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can view all roles" 
ON public.user_roles 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Also update other tables that reference 'leader' role
DROP POLICY IF EXISTS "Leaders can manage worship teams" ON public.worship_teams;
CREATE POLICY "Admins can manage worship teams" 
ON public.worship_teams 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Leaders can manage campus assignments" ON public.user_campuses;
CREATE POLICY "Admins can manage campus assignments" 
ON public.user_campuses 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Leaders can manage campuses" ON public.campuses;
CREATE POLICY "Admins can manage campuses" 
ON public.campuses 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can view assigned campuses" ON public.campuses;
CREATE POLICY "Users can view assigned campuses" 
ON public.campuses 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role) OR (id IN ( SELECT user_campuses.campus_id FROM user_campuses WHERE (user_campuses.user_id = auth.uid()))));

DROP POLICY IF EXISTS "Leaders can manage team schedule" ON public.team_schedule;
CREATE POLICY "Admins can manage team schedule" 
ON public.team_schedule 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Leaders can manage team members" ON public.team_members;
CREATE POLICY "Admins can manage team members" 
ON public.team_members 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Leaders can delete profiles" ON public.profiles;
CREATE POLICY "Admins can delete profiles" 
ON public.profiles 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Leaders can insert profiles" ON public.profiles;
CREATE POLICY "Admins can insert profiles" 
ON public.profiles 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR (auth.uid() = id));

DROP POLICY IF EXISTS "Leaders can update any profile" ON public.profiles;
CREATE POLICY "Admins can update any profile" 
ON public.profiles 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can view profiles" ON public.profiles;
CREATE POLICY "Users can view profiles" 
ON public.profiles 
FOR SELECT 
USING ((auth.uid() IS NOT NULL) AND ((auth.uid() = id) OR has_role(auth.uid(), 'admin'::app_role) OR shares_campus_with(auth.uid(), id)));

-- Update swap_requests policies
DROP POLICY IF EXISTS "Users can update relevant swap requests" ON public.swap_requests;
CREATE POLICY "Users can update relevant swap requests" 
ON public.swap_requests 
FOR UPDATE 
USING (((auth.uid() = requester_id) AND (status = 'pending'::swap_request_status)) OR ((auth.uid() = target_user_id) AND (status = 'pending'::swap_request_status)) OR ((target_user_id IS NULL) AND (status = 'pending'::swap_request_status) AND (auth.uid() <> requester_id) AND (position IN ( SELECT tm.position FROM team_members tm WHERE (tm.user_id = auth.uid())))) OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can view relevant swap requests" ON public.swap_requests;
CREATE POLICY "Users can view relevant swap requests" 
ON public.swap_requests 
FOR SELECT 
USING ((auth.uid() = requester_id) OR (auth.uid() = target_user_id) OR ((target_user_id IS NULL) AND (position IN ( SELECT tm.position FROM team_members tm WHERE (tm.user_id = auth.uid())))) OR has_role(auth.uid(), 'admin'::app_role));

-- Update events policies
DROP POLICY IF EXISTS "Leaders can delete events" ON public.events;
DROP POLICY IF EXISTS "Leaders can insert events" ON public.events;
DROP POLICY IF EXISTS "Leaders can update events" ON public.events;
DROP POLICY IF EXISTS "Users can view campus events" ON public.events;

CREATE POLICY "Admins and pastors can delete events" 
ON public.events 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR has_role(auth.uid(), 'student_worship_pastor'::app_role));

CREATE POLICY "Admins and pastors can insert events" 
ON public.events 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR has_role(auth.uid(), 'student_worship_pastor'::app_role));

CREATE POLICY "Admins and pastors can update events" 
ON public.events 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR has_role(auth.uid(), 'student_worship_pastor'::app_role));

CREATE POLICY "Users can view campus events" 
ON public.events 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR has_role(auth.uid(), 'student_worship_pastor'::app_role) OR (campus_id IS NULL) OR (campus_id IN ( SELECT user_campuses.campus_id FROM user_campuses WHERE (user_campuses.user_id = auth.uid()))));