-- Add UPDATE policy for chat messages with 15-minute edit window
CREATE POLICY "Users can update their own recent messages"
ON public.chat_messages
FOR UPDATE
USING (
  auth.uid() = user_id
  AND campus_id IN (
    SELECT campus_id FROM public.user_campuses WHERE user_id = auth.uid()
  )
  AND created_at > (now() - interval '15 minutes')
)
WITH CHECK (
  auth.uid() = user_id
  AND campus_id IN (
    SELECT campus_id FROM public.user_campuses WHERE user_id = auth.uid()
  )
);