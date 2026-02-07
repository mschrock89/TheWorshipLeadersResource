-- Fix function search path security warning
CREATE OR REPLACE FUNCTION public.cleanup_old_notification_reads()
RETURNS void AS $$
BEGIN
  DELETE FROM public.notification_read_status
  WHERE created_at < now() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;