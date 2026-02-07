-- Add campus_id to chat_messages for campus-specific chats
ALTER TABLE public.chat_messages 
ADD COLUMN campus_id uuid REFERENCES public.campuses(id) ON DELETE CASCADE;

-- Create index for faster campus-based queries
CREATE INDEX idx_chat_messages_campus_id ON public.chat_messages(campus_id);

-- Drop the existing overly permissive SELECT policy
DROP POLICY IF EXISTS "Authenticated users can view all messages" ON public.chat_messages;

-- Create new policy: Users can only view messages from campuses they belong to
CREATE POLICY "Users can view messages from their campuses"
ON public.chat_messages
FOR SELECT
TO authenticated
USING (
  campus_id IN (
    SELECT campus_id FROM public.user_campuses WHERE user_id = auth.uid()
  )
);

-- Update INSERT policy to require campus_id and verify user belongs to that campus
DROP POLICY IF EXISTS "Users can insert their own messages" ON public.chat_messages;

CREATE POLICY "Users can insert messages to their campuses"
ON public.chat_messages
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id 
  AND campus_id IN (
    SELECT campus_id FROM public.user_campuses WHERE user_id = auth.uid()
  )
);

-- Update DELETE policy (users can only delete their own messages in their campuses)
DROP POLICY IF EXISTS "Users can delete their own messages" ON public.chat_messages;

CREATE POLICY "Users can delete their own messages"
ON public.chat_messages
FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id 
  AND campus_id IN (
    SELECT campus_id FROM public.user_campuses WHERE user_id = auth.uid()
  )
);

-- Also update message_reactions to respect campus boundaries
DROP POLICY IF EXISTS "Authenticated users can view all reactions" ON public.message_reactions;

CREATE POLICY "Users can view reactions on messages from their campuses"
ON public.message_reactions
FOR SELECT
TO authenticated
USING (
  message_id IN (
    SELECT cm.id FROM public.chat_messages cm
    WHERE cm.campus_id IN (
      SELECT campus_id FROM public.user_campuses WHERE user_id = auth.uid()
    )
  )
);