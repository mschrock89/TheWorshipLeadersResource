-- Create a table to track sync progress for resumable historical syncs
CREATE TABLE public.sync_progress (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  sync_type TEXT NOT NULL, -- 'historical', 'full', etc.
  start_year INTEGER,
  end_year INTEGER,
  status TEXT NOT NULL DEFAULT 'in_progress', -- 'in_progress', 'completed', 'failed'
  current_service_type_index INTEGER NOT NULL DEFAULT 0,
  current_plan_index INTEGER NOT NULL DEFAULT 0,
  total_service_types INTEGER,
  total_plans_processed INTEGER NOT NULL DEFAULT 0,
  total_songs_processed INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(user_id, start_year, end_year)
);

-- Enable RLS
ALTER TABLE public.sync_progress ENABLE ROW LEVEL SECURITY;

-- Users can only see their own sync progress
CREATE POLICY "Users can view their own sync progress"
ON public.sync_progress FOR SELECT
USING (auth.uid() = user_id);

-- Allow service role to insert/update (edge functions use service role)
-- Users can also insert their own records
CREATE POLICY "Users can insert their own sync progress"
ON public.sync_progress FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sync progress"
ON public.sync_progress FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own sync progress"
ON public.sync_progress FOR DELETE
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_sync_progress_updated_at
BEFORE UPDATE ON public.sync_progress
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();