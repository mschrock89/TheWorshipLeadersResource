-- Create message_read_status table to track when users last read messages per campus
CREATE TABLE public.message_read_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  campus_id uuid NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, campus_id)
);

-- Enable RLS
ALTER TABLE public.message_read_status ENABLE ROW LEVEL SECURITY;

-- Policy: users can view their own read status
CREATE POLICY "Users can view own read status"
  ON public.message_read_status
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: users can insert their own read status
CREATE POLICY "Users can insert own read status"
  ON public.message_read_status
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: users can update their own read status
CREATE POLICY "Users can update own read status"
  ON public.message_read_status
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX idx_message_read_status_user_campus ON public.message_read_status(user_id, campus_id);