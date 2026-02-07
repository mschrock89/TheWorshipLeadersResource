-- Add network_worship_leader to all RLS policies that include campus_worship_pastor

-- plan_songs table
DROP POLICY IF EXISTS "Admins and pastors can delete plan songs" ON public.plan_songs;
CREATE POLICY "Admins and pastors can delete plan songs" ON public.plan_songs
FOR DELETE USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role)
);

DROP POLICY IF EXISTS "Admins and pastors can insert plan songs" ON public.plan_songs;
CREATE POLICY "Admins and pastors can insert plan songs" ON public.plan_songs
FOR INSERT WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role)
);

DROP POLICY IF EXISTS "Admins and pastors can update plan songs" ON public.plan_songs;
CREATE POLICY "Admins and pastors can update plan songs" ON public.plan_songs
FOR UPDATE USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role)
) WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role)
);

-- songs table
DROP POLICY IF EXISTS "Admins and pastors can delete songs" ON public.songs;
CREATE POLICY "Admins and pastors can delete songs" ON public.songs
FOR DELETE USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role)
);

DROP POLICY IF EXISTS "Admins and pastors can insert songs" ON public.songs;
CREATE POLICY "Admins and pastors can insert songs" ON public.songs
FOR INSERT WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role)
);

DROP POLICY IF EXISTS "Admins and pastors can update songs" ON public.songs;
CREATE POLICY "Admins and pastors can update songs" ON public.songs
FOR UPDATE USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role)
) WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role)
);

-- message_reactions table
DROP POLICY IF EXISTS "Users can view reactions on messages from their campuses" ON public.message_reactions;
CREATE POLICY "Users can view reactions on messages from their campuses" ON public.message_reactions
FOR SELECT USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  (message_id IN (
    SELECT cm.id FROM chat_messages cm
    WHERE cm.campus_id IN (
      SELECT user_campuses.campus_id FROM user_campuses WHERE user_campuses.user_id = auth.uid()
    )
  ))
);

-- user_campuses table
DROP POLICY IF EXISTS "Campus admins and above can delete campus assignments" ON public.user_campuses;
CREATE POLICY "Campus admins and above can delete campus assignments" ON public.user_campuses
FOR DELETE USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  ((has_role(auth.uid(), 'campus_admin'::app_role) OR 
    has_role(auth.uid(), 'network_worship_leader'::app_role) OR
    has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
    has_role(auth.uid(), 'student_worship_pastor'::app_role)) 
   AND shares_campus_with(auth.uid(), user_id))
);

DROP POLICY IF EXISTS "Campus admins and above can insert campus assignments" ON public.user_campuses;
CREATE POLICY "Campus admins and above can insert campus assignments" ON public.user_campuses
FOR INSERT WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role)
);

DROP POLICY IF EXISTS "Campus admins and above can update campus assignments" ON public.user_campuses;
CREATE POLICY "Campus admins and above can update campus assignments" ON public.user_campuses
FOR UPDATE USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  ((has_role(auth.uid(), 'campus_admin'::app_role) OR 
    has_role(auth.uid(), 'network_worship_leader'::app_role) OR
    has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
    has_role(auth.uid(), 'student_worship_pastor'::app_role)) 
   AND shares_campus_with(auth.uid(), user_id))
);

-- draft_sets table
DROP POLICY IF EXISTS "Campus admins and pastors can create draft sets" ON public.draft_sets;
CREATE POLICY "Campus admins and pastors can create draft sets" ON public.draft_sets
FOR INSERT WITH CHECK (
  (auth.uid() = created_by) AND (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'network_worship_leader'::app_role) OR
    has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
    has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
    has_role(auth.uid(), 'campus_admin'::app_role)
  )
);

DROP POLICY IF EXISTS "Users can view draft sets for their campuses" ON public.draft_sets;
CREATE POLICY "Users can view draft sets for their campuses" ON public.draft_sets
FOR SELECT USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role) OR 
  (campus_id IN (SELECT uc.campus_id FROM user_campuses uc WHERE uc.user_id = auth.uid()))
);

-- draft_set_songs table
DROP POLICY IF EXISTS "Users can view songs in accessible draft sets" ON public.draft_set_songs;
CREATE POLICY "Users can view songs in accessible draft sets" ON public.draft_set_songs
FOR SELECT USING (
  draft_set_id IN (
    SELECT draft_sets.id FROM draft_sets
    WHERE (
      has_role(auth.uid(), 'admin'::app_role) OR 
      has_role(auth.uid(), 'network_worship_leader'::app_role) OR
      has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
      has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
      has_role(auth.uid(), 'campus_admin'::app_role) OR 
      (draft_sets.campus_id IN (SELECT uc.campus_id FROM user_campuses uc WHERE uc.user_id = auth.uid()))
    )
  )
);

-- user_roles table
DROP POLICY IF EXISTS "Campus admins and above can delete roles" ON public.user_roles;
CREATE POLICY "Campus admins and above can delete roles" ON public.user_roles
FOR DELETE USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  ((has_role(auth.uid(), 'campus_admin'::app_role) OR 
    has_role(auth.uid(), 'network_worship_leader'::app_role) OR
    has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
    has_role(auth.uid(), 'student_worship_pastor'::app_role)) 
   AND shares_campus_with(auth.uid(), user_id))
);

DROP POLICY IF EXISTS "Campus admins and above can insert roles" ON public.user_roles;
CREATE POLICY "Campus admins and above can insert roles" ON public.user_roles
FOR INSERT WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  ((has_role(auth.uid(), 'campus_admin'::app_role) OR 
    has_role(auth.uid(), 'network_worship_leader'::app_role) OR
    has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
    has_role(auth.uid(), 'student_worship_pastor'::app_role)) 
   AND shares_campus_with(auth.uid(), user_id))
);

DROP POLICY IF EXISTS "Campus admins and above can update roles" ON public.user_roles;
CREATE POLICY "Campus admins and above can update roles" ON public.user_roles
FOR UPDATE USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  ((has_role(auth.uid(), 'campus_admin'::app_role) OR 
    has_role(auth.uid(), 'network_worship_leader'::app_role) OR
    has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
    has_role(auth.uid(), 'student_worship_pastor'::app_role)) 
   AND shares_campus_with(auth.uid(), user_id))
);

DROP POLICY IF EXISTS "Users can view roles" ON public.user_roles;
CREATE POLICY "Users can view roles" ON public.user_roles
FOR SELECT USING (
  (auth.uid() = user_id) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  ((has_role(auth.uid(), 'campus_admin'::app_role) OR 
    has_role(auth.uid(), 'network_worship_leader'::app_role) OR
    has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
    has_role(auth.uid(), 'student_worship_pastor'::app_role)) 
   AND shares_campus_with(auth.uid(), user_id))
);

-- service_plans table
DROP POLICY IF EXISTS "Admins and pastors can delete service plans" ON public.service_plans;
CREATE POLICY "Admins and pastors can delete service plans" ON public.service_plans
FOR DELETE USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role)
);

DROP POLICY IF EXISTS "Admins and pastors can insert service plans" ON public.service_plans;
CREATE POLICY "Admins and pastors can insert service plans" ON public.service_plans
FOR INSERT WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role)
);

DROP POLICY IF EXISTS "Admins and pastors can update service plans" ON public.service_plans;
CREATE POLICY "Admins and pastors can update service plans" ON public.service_plans
FOR UPDATE USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role)
) WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role)
);