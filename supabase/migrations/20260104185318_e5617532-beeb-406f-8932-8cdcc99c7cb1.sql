-- Create events table
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  event_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  campus_id UUID REFERENCES public.campuses(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Policy: All authenticated users can view events
CREATE POLICY "Users can view all events"
  ON public.events FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Leaders and campus pastors can insert events
CREATE POLICY "Leaders can insert events"
  ON public.events FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'leader'::app_role) OR has_role(auth.uid(), 'campus_pastor'::app_role));

-- Policy: Leaders and campus pastors can update events
CREATE POLICY "Leaders can update events"
  ON public.events FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'leader'::app_role) OR has_role(auth.uid(), 'campus_pastor'::app_role));

-- Policy: Leaders and campus pastors can delete events
CREATE POLICY "Leaders can delete events"
  ON public.events FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'leader'::app_role) OR has_role(auth.uid(), 'campus_pastor'::app_role));

-- Add updated_at trigger
CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.events;