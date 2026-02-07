-- Create table for notification read status
CREATE TABLE public.notification_read_status (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  notification_id TEXT NOT NULL,
  read_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, notification_id)
);

-- Enable RLS
ALTER TABLE public.notification_read_status ENABLE ROW LEVEL SECURITY;

-- Users can only see their own read status
CREATE POLICY "Users can view their own notification read status"
ON public.notification_read_status
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own read status
CREATE POLICY "Users can insert their own notification read status"
ON public.notification_read_status
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own read status (for cleanup)
CREATE POLICY "Users can delete their own notification read status"
ON public.notification_read_status
FOR DELETE
USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX idx_notification_read_status_user_id ON public.notification_read_status(user_id);
CREATE INDEX idx_notification_read_status_notification_id ON public.notification_read_status(notification_id);

-- Create a function to cleanup old read statuses (older than 30 days)
CREATE OR REPLACE FUNCTION public.cleanup_old_notification_reads()
RETURNS void AS $$
BEGIN
  DELETE FROM public.notification_read_status
  WHERE created_at < now() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;