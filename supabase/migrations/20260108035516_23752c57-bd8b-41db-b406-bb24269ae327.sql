-- Fix message_reactions SELECT policy to include admin bypass
DROP POLICY IF EXISTS "Users can view reactions on messages from their campuses" ON message_reactions;
CREATE POLICY "Users can view reactions on messages from their campuses" 
ON message_reactions FOR SELECT 
TO authenticated 
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  OR message_id IN (
    SELECT cm.id FROM chat_messages cm 
    WHERE cm.campus_id IN (
      SELECT campus_id FROM user_campuses WHERE user_id = auth.uid()
    )
  )
);