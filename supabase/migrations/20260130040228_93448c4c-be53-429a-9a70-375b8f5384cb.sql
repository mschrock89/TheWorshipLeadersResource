-- Add ministry_type column to chat_messages for ministry-specific chats
ALTER TABLE public.chat_messages 
ADD COLUMN ministry_type text DEFAULT 'weekend';

-- Add ministry_type to message_read_status to track reads per campus+ministry
ALTER TABLE public.message_read_status 
ADD COLUMN ministry_type text DEFAULT 'weekend';

-- Drop the existing unique constraint and add a new one including ministry_type
ALTER TABLE public.message_read_status 
DROP CONSTRAINT IF EXISTS message_read_status_user_id_campus_id_key;

ALTER TABLE public.message_read_status 
ADD CONSTRAINT message_read_status_user_id_campus_ministry_key 
UNIQUE (user_id, campus_id, ministry_type);

-- Create index for faster queries on ministry_type
CREATE INDEX IF NOT EXISTS idx_chat_messages_ministry_type ON public.chat_messages(campus_id, ministry_type);

-- Backfill existing messages to 'weekend' ministry type (already default)
UPDATE public.chat_messages SET ministry_type = 'weekend' WHERE ministry_type IS NULL;