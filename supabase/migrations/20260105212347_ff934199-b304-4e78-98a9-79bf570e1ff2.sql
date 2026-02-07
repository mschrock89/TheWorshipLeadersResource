-- Drop existing INSERT policy for chat_messages
DROP POLICY IF EXISTS "Users can insert messages to their campuses" ON public.chat_messages;

-- Create new INSERT policy that allows admins to insert to any campus
CREATE POLICY "Users can insert messages to their campuses" 
ON public.chat_messages 
FOR INSERT 
WITH CHECK (
  (auth.uid() = user_id) AND (
    -- Admins can send to any campus
    has_role(auth.uid(), 'admin'::app_role) OR 
    -- Other users can only send to their assigned campuses
    (campus_id IN (SELECT user_campuses.campus_id FROM user_campuses WHERE user_campuses.user_id = auth.uid()))
  )
);

-- Also update the SELECT policy so admins can view all campus messages
DROP POLICY IF EXISTS "Users can view messages from their campuses" ON public.chat_messages;

CREATE POLICY "Users can view messages from their campuses" 
ON public.chat_messages 
FOR SELECT 
USING (
  -- Admins can view all messages
  has_role(auth.uid(), 'admin'::app_role) OR
  -- Other users can only view messages from their assigned campuses
  (campus_id IN (SELECT user_campuses.campus_id FROM user_campuses WHERE user_campuses.user_id = auth.uid()))
);

-- Update DELETE policy for admins
DROP POLICY IF EXISTS "Users can delete their own messages" ON public.chat_messages;

CREATE POLICY "Users can delete their own messages" 
ON public.chat_messages 
FOR DELETE 
USING (
  (auth.uid() = user_id) AND (
    has_role(auth.uid(), 'admin'::app_role) OR
    (campus_id IN (SELECT user_campuses.campus_id FROM user_campuses WHERE user_campuses.user_id = auth.uid()))
  )
);

-- Update UPDATE policy for admins
DROP POLICY IF EXISTS "Users can update their own recent messages" ON public.chat_messages;

CREATE POLICY "Users can update their own recent messages" 
ON public.chat_messages 
FOR UPDATE 
USING (
  (auth.uid() = user_id) AND (
    has_role(auth.uid(), 'admin'::app_role) OR
    (campus_id IN (SELECT user_campuses.campus_id FROM user_campuses WHERE user_campuses.user_id = auth.uid()))
  ) AND (created_at > (now() - '00:15:00'::interval))
)
WITH CHECK (
  (auth.uid() = user_id) AND (
    has_role(auth.uid(), 'admin'::app_role) OR
    (campus_id IN (SELECT user_campuses.campus_id FROM user_campuses WHERE user_campuses.user_id = auth.uid()))
  )
);