-- Service Flow Templates: Master templates per campus/ministry
CREATE TABLE public.service_flow_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campus_id UUID NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  ministry_type TEXT NOT NULL DEFAULT 'weekend',
  name TEXT NOT NULL,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(campus_id, ministry_type)
);

-- Service Flow Template Items: Items within a template
CREATE TABLE public.service_flow_template_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.service_flow_templates(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('header', 'item', 'song_placeholder')),
  title TEXT NOT NULL,
  default_duration_seconds INTEGER,
  sequence_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Service Flows: Generated service flows for specific dates
CREATE TABLE public.service_flows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  draft_set_id UUID REFERENCES public.draft_sets(id) ON DELETE SET NULL,
  campus_id UUID NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  ministry_type TEXT NOT NULL DEFAULT 'weekend',
  service_date DATE NOT NULL,
  created_from_template_id UUID REFERENCES public.service_flow_templates(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(campus_id, ministry_type, service_date)
);

-- Service Flow Items: Individual items in a service flow
CREATE TABLE public.service_flow_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service_flow_id UUID NOT NULL REFERENCES public.service_flows(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('header', 'item', 'song')),
  title TEXT NOT NULL,
  duration_seconds INTEGER,
  sequence_order INTEGER NOT NULL DEFAULT 0,
  song_id UUID REFERENCES public.songs(id) ON DELETE SET NULL,
  song_key TEXT,
  vocalist_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.service_flow_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_flow_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_flow_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for service_flow_templates
CREATE POLICY "Authenticated users can view templates"
  ON public.service_flow_templates FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Pastors and admins can insert templates"
  ON public.service_flow_templates FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'campus_admin'::app_role) OR
    has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'student_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'video_director'::app_role) OR
    has_role(auth.uid(), 'production_manager'::app_role)
  );

CREATE POLICY "Pastors and admins can update templates"
  ON public.service_flow_templates FOR UPDATE
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'campus_admin'::app_role) OR
    has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'student_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'video_director'::app_role) OR
    has_role(auth.uid(), 'production_manager'::app_role)
  );

CREATE POLICY "Pastors and admins can delete templates"
  ON public.service_flow_templates FOR DELETE
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'campus_admin'::app_role) OR
    has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  );

-- RLS Policies for service_flow_template_items
CREATE POLICY "Authenticated users can view template items"
  ON public.service_flow_template_items FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Pastors and admins can insert template items"
  ON public.service_flow_template_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.service_flow_templates t
      WHERE t.id = template_id
      AND (
        has_role(auth.uid(), 'admin'::app_role) OR
        has_role(auth.uid(), 'campus_admin'::app_role) OR
        has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
        has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR
        has_role(auth.uid(), 'student_worship_pastor'::app_role) OR
        has_role(auth.uid(), 'video_director'::app_role) OR
        has_role(auth.uid(), 'production_manager'::app_role)
      )
    )
  );

CREATE POLICY "Pastors and admins can update template items"
  ON public.service_flow_template_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.service_flow_templates t
      WHERE t.id = template_id
      AND (
        has_role(auth.uid(), 'admin'::app_role) OR
        has_role(auth.uid(), 'campus_admin'::app_role) OR
        has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
        has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR
        has_role(auth.uid(), 'student_worship_pastor'::app_role) OR
        has_role(auth.uid(), 'video_director'::app_role) OR
        has_role(auth.uid(), 'production_manager'::app_role)
      )
    )
  );

CREATE POLICY "Pastors and admins can delete template items"
  ON public.service_flow_template_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.service_flow_templates t
      WHERE t.id = template_id
      AND (
        has_role(auth.uid(), 'admin'::app_role) OR
        has_role(auth.uid(), 'campus_admin'::app_role) OR
        has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
        has_role(auth.uid(), 'campus_worship_pastor'::app_role)
      )
    )
  );

-- RLS Policies for service_flows (similar to draft_sets)
CREATE POLICY "Users can view service flows for their campuses"
  ON public.service_flows FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'student_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'campus_admin'::app_role) OR
    has_role(auth.uid(), 'video_director'::app_role) OR
    has_role(auth.uid(), 'production_manager'::app_role) OR
    campus_id IN (SELECT uc.campus_id FROM user_campuses uc WHERE uc.user_id = auth.uid())
  );

CREATE POLICY "Pastors and admins can insert service flows"
  ON public.service_flows FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'campus_admin'::app_role) OR
    has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'student_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'video_director'::app_role) OR
    has_role(auth.uid(), 'production_manager'::app_role)
  );

CREATE POLICY "Pastors and admins can update service flows"
  ON public.service_flows FOR UPDATE
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'campus_admin'::app_role) OR
    has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'student_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'video_director'::app_role) OR
    has_role(auth.uid(), 'production_manager'::app_role)
  );

CREATE POLICY "Pastors and admins can delete service flows"
  ON public.service_flows FOR DELETE
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'campus_admin'::app_role) OR
    has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  );

-- RLS Policies for service_flow_items
CREATE POLICY "Users can view service flow items for accessible flows"
  ON public.service_flow_items FOR SELECT
  USING (
    service_flow_id IN (
      SELECT id FROM public.service_flows
      WHERE has_role(auth.uid(), 'admin'::app_role) OR
        has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
        has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR
        has_role(auth.uid(), 'student_worship_pastor'::app_role) OR
        has_role(auth.uid(), 'campus_admin'::app_role) OR
        has_role(auth.uid(), 'video_director'::app_role) OR
        has_role(auth.uid(), 'production_manager'::app_role) OR
        campus_id IN (SELECT uc.campus_id FROM user_campuses uc WHERE uc.user_id = auth.uid())
    )
  );

CREATE POLICY "Pastors and admins can insert service flow items"
  ON public.service_flow_items FOR INSERT
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
        has_role(auth.uid(), 'video_director'::app_role) OR
        has_role(auth.uid(), 'production_manager'::app_role)
      )
    )
  );

CREATE POLICY "Pastors and admins can update service flow items"
  ON public.service_flow_items FOR UPDATE
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
        has_role(auth.uid(), 'video_director'::app_role) OR
        has_role(auth.uid(), 'production_manager'::app_role)
      )
    )
  );

CREATE POLICY "Pastors and admins can delete service flow items"
  ON public.service_flow_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.service_flows sf
      WHERE sf.id = service_flow_id
      AND (
        has_role(auth.uid(), 'admin'::app_role) OR
        has_role(auth.uid(), 'campus_admin'::app_role) OR
        has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
        has_role(auth.uid(), 'campus_worship_pastor'::app_role)
      )
    )
  );

-- Create updated_at trigger for templates and flows
CREATE TRIGGER update_service_flow_templates_updated_at
  BEFORE UPDATE ON public.service_flow_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_service_flows_updated_at
  BEFORE UPDATE ON public.service_flows
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_service_flow_templates_campus_ministry ON public.service_flow_templates(campus_id, ministry_type);
CREATE INDEX idx_service_flows_campus_date ON public.service_flows(campus_id, service_date);
CREATE INDEX idx_service_flows_draft_set ON public.service_flows(draft_set_id);
CREATE INDEX idx_service_flow_items_flow ON public.service_flow_items(service_flow_id);
CREATE INDEX idx_service_flow_template_items_template ON public.service_flow_template_items(template_id);