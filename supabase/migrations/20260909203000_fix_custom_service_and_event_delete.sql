-- Deleting a custom service used ON DELETE SET NULL for its service flow.
-- That turned the flow into a "standard" flow (custom_service_id IS NULL), which
-- then collided with service_flows_standard_unique_idx when another flow already
-- existed for the same campus/ministry/date — exactly the duplicate-service case.
-- Scoped flows should be removed with the service.

ALTER TABLE public.service_flows
  DROP CONSTRAINT IF EXISTS service_flows_custom_service_id_fkey;

ALTER TABLE public.service_flows
  ADD CONSTRAINT service_flows_custom_service_id_fkey
  FOREIGN KEY (custom_service_id)
  REFERENCES public.custom_services(id)
  ON DELETE CASCADE;

-- Let the same roles that can create custom services also delete their flows.
DROP POLICY IF EXISTS "Pastors and admins can delete service flows" ON public.service_flows;
CREATE POLICY "Pastors and admins can delete service flows"
ON public.service_flows
FOR DELETE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'campus_admin'::app_role)
  OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'network_worship_leader'::app_role)
);

-- Calendar "Add Event" is shown to team managers, but write policies were limited
-- to a smaller pastor set. Insert could succeed for some roles while delete
-- silently matched zero rows and the event came back.
DROP POLICY IF EXISTS "Admins and pastors can delete events" ON public.events;
DROP POLICY IF EXISTS "Admins and pastors can insert events" ON public.events;
DROP POLICY IF EXISTS "Admins and pastors can update events" ON public.events;

CREATE POLICY "Admins and pastors can delete events"
ON public.events
FOR DELETE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'campus_admin'::app_role)
  OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'network_worship_leader'::app_role)
);

CREATE POLICY "Admins and pastors can insert events"
ON public.events
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'campus_admin'::app_role)
  OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'network_worship_leader'::app_role)
);

CREATE POLICY "Admins and pastors can update events"
ON public.events
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'campus_admin'::app_role)
  OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'network_worship_leader'::app_role)
);
