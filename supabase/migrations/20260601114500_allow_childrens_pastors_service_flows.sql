-- Kids Camp leaders need to generate and maintain service flows from Kids Camp templates.

ALTER POLICY "Users can view service flows for their campuses"
  ON public.service_flows
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'student_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'childrens_pastor'::app_role) OR
    has_role(auth.uid(), 'campus_admin'::app_role) OR
    has_role(auth.uid(), 'video_director'::app_role) OR
    has_role(auth.uid(), 'production_manager'::app_role) OR
    campus_id IN (SELECT uc.campus_id FROM public.user_campuses uc WHERE uc.user_id = auth.uid())
  );

ALTER POLICY "Pastors and admins can insert service flows"
  ON public.service_flows
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'campus_admin'::app_role) OR
    has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'student_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'childrens_pastor'::app_role) OR
    has_role(auth.uid(), 'video_director'::app_role) OR
    has_role(auth.uid(), 'production_manager'::app_role)
  );

ALTER POLICY "Pastors and admins can update service flows"
  ON public.service_flows
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'campus_admin'::app_role) OR
    has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'student_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'childrens_pastor'::app_role) OR
    has_role(auth.uid(), 'video_director'::app_role) OR
    has_role(auth.uid(), 'production_manager'::app_role)
  );

ALTER POLICY "Pastors and admins can delete service flows"
  ON public.service_flows
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'campus_admin'::app_role) OR
    has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'childrens_pastor'::app_role)
  );

ALTER POLICY "Users can view service flow items for accessible flows"
  ON public.service_flow_items
  USING (
    service_flow_id IN (
      SELECT id FROM public.service_flows
      WHERE has_role(auth.uid(), 'admin'::app_role) OR
        has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
        has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR
        has_role(auth.uid(), 'student_worship_pastor'::app_role) OR
        has_role(auth.uid(), 'childrens_pastor'::app_role) OR
        has_role(auth.uid(), 'campus_admin'::app_role) OR
        has_role(auth.uid(), 'video_director'::app_role) OR
        has_role(auth.uid(), 'production_manager'::app_role) OR
        campus_id IN (SELECT uc.campus_id FROM public.user_campuses uc WHERE uc.user_id = auth.uid())
    )
  );

ALTER POLICY "Pastors and admins can insert service flow items"
  ON public.service_flow_items
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.service_flows sf
      WHERE sf.id = service_flow_id
      AND (
        has_role(auth.uid(), 'admin'::app_role) OR
        has_role(auth.uid(), 'campus_admin'::app_role) OR
        has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
        has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR
        has_role(auth.uid(), 'student_worship_pastor'::app_role) OR
        has_role(auth.uid(), 'childrens_pastor'::app_role) OR
        has_role(auth.uid(), 'video_director'::app_role) OR
        has_role(auth.uid(), 'production_manager'::app_role)
      )
    )
  );

ALTER POLICY "Pastors and admins can update service flow items"
  ON public.service_flow_items
  USING (
    EXISTS (
      SELECT 1 FROM public.service_flows sf
      WHERE sf.id = service_flow_id
      AND (
        has_role(auth.uid(), 'admin'::app_role) OR
        has_role(auth.uid(), 'campus_admin'::app_role) OR
        has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
        has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR
        has_role(auth.uid(), 'student_worship_pastor'::app_role) OR
        has_role(auth.uid(), 'childrens_pastor'::app_role) OR
        has_role(auth.uid(), 'video_director'::app_role) OR
        has_role(auth.uid(), 'production_manager'::app_role)
      )
    )
  );

ALTER POLICY "Pastors and admins can delete service flow items"
  ON public.service_flow_items
  USING (
    EXISTS (
      SELECT 1 FROM public.service_flows sf
      WHERE sf.id = service_flow_id
      AND (
        has_role(auth.uid(), 'admin'::app_role) OR
        has_role(auth.uid(), 'campus_admin'::app_role) OR
        has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
        has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR
        has_role(auth.uid(), 'childrens_pastor'::app_role)
      )
    )
  );
