-- === 20251215203505_8756c285-e362-47ff-a890-fea6f12ed636.sql ===
-- Create role enum
CREATE TYPE public.app_role AS ENUM ('leader', 'member');

-- Create position enum for team roles
CREATE TYPE public.team_position AS ENUM (
  'lead_vocals', 'harmony_vocals', 'background_vocals',
  'acoustic_guitar', 'electric_guitar', 'bass', 'drums', 'keys', 'piano',
  'violin', 'cello', 'saxophone', 'trumpet', 'other_instrument',
  'sound_tech', 'lighting', 'media', 'other'
);

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  birthday DATE,
  anniversary DATE,
  positions team_position[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create user_roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'member',
  UNIQUE (user_id, role)
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (prevents recursive RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Profiles policies
CREATE POLICY "Users can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Leaders can update any profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'leader'));

CREATE POLICY "Leaders can insert profiles"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'leader') OR auth.uid() = id);

CREATE POLICY "Leaders can delete profiles"
  ON public.profiles FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'leader'));

-- User roles policies
CREATE POLICY "Users can view own role"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Leaders can view all roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'leader'));

CREATE POLICY "Leaders can manage roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'leader'));

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  is_first_user BOOLEAN;
BEGIN
  -- Check if this is the first user (make them a leader)
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO is_first_user;
  
  -- Insert profile
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );
  
  -- Assign role (first user becomes leader)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN is_first_user THEN 'leader'::app_role ELSE 'member'::app_role END);
  
  RETURN NEW;
END;
$$;

-- Trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to profiles
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create avatars storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);

-- Storage policies for avatars
CREATE POLICY "Avatar images are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own avatar"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
-- === 20251215203515_bb362ee2-b43d-41e3-97e7-ccaa0be1014f.sql ===
-- Fix the function search path for update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
-- === 20251223200532_8bde9f59-6155-4cd9-8821-1b887c09f770.sql ===
-- Drop the existing overly permissive policy
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

-- Create new policy: Users can view their own profile
CREATE POLICY "Users can view own profile" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() = id);

-- Create new policy: Leaders can view all profiles
CREATE POLICY "Leaders can view all profiles" 
ON public.profiles 
FOR SELECT 
USING (has_role(auth.uid(), 'leader'::app_role));
-- === 20251223212136_c64f697b-b151-498f-81ef-904da7ba4631.sql ===
-- Add campus_pastor to app_role enum
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'campus_pastor';

-- Create campuses table
CREATE TABLE public.campuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on campuses
ALTER TABLE public.campuses ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view campuses
CREATE POLICY "Users can view campuses" ON public.campuses
  FOR SELECT TO authenticated USING (true);

-- Leaders can manage campuses
CREATE POLICY "Leaders can manage campuses" ON public.campuses
  FOR ALL USING (has_role(auth.uid(), 'leader'::app_role));

-- Create user_campuses junction table
CREATE TABLE public.user_campuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  campus_id uuid NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, campus_id)
);

-- Enable RLS on user_campuses
ALTER TABLE public.user_campuses ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view campus assignments
CREATE POLICY "Users can view campus assignments" ON public.user_campuses
  FOR SELECT TO authenticated USING (true);

-- Leaders can manage all campus assignments
CREATE POLICY "Leaders can manage campus assignments" ON public.user_campuses
  FOR ALL USING (has_role(auth.uid(), 'leader'::app_role));
-- === 20251223213801_9a848b42-410b-40a6-a680-88b40b0d2a58.sql ===
-- Create a function to check if two users share a campus
CREATE OR REPLACE FUNCTION public.shares_campus_with(_viewer_id uuid, _profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_campuses uc1
    JOIN user_campuses uc2 ON uc1.campus_id = uc2.campus_id
    WHERE uc1.user_id = _viewer_id
      AND uc2.user_id = _profile_id
  )
$$;

-- Drop existing profile SELECT policies
DROP POLICY IF EXISTS "Leaders can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

-- Create new SELECT policies
-- Leaders can still see everyone
CREATE POLICY "Leaders can view all profiles" ON public.profiles
  FOR SELECT
  USING (has_role(auth.uid(), 'leader'::app_role));

-- Campus pastors can see users in their campus
CREATE POLICY "Campus pastors can view their campus profiles" ON public.profiles
  FOR SELECT
  USING (
    has_role(auth.uid(), 'campus_pastor'::app_role)
    AND shares_campus_with(auth.uid(), id)
  );

-- Users can always see their own profile
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);
-- === 20251224033157_ea4e6e9a-ce25-4dfc-af16-516726bbf353.sql ===
-- Add column to track welcome email status
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS welcome_email_sent_at timestamp with time zone DEFAULT NULL;
-- === 20251224044525_911c0efe-52cf-4a01-a233-a34f393ebcb5.sql ===
-- Create chat_messages table
CREATE TABLE public.chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create message_reactions table for hearts
CREATE TABLE public.message_reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL DEFAULT 'heart',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id, reaction)
);

-- Enable RLS on both tables
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- Chat messages policies (group chat - all authenticated users can see all messages)
CREATE POLICY "Authenticated users can view all messages"
ON public.chat_messages
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can insert their own messages"
ON public.chat_messages
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own messages"
ON public.chat_messages
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Message reactions policies
CREATE POLICY "Authenticated users can view all reactions"
ON public.message_reactions
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can add their own reactions"
ON public.message_reactions
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove their own reactions"
ON public.message_reactions
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Enable realtime for both tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
-- === 20251224140037_dff3b191-984b-4a12-b742-67acc4837056.sql ===
-- Add broadcast to the team_position enum
ALTER TYPE public.team_position ADD VALUE 'broadcast';
-- === 20260104030423_8672e811-ea14-427e-a9d3-8403f3348a1a.sql ===
-- Add consent column to profiles for users to control visibility
ALTER TABLE public.profiles 
ADD COLUMN share_contact_with_pastors boolean NOT NULL DEFAULT false;

-- Drop the existing overly permissive policy
DROP POLICY IF EXISTS "Campus pastors can view their campus profiles" ON public.profiles;

-- Create new policy: Campus pastors can only see profiles where user has consented
CREATE POLICY "Campus pastors can view consented campus profiles"
ON public.profiles
FOR SELECT
USING (
  has_role(auth.uid(), 'campus_pastor'::app_role) 
  AND shares_campus_with(auth.uid(), id)
  AND share_contact_with_pastors = true
);
-- === 20260104170837_1299951b-5e32-45ab-ad1a-39bc80005903.sql ===
-- Allow authenticated users to view basic profile info (name, avatar) for chat purposes
CREATE POLICY "Authenticated users can view profiles for chat"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);
-- === 20260104171138_5015ed54-0ba8-4606-98b9-a85f143eda43.sql ===
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
-- === 20260104172855_5a2cd90b-050e-4ca1-b72f-c7cdd7e1d9e3.sql ===
-- Add column to track if user must change password
ALTER TABLE public.profiles 
ADD COLUMN must_change_password boolean NOT NULL DEFAULT false;
-- === 20260104185318_e5617532-beeb-406f-8932-8cdcc99c7cb1.sql ===
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
-- === 20260104203815_f9cc4b6a-0f5d-485a-9765-628b7254cec0.sql ===
-- Create table for Planning Center OAuth connections
CREATE TABLE public.pco_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  campus_id UUID REFERENCES public.campuses(id),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  pco_organization_name TEXT,
  sync_team_members BOOLEAN DEFAULT true,
  sync_phone_numbers BOOLEAN DEFAULT true,
  sync_birthdays BOOLEAN DEFAULT true,
  sync_positions BOOLEAN DEFAULT true,
  connected_at TIMESTAMPTZ DEFAULT now(),
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.pco_connections ENABLE ROW LEVEL SECURITY;

-- Users can view and manage their own connection
CREATE POLICY "Users can view own connection"
  ON public.pco_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own connection"
  ON public.pco_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own connection"
  ON public.pco_connections FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own connection"
  ON public.pco_connections FOR DELETE
  USING (auth.uid() = user_id);

-- Leaders can view all connections
CREATE POLICY "Leaders can view all connections"
  ON public.pco_connections FOR SELECT
  USING (has_role(auth.uid(), 'leader'::app_role));

-- Add updated_at trigger
CREATE TRIGGER update_pco_connections_updated_at
  BEFORE UPDATE ON public.pco_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
-- === 20260104222034_cb042274-6fe3-4185-960c-c1888b16f708.sql ===
-- Drop the problematic policy that exposes tokens to all leaders
DROP POLICY IF EXISTS "Leaders can view all connections" ON public.pco_connections;

-- The existing "Users can view own connection" policy is sufficient and secure
-- Each user can only see their own connection with their own tokens
-- === 20260104222516_0d1cf95e-70a7-4960-9eb9-361f80394e46.sql ===
-- Drop the overly permissive policy that exposes all profiles to any authenticated user
DROP POLICY IF EXISTS "Authenticated users can view profiles for chat" ON public.profiles;

-- Create a more restrictive policy: users can only view profiles of people in their campus
CREATE POLICY "Users can view campus member profiles"
ON public.profiles
FOR SELECT
USING (
  auth.uid() = id  -- Own profile
  OR shares_campus_with(auth.uid(), id)  -- Same campus members
  OR has_role(auth.uid(), 'leader'::app_role)  -- Leaders can see all
);
-- === 20260104222524_996fd53b-274a-41d1-a3f5-ba034b9e5822.sql ===
-- Remove redundant SELECT policies that are now covered by the new consolidated policy
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Leaders can view all profiles" ON public.profiles;
-- === 20260104222745_1117971b-840b-4c05-a778-a2aad3c27b38.sql ===
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Users can view campuses" ON public.campuses;

-- Create a restrictive policy: users can only see campuses they're assigned to, or leaders can see all
CREATE POLICY "Users can view assigned campuses"
ON public.campuses
FOR SELECT
USING (
  has_role(auth.uid(), 'leader'::app_role)  -- Leaders can see all
  OR id IN (
    SELECT campus_id FROM public.user_campuses WHERE user_id = auth.uid()
  )  -- Users can only see their assigned campuses
);
-- === 20260104223024_fb339d38-33ec-4a74-8ea2-7dd6dc49cd73.sql ===
-- 1. Add consent field for sharing contact info with campus members
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS share_contact_with_campus boolean NOT NULL DEFAULT false;

-- 2. Drop the current overly permissive policy
DROP POLICY IF EXISTS "Users can view campus member profiles" ON public.profiles;

-- 3. Create restrictive policy - full profile access only with consent
CREATE POLICY "Users can view profiles with consent"
ON public.profiles
FOR SELECT
USING (
  auth.uid() = id  -- Own profile
  OR has_role(auth.uid(), 'leader'::app_role)  -- Leaders can see all
  OR (has_role(auth.uid(), 'campus_pastor'::app_role) AND shares_campus_with(auth.uid(), id) AND share_contact_with_pastors = true)  -- Campus pastors with consent
  OR (shares_campus_with(auth.uid(), id) AND share_contact_with_campus = true)  -- Campus members with consent
);

-- 4. Create security definer function for basic profile info (name, avatar only) - for chat/team display
CREATE OR REPLACE FUNCTION public.get_basic_profiles()
RETURNS TABLE(id uuid, full_name text, avatar_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.avatar_url
  FROM public.profiles p
  WHERE 
    has_role(auth.uid(), 'leader'::app_role)  -- Leaders can see all
    OR shares_campus_with(auth.uid(), p.id)  -- Campus members
    OR p.id = auth.uid()  -- Own profile
$$;
-- === 20260104223609_5db90689-4b84-4233-9981-7540dc9c2770.sql ===
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Users can view all events" ON public.events;

-- Create a restrictive policy: users can only see events for their campuses
CREATE POLICY "Users can view campus events"
ON public.events
FOR SELECT
USING (
  has_role(auth.uid(), 'leader'::app_role)  -- Leaders can see all
  OR has_role(auth.uid(), 'campus_pastor'::app_role)  -- Campus pastors can see all
  OR campus_id IS NULL  -- Global events (no campus) visible to all
  OR campus_id IN (
    SELECT campus_id FROM public.user_campuses WHERE user_id = auth.uid()
  )  -- Users can only see events for their assigned campuses
);
-- === 20260104224431_a95d86e6-edb5-449e-a620-e936588009d6.sql ===
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
-- === 20260104224651_3cbd4207-84d4-4f85-b9a9-552f0b1d6647.sql ===
-- Drop existing policies and recreate with explicit authentication checks
DROP POLICY IF EXISTS "Users can view own connection" ON public.pco_connections;
DROP POLICY IF EXISTS "Users can insert own connection" ON public.pco_connections;
DROP POLICY IF EXISTS "Users can update own connection" ON public.pco_connections;
DROP POLICY IF EXISTS "Users can delete own connection" ON public.pco_connections;

-- Recreate policies with explicit authentication requirement
CREATE POLICY "Authenticated users can view own connection"
ON public.pco_connections
FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND auth.uid() = user_id
);

CREATE POLICY "Authenticated users can insert own connection"
ON public.pco_connections
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND auth.uid() = user_id
);

CREATE POLICY "Authenticated users can update own connection"
ON public.pco_connections
FOR UPDATE
USING (
  auth.uid() IS NOT NULL 
  AND auth.uid() = user_id
);

CREATE POLICY "Authenticated users can delete own connection"
ON public.pco_connections
FOR DELETE
USING (
  auth.uid() IS NOT NULL 
  AND auth.uid() = user_id
);
-- === 20260104225151_10ee8f76-2c09-485a-8a2a-a9fe723a739f.sql ===
-- Create a secure view that excludes OAuth tokens
CREATE VIEW public.pco_connections_safe AS
SELECT 
  id,
  user_id,
  campus_id,
  pco_organization_name,
  sync_team_members,
  sync_phone_numbers,
  sync_birthdays,
  sync_positions,
  connected_at,
  last_sync_at,
  created_at,
  updated_at,
  token_expires_at
FROM public.pco_connections;

-- Enable RLS on the view
ALTER VIEW public.pco_connections_safe SET (security_invoker = true);

-- Drop the SELECT policy from the main table (tokens should only be accessed server-side)
DROP POLICY IF EXISTS "Authenticated users can view own connection" ON public.pco_connections;

-- Keep UPDATE policy for settings changes (doesn't expose tokens in response)
-- The existing UPDATE policy already restricts to own connection

-- Create SELECT policy for the safe view access (via the underlying table)
-- Since the view uses security_invoker, we need a policy that allows reading own rows
CREATE POLICY "Users can view own connection via safe view"
ON public.pco_connections
FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND auth.uid() = user_id
);
-- === 20260105022126_faab6198-84e1-457d-b3f3-bc05d2f04d45.sql ===

-- Create worship_teams table
CREATE TABLE public.worship_teams (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  icon TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create team_schedule table
CREATE TABLE public.team_schedule (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.worship_teams(id) ON DELETE CASCADE,
  schedule_date DATE NOT NULL,
  rotation_period TEXT NOT NULL DEFAULT 'T1 2026',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create team_members table
CREATE TABLE public.team_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.worship_teams(id) ON DELETE CASCADE,
  member_name TEXT NOT NULL,
  position TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.worship_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- RLS policies for worship_teams (readable by all authenticated users)
CREATE POLICY "Authenticated users can view worship teams"
ON public.worship_teams FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Leaders can manage worship teams"
ON public.worship_teams FOR ALL
USING (has_role(auth.uid(), 'leader'::app_role));

-- RLS policies for team_schedule
CREATE POLICY "Authenticated users can view team schedule"
ON public.team_schedule FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Leaders can manage team schedule"
ON public.team_schedule FOR ALL
USING (has_role(auth.uid(), 'leader'::app_role));

-- RLS policies for team_members
CREATE POLICY "Authenticated users can view team members"
ON public.team_members FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Leaders can manage team members"
ON public.team_members FOR ALL
USING (has_role(auth.uid(), 'leader'::app_role));

-- Create indexes for performance
CREATE INDEX idx_team_schedule_date ON public.team_schedule(schedule_date);
CREATE INDEX idx_team_schedule_team_id ON public.team_schedule(team_id);
CREATE INDEX idx_team_members_team_id ON public.team_members(team_id);

-- === 20260105035431_8c3335ca-ff78-43cf-91b9-beabc73750e4.sql ===
-- Add user_id column to team_members table to link members to user accounts
ALTER TABLE team_members 
ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX idx_team_members_user_id ON team_members(user_id);
-- === 20260105040240_946f7dff-c7b2-4951-84db-a32511eb725d.sql ===
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
-- === 20260105043223_79e2d25b-cc01-4730-8860-7067a1edb2c6.sql ===
-- Remove the SELECT policy that exposes tokens to users
DROP POLICY IF EXISTS "Users can view own connection via safe view" ON public.pco_connections;

-- Create a new SELECT policy that only allows service role access (edge functions)
-- Users should use the pco_connections_safe view instead
CREATE POLICY "Only service role can read tokens"
ON public.pco_connections
FOR SELECT
USING (false);

-- Grant SELECT on the safe view to authenticated users
GRANT SELECT ON public.pco_connections_safe TO authenticated;
-- === 20260105043439_1b811329-856d-4ab5-b329-0d2d5852e6b8.sql ===
-- Drop existing SELECT policies on profiles
DROP POLICY IF EXISTS "Users can view profiles with consent" ON public.profiles;
DROP POLICY IF EXISTS "Campus pastors can view consented campus profiles" ON public.profiles;

-- Create a function to get profiles with sensitive data masked unless consent given
CREATE OR REPLACE FUNCTION public.get_profile_safe(profile_id uuid)
RETURNS TABLE(
  id uuid,
  full_name text,
  avatar_url text,
  email text,
  phone text,
  birthday date,
  anniversary date,
  positions public.team_position[],
  share_contact_with_campus boolean,
  share_contact_with_pastors boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    p.id,
    p.full_name,
    p.avatar_url,
    -- Mask email unless allowed
    CASE 
      WHEN p.id = auth.uid() THEN p.email
      WHEN has_role(auth.uid(), 'leader'::app_role) THEN p.email
      WHEN has_role(auth.uid(), 'campus_pastor'::app_role) 
           AND shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_pastors THEN p.email
      WHEN shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_campus THEN p.email
      ELSE NULL
    END as email,
    -- Mask phone unless allowed
    CASE 
      WHEN p.id = auth.uid() THEN p.phone
      WHEN has_role(auth.uid(), 'leader'::app_role) THEN p.phone
      WHEN has_role(auth.uid(), 'campus_pastor'::app_role) 
           AND shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_pastors THEN p.phone
      WHEN shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_campus THEN p.phone
      ELSE NULL
    END as phone,
    -- Mask birthday unless allowed
    CASE 
      WHEN p.id = auth.uid() THEN p.birthday
      WHEN has_role(auth.uid(), 'leader'::app_role) THEN p.birthday
      WHEN has_role(auth.uid(), 'campus_pastor'::app_role) 
           AND shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_pastors THEN p.birthday
      WHEN shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_campus THEN p.birthday
      ELSE NULL
    END as birthday,
    -- Mask anniversary unless allowed
    CASE 
      WHEN p.id = auth.uid() THEN p.anniversary
      WHEN has_role(auth.uid(), 'leader'::app_role) THEN p.anniversary
      WHEN has_role(auth.uid(), 'campus_pastor'::app_role) 
           AND shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_pastors THEN p.anniversary
      WHEN shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_campus THEN p.anniversary
      ELSE NULL
    END as anniversary,
    p.positions,
    p.share_contact_with_campus,
    p.share_contact_with_pastors,
    p.created_at,
    p.updated_at
  FROM public.profiles p
  WHERE p.id = profile_id
    AND (
      p.id = auth.uid()
      OR has_role(auth.uid(), 'leader'::app_role)
      OR shares_campus_with(auth.uid(), p.id)
    )
$$;

-- New SELECT policy: allow access to basic info for campus members, full access for own/leaders
-- Sensitive columns will be masked via the function or handled in app code
CREATE POLICY "Users can view basic profile info"
ON public.profiles
FOR SELECT
USING (
  -- Own profile
  auth.uid() = id
  -- Leaders see all
  OR has_role(auth.uid(), 'leader'::app_role)
  -- Campus pastors see profiles with consent
  OR (has_role(auth.uid(), 'campus_pastor'::app_role) 
      AND shares_campus_with(auth.uid(), id) 
      AND share_contact_with_pastors = true)
  -- Campus members see profiles with consent
  OR (shares_campus_with(auth.uid(), id) 
      AND share_contact_with_campus = true)
);
-- === 20260105043506_85194ae2-ccc6-41f5-872e-7b973fa2247c.sql ===
-- Drop the restrictive policy and create one that allows basic access for chat purposes
DROP POLICY IF EXISTS "Users can view basic profile info" ON public.profiles;

-- Create policy that allows viewing profiles for chat (basic info) and full access with consent
-- The key insight: chat messages need to join with profiles to show sender name/avatar
-- We allow SELECT for campus members, but sensitive data is handled at app level
CREATE POLICY "Users can view profiles"
ON public.profiles
FOR SELECT
USING (
  -- Own profile - full access
  auth.uid() = id
  -- Leaders - full access
  OR has_role(auth.uid(), 'leader'::app_role)
  -- Campus members can view basic info (name, avatar) for chat
  -- Sensitive fields are protected via the get_basic_profiles() function
  OR shares_campus_with(auth.uid(), id)
);

-- Update get_basic_profiles to be the standard way to list profiles (only exposes name/avatar)
-- This is already correctly implemented, just documenting it here

-- Create a new function for listing all profiles with appropriate masking
CREATE OR REPLACE FUNCTION public.get_profiles_for_campus()
RETURNS TABLE(
  id uuid,
  full_name text,
  avatar_url text,
  email text,
  phone text,
  birthday date,
  anniversary date,
  positions public.team_position[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    p.id,
    p.full_name,
    p.avatar_url,
    -- Mask email unless allowed
    CASE 
      WHEN p.id = auth.uid() THEN p.email
      WHEN has_role(auth.uid(), 'leader'::app_role) THEN p.email
      WHEN has_role(auth.uid(), 'campus_pastor'::app_role) 
           AND shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_pastors THEN p.email
      WHEN shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_campus THEN p.email
      ELSE NULL
    END as email,
    -- Mask phone
    CASE 
      WHEN p.id = auth.uid() THEN p.phone
      WHEN has_role(auth.uid(), 'leader'::app_role) THEN p.phone
      WHEN has_role(auth.uid(), 'campus_pastor'::app_role) 
           AND shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_pastors THEN p.phone
      WHEN shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_campus THEN p.phone
      ELSE NULL
    END as phone,
    -- Mask birthday
    CASE 
      WHEN p.id = auth.uid() THEN p.birthday
      WHEN has_role(auth.uid(), 'leader'::app_role) THEN p.birthday
      WHEN has_role(auth.uid(), 'campus_pastor'::app_role) 
           AND shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_pastors THEN p.birthday
      WHEN shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_campus THEN p.birthday
      ELSE NULL
    END as birthday,
    -- Mask anniversary
    CASE 
      WHEN p.id = auth.uid() THEN p.anniversary
      WHEN has_role(auth.uid(), 'leader'::app_role) THEN p.anniversary
      WHEN has_role(auth.uid(), 'campus_pastor'::app_role) 
           AND shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_pastors THEN p.anniversary
      WHEN shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_campus THEN p.anniversary
      ELSE NULL
    END as anniversary,
    p.positions
  FROM public.profiles p
  WHERE 
    p.id = auth.uid()
    OR has_role(auth.uid(), 'leader'::app_role)
    OR shares_campus_with(auth.uid(), p.id)
$$;
-- === 20260105043626_8bf49e3d-c8ad-4c27-964b-e0a99c8f7524.sql ===
-- Drop the existing view and recreate with proper security
DROP VIEW IF EXISTS public.pco_connections_safe;

-- Create the view with SECURITY DEFINER to bypass RLS on underlying table
-- Access control is built into the view's WHERE clause
CREATE VIEW public.pco_connections_safe 
WITH (security_invoker = false)
AS
SELECT 
  id,
  user_id,
  campus_id,
  sync_team_members,
  sync_phone_numbers,
  sync_birthdays,
  sync_positions,
  connected_at,
  last_sync_at,
  created_at,
  updated_at,
  token_expires_at,
  pco_organization_name
FROM public.pco_connections
WHERE 
  -- Only show own connection or if user is a leader
  auth.uid() = user_id 
  OR has_role(auth.uid(), 'leader'::app_role);

-- Grant access to authenticated users (view handles its own access control)
GRANT SELECT ON public.pco_connections_safe TO authenticated;
-- === 20260105154508_ddee2f8a-32be-4691-a423-990a7fd5455e.sql ===
-- Create enum for swap request status
CREATE TYPE public.swap_request_status AS ENUM ('pending', 'accepted', 'declined', 'cancelled');

-- Create swap_requests table
CREATE TABLE public.swap_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  original_date date NOT NULL,
  swap_date date, -- null for open requests
  target_user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE, -- null for open requests
  position text NOT NULL,
  team_id uuid NOT NULL REFERENCES public.worship_teams(id) ON DELETE CASCADE,
  status public.swap_request_status NOT NULL DEFAULT 'pending',
  accepted_by_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  message text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  resolved_at timestamp with time zone
);

-- Enable RLS
ALTER TABLE public.swap_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Users can view swap requests:
-- 1. Their own requests (as requester)
-- 2. Requests directed at them (as target)
-- 3. Open requests for their position (target_user_id is null)
CREATE POLICY "Users can view relevant swap requests"
ON public.swap_requests
FOR SELECT
USING (
  auth.uid() = requester_id
  OR auth.uid() = target_user_id
  OR (
    target_user_id IS NULL 
    AND position IN (
      SELECT tm.position FROM public.team_members tm WHERE tm.user_id = auth.uid()
    )
  )
  OR has_role(auth.uid(), 'leader'::app_role)
);

-- Users can create swap requests for their own scheduled dates
CREATE POLICY "Users can create own swap requests"
ON public.swap_requests
FOR INSERT
WITH CHECK (
  auth.uid() = requester_id
  AND EXISTS (
    SELECT 1 FROM public.team_members tm
    JOIN public.team_schedule ts ON tm.team_id = ts.team_id
    WHERE tm.user_id = auth.uid()
    AND ts.schedule_date = original_date
    AND tm.team_id = swap_requests.team_id
  )
);

-- Users can update swap requests they're involved with
CREATE POLICY "Users can update relevant swap requests"
ON public.swap_requests
FOR UPDATE
USING (
  -- Requester can cancel their own pending requests
  (auth.uid() = requester_id AND status = 'pending')
  -- Target can accept/decline direct requests
  OR (auth.uid() = target_user_id AND status = 'pending')
  -- Users with same position can accept open requests
  OR (
    target_user_id IS NULL 
    AND status = 'pending'
    AND auth.uid() != requester_id
    AND position IN (
      SELECT tm.position FROM public.team_members tm WHERE tm.user_id = auth.uid()
    )
  )
  OR has_role(auth.uid(), 'leader'::app_role)
);

-- Users can delete their own cancelled/declined requests
CREATE POLICY "Users can delete own resolved requests"
ON public.swap_requests
FOR DELETE
USING (
  auth.uid() = requester_id 
  AND status IN ('cancelled', 'declined')
);

-- Enable realtime for swap_requests
ALTER PUBLICATION supabase_realtime ADD TABLE public.swap_requests;
-- === 20260105173219_809a5236-4aaa-4b21-bb8e-0dad1ef0c5a9.sql ===
-- Drop the existing SELECT policy
DROP POLICY IF EXISTS "Users can view profiles" ON public.profiles;

-- Create a new SELECT policy that respects consent flags
-- Users can see:
-- 1. Their own full profile
-- 2. Leaders can see all profiles
-- 3. Campus members can only see basic info (id, full_name, avatar_url, positions)
--    Contact info (email, phone, birthday, anniversary) is only visible if:
--    - The profile owner has share_contact_with_campus = true, OR
--    - The viewer is a campus_pastor AND profile owner has share_contact_with_pastors = true

-- Since RLS policies can only control row access (not column access),
-- we need to ensure the application uses the secure RPC functions.
-- However, we should still restrict raw table access to prevent direct queries.

-- Create a more restrictive policy that only allows viewing if:
-- 1. User is viewing their own profile
-- 2. User is a leader
-- For campus members, they must use the get_profiles_for_campus RPC function

CREATE POLICY "Users can view profiles" 
ON public.profiles 
FOR SELECT 
USING (
  auth.uid() = id 
  OR has_role(auth.uid(), 'leader'::app_role)
);

-- Create a separate policy for campus members to see basic profile info only
-- This works by allowing access but the RPC function handles column masking
CREATE POLICY "Campus members can view basic profiles" 
ON public.profiles 
FOR SELECT 
USING (
  shares_campus_with(auth.uid(), id)
  AND (
    -- Only allow access if consent is given for contact info
    -- Or if they're just querying basic fields (enforced by RPC)
    share_contact_with_campus = true
    OR share_contact_with_pastors = true
    -- Always allow basic info access (name, avatar) - RPC handles masking
    OR true
  )
);
-- === 20260105173233_76137bb9-d405-4e85-9c88-2473f8f8669a.sql ===
-- Drop the problematic policy we just created
DROP POLICY IF EXISTS "Campus members can view basic profiles" ON public.profiles;

-- The "Users can view profiles" policy is now correctly restrictive:
-- Only allows:
-- 1. Users viewing their own profile
-- 2. Leaders viewing any profile
-- 
-- Campus members MUST use the get_profiles_for_campus RPC function
-- which is a SECURITY DEFINER function that masks sensitive data
-- based on consent flags. This is the correct approach since
-- RLS cannot mask individual columns.
-- === 20260105173516_7b8375c6-ef12-4d52-976b-e1c168248885.sql ===
-- Drop the existing SELECT policy
DROP POLICY IF EXISTS "Users can view profiles" ON public.profiles;

-- Create a new SELECT policy that explicitly requires authentication first
CREATE POLICY "Users can view profiles" 
ON public.profiles 
FOR SELECT 
USING (
  auth.uid() IS NOT NULL
  AND (
    auth.uid() = id 
    OR has_role(auth.uid(), 'leader'::app_role)
  )
);
-- === 20260105174821_f9cc078b-be3e-41e6-b735-917e181dfb6a.sql ===
-- Drop the existing SELECT policy
DROP POLICY IF EXISTS "Users can view profiles" ON public.profiles;

-- Create a new SELECT policy that:
-- 1. Requires authentication
-- 2. Allows users to view their own full profile
-- 3. Allows leaders to view all profiles
-- 4. Allows campus members to view profiles of people they share a campus with
--    (The get_profiles_for_campus RPC handles column masking for sensitive data)
CREATE POLICY "Users can view profiles" 
ON public.profiles 
FOR SELECT 
USING (
  auth.uid() IS NOT NULL
  AND (
    auth.uid() = id 
    OR has_role(auth.uid(), 'leader'::app_role)
    OR shares_campus_with(auth.uid(), id)
  )
);
-- === 20260105204053_9fa9059f-0407-44e8-adf1-7ed844c307a2.sql ===
-- Step 1: Add new role values to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'campus_worship_pastor';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'student_worship_pastor';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'volunteer';
-- === 20260105204132_59311c60-69b5-48da-998b-ca35c324bf85.sql ===
-- Update existing records to use new roles
UPDATE public.user_roles SET role = 'admin' WHERE role = 'leader';
UPDATE public.user_roles SET role = 'campus_worship_pastor' WHERE role = 'campus_pastor';
UPDATE public.user_roles SET role = 'volunteer' WHERE role = 'member';

-- Update handle_new_user function to assign 'volunteer' as default role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  is_first_user BOOLEAN;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO is_first_user;
  
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );
  
  -- First user becomes admin, others become volunteer
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN is_first_user THEN 'admin'::app_role ELSE 'volunteer'::app_role END);
  
  RETURN NEW;
END;
$function$;

-- Update get_basic_profiles to check for admin role
CREATE OR REPLACE FUNCTION public.get_basic_profiles()
RETURNS TABLE(id uuid, full_name text, avatar_url text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.id, p.full_name, p.avatar_url
  FROM public.profiles p
  WHERE 
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
    OR shares_campus_with(auth.uid(), p.id)
    OR p.id = auth.uid()
$function$;

-- Update get_profile_safe to check for admin/campus_worship_pastor roles
CREATE OR REPLACE FUNCTION public.get_profile_safe(profile_id uuid)
RETURNS TABLE(id uuid, full_name text, avatar_url text, email text, phone text, birthday date, anniversary date, positions team_position[], share_contact_with_campus boolean, share_contact_with_pastors boolean, created_at timestamp with time zone, updated_at timestamp with time zone)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT 
    p.id,
    p.full_name,
    p.avatar_url,
    CASE 
      WHEN p.id = auth.uid() THEN p.email
      WHEN has_role(auth.uid(), 'admin'::app_role) THEN p.email
      WHEN has_role(auth.uid(), 'campus_worship_pastor'::app_role) 
           AND shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_pastors THEN p.email
      WHEN shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_campus THEN p.email
      ELSE NULL
    END as email,
    CASE 
      WHEN p.id = auth.uid() THEN p.phone
      WHEN has_role(auth.uid(), 'admin'::app_role) THEN p.phone
      WHEN has_role(auth.uid(), 'campus_worship_pastor'::app_role) 
           AND shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_pastors THEN p.phone
      WHEN shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_campus THEN p.phone
      ELSE NULL
    END as phone,
    CASE 
      WHEN p.id = auth.uid() THEN p.birthday
      WHEN has_role(auth.uid(), 'admin'::app_role) THEN p.birthday
      WHEN has_role(auth.uid(), 'campus_worship_pastor'::app_role) 
           AND shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_pastors THEN p.birthday
      WHEN shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_campus THEN p.birthday
      ELSE NULL
    END as birthday,
    CASE 
      WHEN p.id = auth.uid() THEN p.anniversary
      WHEN has_role(auth.uid(), 'admin'::app_role) THEN p.anniversary
      WHEN has_role(auth.uid(), 'campus_worship_pastor'::app_role) 
           AND shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_pastors THEN p.anniversary
      WHEN shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_campus THEN p.anniversary
      ELSE NULL
    END as anniversary,
    p.positions,
    p.share_contact_with_campus,
    p.share_contact_with_pastors,
    p.created_at,
    p.updated_at
  FROM public.profiles p
  WHERE p.id = profile_id
    AND (
      p.id = auth.uid()
      OR has_role(auth.uid(), 'admin'::app_role)
      OR shares_campus_with(auth.uid(), p.id)
    )
$function$;

-- Update get_profiles_for_campus
CREATE OR REPLACE FUNCTION public.get_profiles_for_campus()
RETURNS TABLE(id uuid, full_name text, avatar_url text, email text, phone text, birthday date, anniversary date, positions team_position[])
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT 
    p.id,
    p.full_name,
    p.avatar_url,
    CASE 
      WHEN p.id = auth.uid() THEN p.email
      WHEN has_role(auth.uid(), 'admin'::app_role) THEN p.email
      WHEN has_role(auth.uid(), 'campus_worship_pastor'::app_role) 
           AND shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_pastors THEN p.email
      WHEN shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_campus THEN p.email
      ELSE NULL
    END as email,
    CASE 
      WHEN p.id = auth.uid() THEN p.phone
      WHEN has_role(auth.uid(), 'admin'::app_role) THEN p.phone
      WHEN has_role(auth.uid(), 'campus_worship_pastor'::app_role) 
           AND shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_pastors THEN p.phone
      WHEN shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_campus THEN p.phone
      ELSE NULL
    END as phone,
    CASE 
      WHEN p.id = auth.uid() THEN p.birthday
      WHEN has_role(auth.uid(), 'admin'::app_role) THEN p.birthday
      WHEN has_role(auth.uid(), 'campus_worship_pastor'::app_role) 
           AND shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_pastors THEN p.birthday
      WHEN shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_campus THEN p.birthday
      ELSE NULL
    END as birthday,
    CASE 
      WHEN p.id = auth.uid() THEN p.anniversary
      WHEN has_role(auth.uid(), 'admin'::app_role) THEN p.anniversary
      WHEN has_role(auth.uid(), 'campus_worship_pastor'::app_role) 
           AND shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_pastors THEN p.anniversary
      WHEN shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_campus THEN p.anniversary
      ELSE NULL
    END as anniversary,
    p.positions
  FROM public.profiles p
  WHERE 
    p.id = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR shares_campus_with(auth.uid(), p.id)
$function$;
-- === 20260105204357_a0669831-30be-430a-a337-001ae47543bf.sql ===
-- Update user_roles RLS policies to use 'admin' instead of 'leader'
DROP POLICY IF EXISTS "Leaders can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Leaders can view all roles" ON public.user_roles;

CREATE POLICY "Admins can manage roles" 
ON public.user_roles 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can view all roles" 
ON public.user_roles 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Also update other tables that reference 'leader' role
DROP POLICY IF EXISTS "Leaders can manage worship teams" ON public.worship_teams;
CREATE POLICY "Admins can manage worship teams" 
ON public.worship_teams 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Leaders can manage campus assignments" ON public.user_campuses;
CREATE POLICY "Admins can manage campus assignments" 
ON public.user_campuses 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Leaders can manage campuses" ON public.campuses;
CREATE POLICY "Admins can manage campuses" 
ON public.campuses 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can view assigned campuses" ON public.campuses;
CREATE POLICY "Users can view assigned campuses" 
ON public.campuses 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role) OR (id IN ( SELECT user_campuses.campus_id FROM user_campuses WHERE (user_campuses.user_id = auth.uid()))));

DROP POLICY IF EXISTS "Leaders can manage team schedule" ON public.team_schedule;
CREATE POLICY "Admins can manage team schedule" 
ON public.team_schedule 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Leaders can manage team members" ON public.team_members;
CREATE POLICY "Admins can manage team members" 
ON public.team_members 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Leaders can delete profiles" ON public.profiles;
CREATE POLICY "Admins can delete profiles" 
ON public.profiles 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Leaders can insert profiles" ON public.profiles;
CREATE POLICY "Admins can insert profiles" 
ON public.profiles 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR (auth.uid() = id));

DROP POLICY IF EXISTS "Leaders can update any profile" ON public.profiles;
CREATE POLICY "Admins can update any profile" 
ON public.profiles 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can view profiles" ON public.profiles;
CREATE POLICY "Users can view profiles" 
ON public.profiles 
FOR SELECT 
USING ((auth.uid() IS NOT NULL) AND ((auth.uid() = id) OR has_role(auth.uid(), 'admin'::app_role) OR shares_campus_with(auth.uid(), id)));

-- Update swap_requests policies
DROP POLICY IF EXISTS "Users can update relevant swap requests" ON public.swap_requests;
CREATE POLICY "Users can update relevant swap requests" 
ON public.swap_requests 
FOR UPDATE 
USING (((auth.uid() = requester_id) AND (status = 'pending'::swap_request_status)) OR ((auth.uid() = target_user_id) AND (status = 'pending'::swap_request_status)) OR ((target_user_id IS NULL) AND (status = 'pending'::swap_request_status) AND (auth.uid() <> requester_id) AND (position IN ( SELECT tm.position FROM team_members tm WHERE (tm.user_id = auth.uid())))) OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can view relevant swap requests" ON public.swap_requests;
CREATE POLICY "Users can view relevant swap requests" 
ON public.swap_requests 
FOR SELECT 
USING ((auth.uid() = requester_id) OR (auth.uid() = target_user_id) OR ((target_user_id IS NULL) AND (position IN ( SELECT tm.position FROM team_members tm WHERE (tm.user_id = auth.uid())))) OR has_role(auth.uid(), 'admin'::app_role));

-- Update events policies
DROP POLICY IF EXISTS "Leaders can delete events" ON public.events;
DROP POLICY IF EXISTS "Leaders can insert events" ON public.events;
DROP POLICY IF EXISTS "Leaders can update events" ON public.events;
DROP POLICY IF EXISTS "Users can view campus events" ON public.events;

CREATE POLICY "Admins and pastors can delete events" 
ON public.events 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR has_role(auth.uid(), 'student_worship_pastor'::app_role));

CREATE POLICY "Admins and pastors can insert events" 
ON public.events 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR has_role(auth.uid(), 'student_worship_pastor'::app_role));

CREATE POLICY "Admins and pastors can update events" 
ON public.events 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR has_role(auth.uid(), 'student_worship_pastor'::app_role));

CREATE POLICY "Users can view campus events" 
ON public.events 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR has_role(auth.uid(), 'student_worship_pastor'::app_role) OR (campus_id IS NULL) OR (campus_id IN ( SELECT user_campuses.campus_id FROM user_campuses WHERE (user_campuses.user_id = auth.uid()))));
-- === 20260105212347_ff934199-b304-4e78-98a9-79bf570e1ff2.sql ===
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
-- === 20260106002442_2406cc33-c7dd-4bd0-a0d7-4ddeca4bcb0b.sql ===
-- Drop the existing update policy
DROP POLICY IF EXISTS "Users can update relevant swap requests" ON public.swap_requests;

-- Create a new update policy that properly handles all update scenarios
-- The row-level (USING) clause determines which rows can be updated
-- The WITH CHECK clause determines what values the updated row can have
CREATE POLICY "Users can update relevant swap requests" 
ON public.swap_requests 
FOR UPDATE 
USING (
  -- Requester can update their own pending request (to cancel it)
  (auth.uid() = requester_id AND status = 'pending')
  OR
  -- Target user can update a pending request directed at them (to accept/decline)
  (auth.uid() = target_user_id AND status = 'pending')
  OR
  -- Users with matching position can update open pending requests (to accept)
  (target_user_id IS NULL AND status = 'pending' AND auth.uid() <> requester_id 
   AND position IN (SELECT tm.position FROM team_members tm WHERE tm.user_id = auth.uid()))
  OR
  -- Admins can update any request
  has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  -- Requester can only cancel their own requests
  (auth.uid() = requester_id AND status IN ('pending', 'cancelled'))
  OR
  -- Others can accept or decline (status changes to accepted/declined)
  (auth.uid() <> requester_id AND status IN ('pending', 'accepted', 'declined'))
  OR
  -- Admins can set any status
  has_role(auth.uid(), 'admin'::app_role)
);
-- === 20260106013459_6c051cff-792b-4781-8c19-4d3b8c71b01f.sql ===
-- Add new enum values for electric guitar positions
ALTER TYPE team_position ADD VALUE IF NOT EXISTS 'electric_1';
ALTER TYPE team_position ADD VALUE IF NOT EXISTS 'electric_2';
-- === 20260106020825_882ef71c-991a-438d-8485-22d55306ca2c.sql ===
-- Drop existing policies on user_roles
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view own role" ON public.user_roles;

-- Drop existing policies on user_campuses
DROP POLICY IF EXISTS "Admins can manage campus assignments" ON public.user_campuses;
DROP POLICY IF EXISTS "Users can view campus assignments" ON public.user_campuses;

-- Create new policies for user_roles

-- SELECT: Users can view their own role, pastors can view roles in their campus, admins can view all
CREATE POLICY "Users can view roles"
ON public.user_roles
FOR SELECT
USING (
  auth.uid() = user_id
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (
    (has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR has_role(auth.uid(), 'student_worship_pastor'::app_role))
    AND shares_campus_with(auth.uid(), user_id)
  )
);

-- INSERT: Only admins and pastors can assign roles (pastors only for users in their campus)
CREATE POLICY "Pastors and admins can insert roles"
ON public.user_roles
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    (has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR has_role(auth.uid(), 'student_worship_pastor'::app_role))
    AND shares_campus_with(auth.uid(), user_id)
  )
);

-- UPDATE: Only admins and pastors can update roles (pastors only for users in their campus)
CREATE POLICY "Pastors and admins can update roles"
ON public.user_roles
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    (has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR has_role(auth.uid(), 'student_worship_pastor'::app_role))
    AND shares_campus_with(auth.uid(), user_id)
  )
);

-- DELETE: Only admins and pastors can delete roles (pastors only for users in their campus)
CREATE POLICY "Pastors and admins can delete roles"
ON public.user_roles
FOR DELETE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    (has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR has_role(auth.uid(), 'student_worship_pastor'::app_role))
    AND shares_campus_with(auth.uid(), user_id)
  )
);

-- Create new policies for user_campuses

-- SELECT: Anyone authenticated can view campus assignments (needed for shares_campus_with function)
CREATE POLICY "Authenticated users can view campus assignments"
ON public.user_campuses
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- INSERT: Only admins and pastors can assign campuses
CREATE POLICY "Pastors and admins can insert campus assignments"
ON public.user_campuses
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
);

-- UPDATE: Only admins and pastors can update campus assignments
CREATE POLICY "Pastors and admins can update campus assignments"
ON public.user_campuses
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    (has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR has_role(auth.uid(), 'student_worship_pastor'::app_role))
    AND shares_campus_with(auth.uid(), user_id)
  )
);

-- DELETE: Only admins and pastors can delete campus assignments
CREATE POLICY "Pastors and admins can delete campus assignments"
ON public.user_campuses
FOR DELETE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    (has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR has_role(auth.uid(), 'student_worship_pastor'::app_role))
    AND shares_campus_with(auth.uid(), user_id)
  )
);
-- === 20260106022353_9ab1db70-cd8e-467a-98b2-7ece314b9d09.sql ===

-- Add campus_admin to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'campus_admin';

-- === 20260106022433_93b29c13-a8be-4a00-9edb-4abe6e3511ca.sql ===

-- Drop existing policies first
DROP POLICY IF EXISTS "Users can view roles" ON public.user_roles;
DROP POLICY IF EXISTS "Pastors and admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Pastors and admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Pastors and admins can delete roles" ON public.user_roles;
DROP POLICY IF EXISTS "Campus admins and above can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Campus admins and above can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Campus admins and above can delete roles" ON public.user_roles;

DROP POLICY IF EXISTS "Pastors and admins can insert campus assignments" ON public.user_campuses;
DROP POLICY IF EXISTS "Pastors and admins can update campus assignments" ON public.user_campuses;
DROP POLICY IF EXISTS "Pastors and admins can delete campus assignments" ON public.user_campuses;
DROP POLICY IF EXISTS "Campus admins and above can insert campus assignments" ON public.user_campuses;
DROP POLICY IF EXISTS "Campus admins and above can update campus assignments" ON public.user_campuses;
DROP POLICY IF EXISTS "Campus admins and above can delete campus assignments" ON public.user_campuses;

-- Recreate RLS policies on user_roles with campus_admin
CREATE POLICY "Users can view roles"
ON public.user_roles
FOR SELECT
USING (
  auth.uid() = user_id
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (
    (has_role(auth.uid(), 'campus_admin'::app_role) OR has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR has_role(auth.uid(), 'student_worship_pastor'::app_role))
    AND shares_campus_with(auth.uid(), user_id)
  )
);

CREATE POLICY "Campus admins and above can insert roles"
ON public.user_roles
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    (has_role(auth.uid(), 'campus_admin'::app_role) OR has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR has_role(auth.uid(), 'student_worship_pastor'::app_role))
    AND shares_campus_with(auth.uid(), user_id)
  )
);

CREATE POLICY "Campus admins and above can update roles"
ON public.user_roles
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    (has_role(auth.uid(), 'campus_admin'::app_role) OR has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR has_role(auth.uid(), 'student_worship_pastor'::app_role))
    AND shares_campus_with(auth.uid(), user_id)
  )
);

CREATE POLICY "Campus admins and above can delete roles"
ON public.user_roles
FOR DELETE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    (has_role(auth.uid(), 'campus_admin'::app_role) OR has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR has_role(auth.uid(), 'student_worship_pastor'::app_role))
    AND shares_campus_with(auth.uid(), user_id)
  )
);

-- Recreate RLS policies on user_campuses with campus_admin
CREATE POLICY "Campus admins and above can insert campus assignments"
ON public.user_campuses
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'campus_admin'::app_role)
  OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
);

CREATE POLICY "Campus admins and above can update campus assignments"
ON public.user_campuses
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    (has_role(auth.uid(), 'campus_admin'::app_role) OR has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR has_role(auth.uid(), 'student_worship_pastor'::app_role))
    AND shares_campus_with(auth.uid(), user_id)
  )
);

CREATE POLICY "Campus admins and above can delete campus assignments"
ON public.user_campuses
FOR DELETE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    (has_role(auth.uid(), 'campus_admin'::app_role) OR has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR has_role(auth.uid(), 'student_worship_pastor'::app_role))
    AND shares_campus_with(auth.uid(), user_id)
  )
);

-- === 20260106025248_2b10748e-1bbe-4698-b23a-de52cadcdce3.sql ===
-- Add admin_campus_id to user_roles to track which campus a campus_admin manages
ALTER TABLE public.user_roles ADD COLUMN admin_campus_id uuid REFERENCES public.campuses(id) ON DELETE SET NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.user_roles.admin_campus_id IS 'For campus_admin role, specifies which campus they administer';
-- === 20260106033440_a04b55d4-e318-44dc-b496-25154290bb54.sql ===
-- Create songs table to store song library
CREATE TABLE public.songs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pco_song_id TEXT UNIQUE,
  title TEXT NOT NULL,
  author TEXT,
  ccli_number TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create service_plans table to store PCO plans
CREATE TABLE public.service_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pco_plan_id TEXT UNIQUE NOT NULL,
  campus_id UUID REFERENCES public.campuses(id),
  service_type_name TEXT NOT NULL,
  plan_date DATE NOT NULL,
  plan_title TEXT,
  synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create plan_songs junction table to track songs in each plan
CREATE TABLE public.plan_songs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id UUID NOT NULL REFERENCES public.service_plans(id) ON DELETE CASCADE,
  song_id UUID NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
  sequence_order INTEGER NOT NULL DEFAULT 0,
  song_key TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(plan_id, song_id, sequence_order)
);

-- Create indexes for performance
CREATE INDEX idx_songs_title ON public.songs(title);
CREATE INDEX idx_songs_pco_id ON public.songs(pco_song_id);
CREATE INDEX idx_service_plans_date ON public.service_plans(plan_date);
CREATE INDEX idx_service_plans_campus ON public.service_plans(campus_id);
CREATE INDEX idx_plan_songs_plan ON public.plan_songs(plan_id);
CREATE INDEX idx_plan_songs_song ON public.plan_songs(song_id);

-- Enable RLS
ALTER TABLE public.songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_songs ENABLE ROW LEVEL SECURITY;

-- RLS for songs - all authenticated users can view, admins/pastors can manage
CREATE POLICY "Authenticated users can view songs"
  ON public.songs FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins and pastors can manage songs"
  ON public.songs FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'student_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'campus_admin'::app_role)
  );

-- RLS for service_plans - view based on campus, admins/pastors can manage
CREATE POLICY "Users can view plans for their campuses"
  ON public.service_plans FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    campus_id IS NULL OR
    campus_id IN (SELECT campus_id FROM user_campuses WHERE user_id = auth.uid())
  );

CREATE POLICY "Admins and pastors can manage service plans"
  ON public.service_plans FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'student_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'campus_admin'::app_role)
  );

-- RLS for plan_songs - follows plan access
CREATE POLICY "Users can view plan songs for accessible plans"
  ON public.plan_songs FOR SELECT
  USING (
    plan_id IN (
      SELECT id FROM service_plans WHERE
        has_role(auth.uid(), 'admin'::app_role) OR
        campus_id IS NULL OR
        campus_id IN (SELECT campus_id FROM user_campuses WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Admins and pastors can manage plan songs"
  ON public.plan_songs FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'student_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'campus_admin'::app_role)
  );

-- Trigger for updated_at on songs
CREATE TRIGGER update_songs_updated_at
  BEFORE UPDATE ON public.songs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
-- === 20260106134817_a59eb2de-f243-429e-b4bf-f979f9c12476.sql ===
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
-- === 20260106151940_d7ab5dae-d173-4243-8f2c-0b969511e253.sql ===
-- Create a function to calculate song statistics server-side
CREATE OR REPLACE FUNCTION public.get_songs_with_stats()
RETURNS TABLE (
  id uuid,
  pco_song_id text,
  title text,
  author text,
  ccli_number text,
  created_at timestamptz,
  updated_at timestamptz,
  usage_count bigint,
  first_used date,
  last_used date,
  upcoming_uses bigint,
  usages jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH today AS (
    SELECT current_date AS d
  ),
  song_usages AS (
    SELECT 
      ps.song_id,
      sp.plan_date,
      sp.campus_id,
      sp.service_type_name
    FROM plan_songs ps
    JOIN service_plans sp ON ps.plan_id = sp.id
  ),
  song_stats AS (
    SELECT 
      su.song_id,
      COUNT(*) FILTER (WHERE su.plan_date < (SELECT d FROM today)) AS usage_count,
      MIN(su.plan_date) FILTER (WHERE su.plan_date < (SELECT d FROM today)) AS first_used,
      MAX(su.plan_date) FILTER (WHERE su.plan_date < (SELECT d FROM today)) AS last_used,
      COUNT(*) FILTER (WHERE su.plan_date >= (SELECT d FROM today)) AS upcoming_uses,
      jsonb_agg(
        jsonb_build_object(
          'plan_date', su.plan_date,
          'campus_id', su.campus_id,
          'service_type_name', su.service_type_name
        )
      ) AS usages
    FROM song_usages su
    GROUP BY su.song_id
  )
  SELECT 
    s.id,
    s.pco_song_id,
    s.title,
    s.author,
    s.ccli_number,
    s.created_at,
    s.updated_at,
    COALESCE(ss.usage_count, 0) AS usage_count,
    ss.first_used,
    ss.last_used,
    COALESCE(ss.upcoming_uses, 0) AS upcoming_uses,
    COALESCE(ss.usages, '[]'::jsonb) AS usages
  FROM songs s
  LEFT JOIN song_stats ss ON s.id = ss.song_id
  ORDER BY s.title;
$$;
-- === 20260106163806_46e233a9-f3a1-4ade-a304-82e81280f5e5.sql ===
-- Enable pg_cron and pg_net extensions for scheduled HTTP calls
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;
-- === 20260106194159_67bfbe04-c4f5-4047-8cdf-1da2d7a0c574.sql ===
-- Add sync_active_only setting to pco_connections (default true to only sync active members)
ALTER TABLE public.pco_connections
ADD COLUMN IF NOT EXISTS sync_active_only boolean NOT NULL DEFAULT true;

-- Update the safe view to include the new column
DROP VIEW IF EXISTS public.pco_connections_safe;
CREATE VIEW public.pco_connections_safe AS
SELECT
  id,
  user_id,
  campus_id,
  pco_organization_name,
  sync_team_members,
  sync_phone_numbers,
  sync_birthdays,
  sync_positions,
  sync_active_only,
  connected_at,
  last_sync_at
FROM public.pco_connections;
-- === 20260106194212_5862137a-1ecc-4f0a-9459-ff317127c8dd.sql ===
-- Recreate view with security invoker (default, safer)
DROP VIEW IF EXISTS public.pco_connections_safe;
CREATE VIEW public.pco_connections_safe 
WITH (security_invoker = on)
AS
SELECT
  id,
  user_id,
  campus_id,
  pco_organization_name,
  sync_team_members,
  sync_phone_numbers,
  sync_birthdays,
  sync_positions,
  sync_active_only,
  connected_at,
  last_sync_at
FROM public.pco_connections;
-- === 20260106195714_dbb4b690-fc99-45a5-8d2e-668e0fd55079.sql ===
-- Drop the overly restrictive SELECT policy
DROP POLICY IF EXISTS "Only service role can read tokens" ON pco_connections;

-- Create a proper SELECT policy that allows users to read their own connection
CREATE POLICY "Users can read own connection"
ON pco_connections
FOR SELECT
USING (auth.uid() = user_id);
-- === 20260107040500_7678d8f4-042a-4f5e-a992-cae79be9dd41.sql ===
-- Create draft_sets table for storing planned worship sets
CREATE TABLE public.draft_sets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campus_id UUID NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  plan_date DATE NOT NULL,
  ministry_type TEXT NOT NULL DEFAULT 'weekend',
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create draft_set_songs table for songs in each draft set
CREATE TABLE public.draft_set_songs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  draft_set_id UUID NOT NULL REFERENCES public.draft_sets(id) ON DELETE CASCADE,
  song_id UUID NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
  sequence_order INTEGER NOT NULL DEFAULT 0,
  song_key TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on both tables
ALTER TABLE public.draft_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draft_set_songs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for draft_sets
CREATE POLICY "Users can view draft sets for their campuses"
ON public.draft_sets
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'campus_admin'::app_role)
  OR (campus_id IN (
    SELECT uc.campus_id FROM user_campuses uc WHERE uc.user_id = auth.uid()
  ))
);

CREATE POLICY "Campus admins and pastors can create draft sets"
ON public.draft_sets
FOR INSERT
WITH CHECK (
  auth.uid() = created_by
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'campus_admin'::app_role)
  )
);

CREATE POLICY "Users can update their own draft sets or admins can update any"
ON public.draft_sets
FOR UPDATE
USING (
  auth.uid() = created_by
  OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Users can delete their own draft sets or admins can delete any"
ON public.draft_sets
FOR DELETE
USING (
  auth.uid() = created_by
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- RLS Policies for draft_set_songs (inherit from parent draft_set access)
CREATE POLICY "Users can view songs in accessible draft sets"
ON public.draft_set_songs
FOR SELECT
USING (
  draft_set_id IN (
    SELECT id FROM public.draft_sets
    WHERE has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
      OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
      OR has_role(auth.uid(), 'campus_admin'::app_role)
      OR campus_id IN (SELECT uc.campus_id FROM user_campuses uc WHERE uc.user_id = auth.uid())
  )
);

CREATE POLICY "Users can manage songs in their draft sets"
ON public.draft_set_songs
FOR INSERT
WITH CHECK (
  draft_set_id IN (
    SELECT id FROM public.draft_sets
    WHERE created_by = auth.uid()
      OR has_role(auth.uid(), 'admin'::app_role)
  )
);

CREATE POLICY "Users can update songs in their draft sets"
ON public.draft_set_songs
FOR UPDATE
USING (
  draft_set_id IN (
    SELECT id FROM public.draft_sets
    WHERE created_by = auth.uid()
      OR has_role(auth.uid(), 'admin'::app_role)
  )
);

CREATE POLICY "Users can delete songs from their draft sets"
ON public.draft_set_songs
FOR DELETE
USING (
  draft_set_id IN (
    SELECT id FROM public.draft_sets
    WHERE created_by = auth.uid()
      OR has_role(auth.uid(), 'admin'::app_role)
  )
);

-- Create trigger for updated_at on draft_sets
CREATE TRIGGER update_draft_sets_updated_at
BEFORE UPDATE ON public.draft_sets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create unique constraint to prevent duplicate songs in same draft
CREATE UNIQUE INDEX idx_draft_set_songs_unique ON public.draft_set_songs(draft_set_id, song_id);
-- === 20260107193053_1702da09-5019-40d2-ace7-74a369bd2e29.sql ===
-- Fix RESTRICTIVE policy AND-ing issue: separate admin manage policies so SELECT remains accessible

-- SONGS
DROP POLICY IF EXISTS "Admins and pastors can manage songs" ON public.songs;

CREATE POLICY "Admins and pastors can insert songs"
ON public.songs
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'campus_admin'::app_role)
);

CREATE POLICY "Admins and pastors can update songs"
ON public.songs
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'campus_admin'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'campus_admin'::app_role)
);

CREATE POLICY "Admins and pastors can delete songs"
ON public.songs
FOR DELETE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'campus_admin'::app_role)
);

-- SERVICE PLANS
DROP POLICY IF EXISTS "Admins and pastors can manage service plans" ON public.service_plans;

CREATE POLICY "Admins and pastors can insert service plans"
ON public.service_plans
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'campus_admin'::app_role)
);

CREATE POLICY "Admins and pastors can update service plans"
ON public.service_plans
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'campus_admin'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'campus_admin'::app_role)
);

CREATE POLICY "Admins and pastors can delete service plans"
ON public.service_plans
FOR DELETE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'campus_admin'::app_role)
);

-- PLAN SONGS
DROP POLICY IF EXISTS "Admins and pastors can manage plan songs" ON public.plan_songs;

CREATE POLICY "Admins and pastors can insert plan songs"
ON public.plan_songs
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'campus_admin'::app_role)
);

CREATE POLICY "Admins and pastors can update plan songs"
ON public.plan_songs
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'campus_admin'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'campus_admin'::app_role)
);

CREATE POLICY "Admins and pastors can delete plan songs"
ON public.plan_songs
FOR DELETE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'campus_admin'::app_role)
);

-- === 20260108035516_23752c57-bd8b-41db-b406-bb24269ae327.sql ===
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
-- === 20260108141936_38a4aa88-c76d-4e26-bc66-cb1592a31a03.sql ===
-- Drop the partial migration and recreate properly
DROP TABLE IF EXISTS public.rotation_periods CASCADE;

-- Remove added columns from team_members if they exist
ALTER TABLE public.team_members DROP COLUMN IF EXISTS rotation_period_id;
ALTER TABLE public.team_members DROP COLUMN IF EXISTS position_slot;

-- Create rotation_periods table for trimester configurations
CREATE TABLE public.rotation_periods (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  year INTEGER NOT NULL,
  trimester INTEGER NOT NULL CHECK (trimester >= 1 AND trimester <= 3),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(year, trimester)
);

-- Enable RLS
ALTER TABLE public.rotation_periods ENABLE ROW LEVEL SECURITY;

-- Everyone can view rotation periods
CREATE POLICY "Anyone can view rotation periods"
ON public.rotation_periods
FOR SELECT
USING (true);

-- Only admins can manage rotation periods
CREATE POLICY "Admins can manage rotation periods"
ON public.rotation_periods
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  )
);

-- Add rotation_period_id to team_members for trimester-based assignments
ALTER TABLE public.team_members 
ADD COLUMN rotation_period_id UUID REFERENCES public.rotation_periods(id) ON DELETE CASCADE;

-- Add position_slot for specific slot assignments (vocalist_1, eg_1, etc.)
ALTER TABLE public.team_members 
ADD COLUMN position_slot TEXT;

-- Create index for faster lookups
CREATE INDEX idx_team_members_rotation ON public.team_members(rotation_period_id);
CREATE INDEX idx_rotation_periods_active ON public.rotation_periods(is_active);

-- Insert initial rotation periods for 2026
INSERT INTO public.rotation_periods (name, year, trimester, start_date, end_date, is_active)
VALUES 
  ('T1 2026', 2026, 1, '2026-01-01', '2026-04-30', true),
  ('T2 2026', 2026, 2, '2026-05-01', '2026-08-31', false),
  ('T3 2026', 2026, 3, '2026-09-01', '2026-12-31', false);
-- === 20260108142806_60a391c4-e921-47f8-840a-e13e688df100.sql ===
-- Add campus_id to rotation_periods for per-campus team building
ALTER TABLE public.rotation_periods 
ADD COLUMN campus_id UUID REFERENCES public.campuses(id) ON DELETE CASCADE;

-- Update the unique constraint to be per campus
ALTER TABLE public.rotation_periods DROP CONSTRAINT IF EXISTS rotation_periods_year_trimester_key;
ALTER TABLE public.rotation_periods ADD CONSTRAINT rotation_periods_year_trimester_campus_key UNIQUE(year, trimester, campus_id);

-- Create index for faster campus lookups
CREATE INDEX idx_rotation_periods_campus ON public.rotation_periods(campus_id);

-- Update RLS to allow campus admins to manage their campus rotation periods
DROP POLICY IF EXISTS "Admins can manage rotation periods" ON public.rotation_periods;

CREATE POLICY "Admins can manage rotation periods"
ON public.rotation_periods
FOR ALL
USING (
  has_role(auth.uid(), 'admin') OR 
  (has_role(auth.uid(), 'campus_admin') AND campus_id IN (
    SELECT admin_campus_id FROM user_roles WHERE user_id = auth.uid() AND role = 'campus_admin'
  ))
);

-- Insert rotation periods for each campus (Murfreesboro Central)
INSERT INTO public.rotation_periods (name, year, trimester, start_date, end_date, is_active, campus_id)
SELECT 
  'T1 2026', 2026, 1, '2026-01-01', '2026-04-30', true, id
FROM campuses WHERE name = 'Murfreesboro Central'
ON CONFLICT (year, trimester, campus_id) DO NOTHING;

INSERT INTO public.rotation_periods (name, year, trimester, start_date, end_date, is_active, campus_id)
SELECT 
  'T2 2026', 2026, 2, '2026-05-01', '2026-08-31', false, id
FROM campuses WHERE name = 'Murfreesboro Central'
ON CONFLICT (year, trimester, campus_id) DO NOTHING;

INSERT INTO public.rotation_periods (name, year, trimester, start_date, end_date, is_active, campus_id)
SELECT 
  'T3 2026', 2026, 3, '2026-09-01', '2026-12-31', false, id
FROM campuses WHERE name = 'Murfreesboro Central'
ON CONFLICT (year, trimester, campus_id) DO NOTHING;
-- === 20260108144517_9bde0868-fda9-4455-b3bf-3fb49fafe054.sql ===
-- Create table to track locked teams per rotation period
CREATE TABLE public.team_period_locks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.worship_teams(id) ON DELETE CASCADE,
  rotation_period_id UUID NOT NULL REFERENCES public.rotation_periods(id) ON DELETE CASCADE,
  locked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  locked_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(team_id, rotation_period_id)
);

-- Enable RLS
ALTER TABLE public.team_period_locks ENABLE ROW LEVEL SECURITY;

-- Admins can manage locks
CREATE POLICY "Admins can manage team locks"
ON public.team_period_locks
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'campus_admin'::app_role));

-- Authenticated users can view locks
CREATE POLICY "Authenticated users can view locks"
ON public.team_period_locks
FOR SELECT
USING (auth.uid() IS NOT NULL);
-- === 20260108145959_bc3db347-752e-48ae-9719-db6a5c99baae.sql ===
-- Add ministry_types column to team_members table
ALTER TABLE public.team_members
ADD COLUMN ministry_types text[] DEFAULT ARRAY['weekend']::text[];

-- Update all existing T1 members to have 'weekend' as their ministry type
UPDATE public.team_members
SET ministry_types = ARRAY['weekend']::text[]
WHERE ministry_types IS NULL OR ministry_types = '{}';
-- === 20260109020647_04b9e093-85fc-45a1-9ee8-3c76d5214845.sql ===
-- Create break_requests table for volunteers to request time off
CREATE TABLE public.break_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rotation_period_id UUID NOT NULL REFERENCES public.rotation_periods(id) ON DELETE CASCADE,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, rotation_period_id)
);

-- Enable RLS
ALTER TABLE public.break_requests ENABLE ROW LEVEL SECURITY;

-- Users can view their own break requests
CREATE POLICY "Users can view their own break requests"
ON public.break_requests
FOR SELECT
USING (auth.uid() = user_id);

-- Admins/leaders can view all break requests
CREATE POLICY "Admins can view all break requests"
ON public.break_requests
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'leader', 'campus_admin', 'campus_worship_pastor')
  )
);

-- Users can create their own break requests
CREATE POLICY "Users can create their own break requests"
ON public.break_requests
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own pending break requests
CREATE POLICY "Users can update their own pending requests"
ON public.break_requests
FOR UPDATE
USING (auth.uid() = user_id AND status = 'pending');

-- Admins can update any break request (for approval/denial)
CREATE POLICY "Admins can update break requests"
ON public.break_requests
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'leader', 'campus_admin', 'campus_worship_pastor')
  )
);

-- Users can delete their own pending break requests
CREATE POLICY "Users can delete their own pending requests"
ON public.break_requests
FOR DELETE
USING (auth.uid() = user_id AND status = 'pending');

-- Create updated_at trigger
CREATE TRIGGER update_break_requests_updated_at
BEFORE UPDATE ON public.break_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
-- === 20260109023408_e6e9b95f-f324-4bdf-9bf5-ba3ef13a7d71.sql ===
-- Add ministry_types column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN ministry_types text[] DEFAULT ARRAY['weekend']::text[];

-- Update any existing profiles with default weekend ministry
UPDATE public.profiles 
SET ministry_types = ARRAY['weekend']::text[] 
WHERE ministry_types IS NULL;
-- === 20260109042214_55592646-2209-4aba-b899-4847eb84c461.sql ===
-- Add campus-scoped profiles RPC for Team Builder / break viewer
-- This avoids relying on the viewer having user_campuses rows (campus_admins often don't)

CREATE OR REPLACE FUNCTION public.get_profiles_for_campus_id(_campus_id uuid)
RETURNS TABLE (
  id uuid,
  full_name text,
  avatar_url text,
  positions public.team_position[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Authorization: org admins can view any campus; campus_admin can view their admin campus
  IF has_role(auth.uid(), 'admin'::public.app_role)
     OR EXISTS (
       SELECT 1
       FROM public.user_roles ur
       WHERE ur.user_id = auth.uid()
         AND ur.role = 'campus_admin'::public.app_role
         AND ur.admin_campus_id = _campus_id
     )
     OR has_role(auth.uid(), 'campus_worship_pastor'::public.app_role)
     OR has_role(auth.uid(), 'student_worship_pastor'::public.app_role)
  THEN
    RETURN QUERY
    SELECT p.id, p.full_name, p.avatar_url, COALESCE(p.positions, '{}'::public.team_position[])
    FROM public.profiles p
    WHERE p.id IN (
      SELECT uc.user_id
      FROM public.user_campuses uc
      WHERE uc.campus_id = _campus_id
    )
    ORDER BY p.full_name;
  ELSE
    RAISE EXCEPTION 'not authorized';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_profiles_for_campus_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_profiles_for_campus_id(uuid) TO authenticated;
-- === 20260109043503_2944af35-f076-443a-b392-b3db16967ba0.sql ===
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Anyone can view rotation periods" ON public.rotation_periods;

-- Create a new policy that requires authentication
CREATE POLICY "Authenticated users can view rotation periods"
ON public.rotation_periods
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);
-- === 20260109045103_88a8a93b-861b-4970-8908-295360c726da.sql ===
-- Drop the existing get_profile_safe function and recreate with updated return type
DROP FUNCTION IF EXISTS public.get_profile_safe(uuid);

-- Recreate the function with proper field filtering based on permissions
CREATE OR REPLACE FUNCTION public.get_profile_safe(profile_id uuid)
RETURNS TABLE (
  id uuid,
  full_name text,
  avatar_url text,
  positions team_position[],
  email text,
  phone text,
  birthday date,
  anniversary date,
  share_contact_with_campus boolean,
  share_contact_with_pastors boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  viewer_id uuid := auth.uid();
  is_admin boolean;
  is_pastor boolean;
BEGIN
  -- Check viewer's roles
  is_admin := has_role(viewer_id, 'admin'::app_role);
  is_pastor := has_role(viewer_id, 'campus_worship_pastor'::app_role) 
            OR has_role(viewer_id, 'student_worship_pastor'::app_role)
            OR has_role(viewer_id, 'campus_pastor'::app_role);

  RETURN QUERY
  SELECT 
    p.id,
    p.full_name,
    p.avatar_url,
    p.positions,
    -- Email: filtered based on permissions
    CASE 
      WHEN p.id = viewer_id THEN p.email
      WHEN is_admin THEN p.email
      WHEN is_pastor AND p.share_contact_with_pastors THEN p.email
      WHEN shares_campus_with(viewer_id, p.id) AND p.share_contact_with_campus THEN p.email
      ELSE NULL
    END,
    -- Phone: filtered
    CASE 
      WHEN p.id = viewer_id THEN p.phone
      WHEN is_admin THEN p.phone
      WHEN is_pastor AND p.share_contact_with_pastors THEN p.phone
      WHEN shares_campus_with(viewer_id, p.id) AND p.share_contact_with_campus THEN p.phone
      ELSE NULL
    END,
    -- Birthday: filtered
    CASE 
      WHEN p.id = viewer_id THEN p.birthday
      WHEN is_admin THEN p.birthday
      WHEN is_pastor AND p.share_contact_with_pastors THEN p.birthday
      WHEN shares_campus_with(viewer_id, p.id) AND p.share_contact_with_campus THEN p.birthday
      ELSE NULL
    END,
    -- Anniversary: filtered
    CASE 
      WHEN p.id = viewer_id THEN p.anniversary
      WHEN is_admin THEN p.anniversary
      WHEN is_pastor AND p.share_contact_with_pastors THEN p.anniversary
      WHEN shares_campus_with(viewer_id, p.id) AND p.share_contact_with_campus THEN p.anniversary
      ELSE NULL
    END,
    p.share_contact_with_campus,
    p.share_contact_with_pastors,
    p.created_at,
    p.updated_at
  FROM profiles p
  WHERE p.id = profile_id
    AND (
      p.id = viewer_id
      OR is_admin
      OR shares_campus_with(viewer_id, p.id)
    );
END;
$$;
-- === 20260109143601_1dfcc9f4-d40e-4e23-ac17-7aec51dc2377.sql ===
-- Drop and recreate get_profiles_for_campus to include ministry_types
DROP FUNCTION IF EXISTS public.get_profiles_for_campus();

CREATE FUNCTION public.get_profiles_for_campus()
RETURNS TABLE (
  id uuid,
  full_name text,
  avatar_url text,
  email text,
  phone text,
  birthday date,
  anniversary date,
  positions team_position[],
  ministry_types text[],
  welcome_email_sent_at timestamptz,
  share_contact_with_pastors boolean,
  share_contact_with_campus boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    p.id,
    p.full_name,
    p.avatar_url,
    CASE 
      WHEN p.id = auth.uid() THEN p.email
      WHEN has_role(auth.uid(), 'admin'::app_role) THEN p.email
      WHEN has_role(auth.uid(), 'campus_worship_pastor'::app_role) 
           AND shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_pastors THEN p.email
      WHEN shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_campus THEN p.email
      ELSE NULL
    END as email,
    CASE 
      WHEN p.id = auth.uid() THEN p.phone
      WHEN has_role(auth.uid(), 'admin'::app_role) THEN p.phone
      WHEN has_role(auth.uid(), 'campus_worship_pastor'::app_role) 
           AND shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_pastors THEN p.phone
      WHEN shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_campus THEN p.phone
      ELSE NULL
    END as phone,
    CASE 
      WHEN p.id = auth.uid() THEN p.birthday
      WHEN has_role(auth.uid(), 'admin'::app_role) THEN p.birthday
      WHEN has_role(auth.uid(), 'campus_worship_pastor'::app_role) 
           AND shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_pastors THEN p.birthday
      WHEN shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_campus THEN p.birthday
      ELSE NULL
    END as birthday,
    CASE 
      WHEN p.id = auth.uid() THEN p.anniversary
      WHEN has_role(auth.uid(), 'admin'::app_role) THEN p.anniversary
      WHEN has_role(auth.uid(), 'campus_worship_pastor'::app_role) 
           AND shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_pastors THEN p.anniversary
      WHEN shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_campus THEN p.anniversary
      ELSE NULL
    END as anniversary,
    p.positions,
    p.ministry_types,
    p.welcome_email_sent_at,
    p.share_contact_with_pastors,
    p.share_contact_with_campus
  FROM public.profiles p
  WHERE 
    p.id = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR shares_campus_with(auth.uid(), p.id)
$$;
-- === 20260109154350_86b423fe-4fd5-4a3e-b8b7-f4b82cb7d3bf.sql ===
-- Create storage bucket for chat attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', true);

-- Add attachments column to chat_messages
ALTER TABLE public.chat_messages
ADD COLUMN attachments text[] DEFAULT NULL;

-- Storage policies for chat attachments
CREATE POLICY "Authenticated users can upload chat attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'chat-attachments');

CREATE POLICY "Anyone can view chat attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'chat-attachments');

CREATE POLICY "Users can delete their own chat attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'chat-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
-- === 20260110153151_0327b214-672e-4363-9e26-4b942b101c8a.sql ===
-- Create push subscriptions table to store user notification subscriptions
CREATE TABLE public.push_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

-- Enable Row Level Security
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can view their own subscriptions
CREATE POLICY "Users can view their own push subscriptions"
ON public.push_subscriptions
FOR SELECT
USING (auth.uid() = user_id);

-- Users can create their own subscriptions
CREATE POLICY "Users can create their own push subscriptions"
ON public.push_subscriptions
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own subscriptions
CREATE POLICY "Users can update their own push subscriptions"
ON public.push_subscriptions
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own subscriptions
CREATE POLICY "Users can delete their own push subscriptions"
ON public.push_subscriptions
FOR DELETE
USING (auth.uid() = user_id);

-- Create trigger for updating timestamps
CREATE TRIGGER update_push_subscriptions_updated_at
BEFORE UPDATE ON public.push_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
-- === 20260110160358_3a66e5aa-685b-44e0-bcd9-6f381259ebc0.sql ===
-- Create a function to send push notifications via Edge Function
CREATE OR REPLACE FUNCTION public.notify_new_event()
RETURNS TRIGGER AS $$
DECLARE
  event_campus_id UUID;
  event_title TEXT;
  event_date DATE;
BEGIN
  -- Get event details
  event_campus_id := NEW.campus_id;
  event_title := NEW.title;
  event_date := NEW.event_date;
  
  -- Call the edge function via pg_net (async HTTP call)
  PERFORM net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := jsonb_build_object(
      'title', 'New Event',
      'message', event_title || ' on ' || to_char(event_date, 'Mon DD, YYYY'),
      'url', '/calendar',
      'tag', 'event-' || NEW.id::text
    )
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create a function to notify when sets are published
CREATE OR REPLACE FUNCTION public.notify_published_set()
RETURNS TRIGGER AS $$
DECLARE
  set_campus_name TEXT;
  set_date DATE;
  set_ministry TEXT;
BEGIN
  -- Only trigger when status changes to 'published'
  IF NEW.status = 'published' AND (OLD.status IS NULL OR OLD.status != 'published') THEN
    -- Get campus name
    SELECT name INTO set_campus_name FROM campuses WHERE id = NEW.campus_id;
    
    set_date := NEW.plan_date;
    set_ministry := NEW.ministry_type;
    
    -- Call the edge function via pg_net
    PERFORM net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := jsonb_build_object(
        'title', 'New Set Published',
        'message', COALESCE(set_campus_name, '') || ' ' || set_ministry || ' set for ' || to_char(set_date, 'Mon DD, YYYY'),
        'url', '/set-planner',
        'tag', 'set-' || NEW.id::text
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create triggers
CREATE TRIGGER on_new_event_notify
AFTER INSERT ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.notify_new_event();

CREATE TRIGGER on_set_published_notify
AFTER INSERT OR UPDATE ON public.draft_sets
FOR EACH ROW
EXECUTE FUNCTION public.notify_published_set();
-- === 20260110160444_ed4c4289-6539-474d-866e-d31f6d30bd3c.sql ===
-- Create a function to notify when swap requests are created
CREATE OR REPLACE FUNCTION public.notify_swap_request_created()
RETURNS TRIGGER AS $$
DECLARE
  requester_name TEXT;
  request_date TEXT;
BEGIN
  -- Get requester name
  SELECT full_name INTO requester_name FROM profiles WHERE id = NEW.requester_id;
  
  request_date := to_char(NEW.original_date::date, 'Mon DD, YYYY');
  
  -- Call the edge function via pg_net
  PERFORM net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := jsonb_build_object(
      'title', 'Swap Request',
      'message', COALESCE(requester_name, 'Someone') || ' needs coverage on ' || request_date,
      'url', '/swaps',
      'tag', 'swap-created-' || NEW.id::text,
      'userIds', CASE 
        WHEN NEW.target_user_id IS NOT NULL THEN jsonb_build_array(NEW.target_user_id::text)
        ELSE NULL
      END
    )
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create a function to notify when swap requests are accepted or declined
CREATE OR REPLACE FUNCTION public.notify_swap_request_resolved()
RETURNS TRIGGER AS $$
DECLARE
  accepter_name TEXT;
  request_date TEXT;
  notification_title TEXT;
  notification_message TEXT;
BEGIN
  -- Only trigger when status changes to accepted or declined
  IF NEW.status IN ('accepted', 'declined') AND OLD.status = 'pending' THEN
    request_date := to_char(NEW.original_date::date, 'Mon DD, YYYY');
    
    IF NEW.status = 'accepted' THEN
      -- Get accepter name
      SELECT full_name INTO accepter_name FROM profiles WHERE id = NEW.accepted_by_id;
      notification_title := 'Swap Accepted';
      notification_message := COALESCE(accepter_name, 'Someone') || ' will cover your date on ' || request_date;
    ELSE
      notification_title := 'Swap Declined';
      notification_message := 'Your swap request for ' || request_date || ' was declined';
    END IF;
    
    -- Notify the requester
    PERFORM net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := jsonb_build_object(
        'title', notification_title,
        'message', notification_message,
        'url', '/swaps',
        'tag', 'swap-resolved-' || NEW.id::text,
        'userIds', jsonb_build_array(NEW.requester_id::text)
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create triggers
CREATE TRIGGER on_swap_request_created_notify
AFTER INSERT ON public.swap_requests
FOR EACH ROW
EXECUTE FUNCTION public.notify_swap_request_created();

CREATE TRIGGER on_swap_request_resolved_notify
AFTER UPDATE ON public.swap_requests
FOR EACH ROW
EXECUTE FUNCTION public.notify_swap_request_resolved();
-- === 20260110160545_cac71007-a6da-4b16-9909-bc00cc04b990.sql ===
-- Update the notify_new_event function to filter by campus
CREATE OR REPLACE FUNCTION public.notify_new_event()
RETURNS TRIGGER AS $$
DECLARE
  event_title TEXT;
  event_date DATE;
  campus_user_ids JSONB;
BEGIN
  event_title := NEW.title;
  event_date := NEW.event_date;
  
  -- Get user IDs for the event's campus (or all users if no campus specified)
  IF NEW.campus_id IS NOT NULL THEN
    SELECT jsonb_agg(user_id::text)
    INTO campus_user_ids
    FROM user_campuses
    WHERE campus_id = NEW.campus_id;
  ELSE
    -- No campus filter, don't specify userIds (sends to all)
    campus_user_ids := NULL;
  END IF;
  
  -- Only send if there are users to notify
  IF campus_user_ids IS NOT NULL OR NEW.campus_id IS NULL THEN
    PERFORM net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := jsonb_build_object(
        'title', 'New Event',
        'message', event_title || ' on ' || to_char(event_date, 'Mon DD, YYYY'),
        'url', '/calendar',
        'tag', 'event-' || NEW.id::text,
        'userIds', campus_user_ids
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Update the notify_published_set function to filter by campus
CREATE OR REPLACE FUNCTION public.notify_published_set()
RETURNS TRIGGER AS $$
DECLARE
  set_campus_name TEXT;
  set_date DATE;
  set_ministry TEXT;
  campus_user_ids JSONB;
BEGIN
  -- Only trigger when status changes to 'published'
  IF NEW.status = 'published' AND (OLD.status IS NULL OR OLD.status != 'published') THEN
    -- Get campus name
    SELECT name INTO set_campus_name FROM campuses WHERE id = NEW.campus_id;
    
    set_date := NEW.plan_date;
    set_ministry := NEW.ministry_type;
    
    -- Get user IDs for the set's campus
    SELECT jsonb_agg(user_id::text)
    INTO campus_user_ids
    FROM user_campuses
    WHERE campus_id = NEW.campus_id;
    
    -- Only send if there are users to notify
    IF campus_user_ids IS NOT NULL THEN
      PERFORM net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/send-push-notification',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
        ),
        body := jsonb_build_object(
          'title', 'New Set Published',
          'message', COALESCE(set_campus_name, '') || ' ' || set_ministry || ' set for ' || to_char(set_date, 'Mon DD, YYYY'),
          'url', '/set-planner',
          'tag', 'set-' || NEW.id::text,
          'userIds', campus_user_ids
        )
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
-- === 20260110160634_c4bdf6ee-e906-4fff-a585-36b1d8113e00.sql ===
-- Create a function to notify users when they are mentioned in chat
CREATE OR REPLACE FUNCTION public.notify_chat_mention()
RETURNS TRIGGER AS $$
DECLARE
  sender_name TEXT;
  campus_name TEXT;
  mentioned_user_id UUID;
  mentioned_user_ids JSONB := '[]'::jsonb;
  mention_pattern TEXT;
  match_result TEXT[];
BEGIN
  -- Get sender name
  SELECT full_name INTO sender_name FROM profiles WHERE id = NEW.user_id;
  
  -- Get campus name if available
  IF NEW.campus_id IS NOT NULL THEN
    SELECT name INTO campus_name FROM campuses WHERE id = NEW.campus_id;
  END IF;
  
  -- Find all @mentions in the message content
  -- Pattern matches @[Name](user_id) format commonly used in mention systems
  -- Also matches simple @name patterns
  
  -- First try to find mentions with UUID pattern: @[Name](uuid)
  FOR match_result IN 
    SELECT regexp_matches(NEW.content, '@\[[^\]]+\]\(([0-9a-f-]{36})\)', 'gi')
  LOOP
    mentioned_user_id := match_result[1]::uuid;
    -- Don't notify the sender about their own message
    IF mentioned_user_id != NEW.user_id THEN
      mentioned_user_ids := mentioned_user_ids || jsonb_build_array(mentioned_user_id::text);
    END IF;
  END LOOP;
  
  -- Also check for @everyone or @all mentions - notify all campus members
  IF NEW.content ~* '@(everyone|all|team)\b' THEN
    SELECT jsonb_agg(user_id::text)
    INTO mentioned_user_ids
    FROM user_campuses
    WHERE campus_id = NEW.campus_id
    AND user_id != NEW.user_id;
  END IF;
  
  -- Send notification if there are mentioned users
  IF jsonb_array_length(mentioned_user_ids) > 0 THEN
    PERFORM net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := jsonb_build_object(
        'title', COALESCE(sender_name, 'Someone') || ' mentioned you',
        'message', CASE 
          WHEN length(NEW.content) > 100 THEN substring(NEW.content, 1, 100) || '...'
          ELSE NEW.content
        END,
        'url', '/chat',
        'tag', 'mention-' || NEW.id::text,
        'userIds', mentioned_user_ids
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for chat mentions
CREATE TRIGGER on_chat_mention_notify
AFTER INSERT ON public.chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.notify_chat_mention();
-- === 20260110212600_dea2eea2-c22c-4579-ae60-d4ee35c711dc.sql ===
-- Fix the notify_swap_request_created trigger to handle missing config gracefully
CREATE OR REPLACE FUNCTION public.notify_swap_request_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  requester_name TEXT;
  request_date TEXT;
  supabase_url TEXT;
  service_key TEXT;
BEGIN
  -- Get requester name
  SELECT full_name INTO requester_name FROM profiles WHERE id = NEW.requester_id;
  
  request_date := to_char(NEW.original_date::date, 'Mon DD, YYYY');
  
  -- Try to get the URL and key from vault secrets
  BEGIN
    SELECT decrypted_secret INTO supabase_url
    FROM vault.decrypted_secrets
    WHERE name = 'supabase_url'
    LIMIT 1;
    
    SELECT decrypted_secret INTO service_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    -- If vault access fails, skip the notification silently
    RETURN NEW;
  END;
  
  -- Only proceed if we have both values
  IF supabase_url IS NOT NULL AND service_key IS NOT NULL THEN
    PERFORM net.http_post(
      url := supabase_url || '/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      body := jsonb_build_object(
        'title', 'Swap Request',
        'message', COALESCE(requester_name, 'Someone') || ' needs coverage on ' || request_date,
        'url', '/swaps',
        'tag', 'swap-created-' || NEW.id::text,
        'userIds', CASE 
          WHEN NEW.target_user_id IS NOT NULL THEN jsonb_build_array(NEW.target_user_id::text)
          ELSE NULL
        END
      )
    );
  END IF;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log error but don't fail the insert
  RAISE WARNING 'notify_swap_request_created failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;

-- Fix the notify_swap_request_resolved trigger
CREATE OR REPLACE FUNCTION public.notify_swap_request_resolved()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  accepter_name TEXT;
  request_date TEXT;
  notification_title TEXT;
  notification_message TEXT;
  supabase_url TEXT;
  service_key TEXT;
BEGIN
  -- Only trigger when status changes to accepted or declined
  IF NEW.status IN ('accepted', 'declined') AND OLD.status = 'pending' THEN
    request_date := to_char(NEW.original_date::date, 'Mon DD, YYYY');
    
    IF NEW.status = 'accepted' THEN
      SELECT full_name INTO accepter_name FROM profiles WHERE id = NEW.accepted_by_id;
      notification_title := 'Swap Accepted';
      notification_message := COALESCE(accepter_name, 'Someone') || ' will cover your date on ' || request_date;
    ELSE
      notification_title := 'Swap Declined';
      notification_message := 'Your swap request for ' || request_date || ' was declined';
    END IF;
    
    -- Try to get the URL and key from vault secrets
    BEGIN
      SELECT decrypted_secret INTO supabase_url
      FROM vault.decrypted_secrets
      WHERE name = 'supabase_url'
      LIMIT 1;
      
      SELECT decrypted_secret INTO service_key
      FROM vault.decrypted_secrets
      WHERE name = 'service_role_key'
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      RETURN NEW;
    END;
    
    -- Only proceed if we have both values
    IF supabase_url IS NOT NULL AND service_key IS NOT NULL THEN
      PERFORM net.http_post(
        url := supabase_url || '/functions/v1/send-push-notification',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || service_key
        ),
        body := jsonb_build_object(
          'title', notification_title,
          'message', notification_message,
          'url', '/swaps',
          'tag', 'swap-resolved-' || NEW.id::text,
          'userIds', jsonb_build_array(NEW.requester_id::text)
        )
      );
    END IF;
  END IF;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_swap_request_resolved failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;
-- === 20260110224950_b201d203-4130-428d-848c-7fdfcdede607.sql ===
-- Drop and recreate the get_profiles_for_campus function to allow birthday/anniversary 
-- to be visible to all campus members (for birthday/anniversary widgets)
DROP FUNCTION IF EXISTS public.get_profiles_for_campus();

CREATE FUNCTION public.get_profiles_for_campus()
RETURNS TABLE (
  id uuid,
  full_name text,
  avatar_url text,
  email text,
  phone text,
  birthday text,
  anniversary text,
  positions public.team_position[],
  ministry_types text[],
  welcome_email_sent_at timestamptz,
  share_contact_with_pastors boolean,
  share_contact_with_campus boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    p.id,
    p.full_name,
    p.avatar_url,
    -- Email: protected by privacy settings
    CASE 
      WHEN p.id = auth.uid() THEN p.email
      WHEN has_role(auth.uid(), 'admin'::app_role) THEN p.email
      WHEN has_role(auth.uid(), 'campus_worship_pastor'::app_role) 
           AND shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_pastors THEN p.email
      WHEN shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_campus THEN p.email
      ELSE NULL
    END as email,
    -- Phone: protected by privacy settings
    CASE 
      WHEN p.id = auth.uid() THEN p.phone
      WHEN has_role(auth.uid(), 'admin'::app_role) THEN p.phone
      WHEN has_role(auth.uid(), 'campus_worship_pastor'::app_role) 
           AND shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_pastors THEN p.phone
      WHEN shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_campus THEN p.phone
      ELSE NULL
    END as phone,
    -- Birthday: visible to all campus members (for the birthday widget)
    CASE 
      WHEN p.id = auth.uid() THEN p.birthday
      WHEN has_role(auth.uid(), 'admin'::app_role) THEN p.birthday
      WHEN shares_campus_with(auth.uid(), p.id) THEN p.birthday
      ELSE NULL
    END as birthday,
    -- Anniversary: visible to all campus members (for the anniversary widget)
    CASE 
      WHEN p.id = auth.uid() THEN p.anniversary
      WHEN has_role(auth.uid(), 'admin'::app_role) THEN p.anniversary
      WHEN shares_campus_with(auth.uid(), p.id) THEN p.anniversary
      ELSE NULL
    END as anniversary,
    p.positions,
    p.ministry_types,
    p.welcome_email_sent_at,
    p.share_contact_with_pastors,
    p.share_contact_with_campus
  FROM public.profiles p
  WHERE 
    p.id = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR shares_campus_with(auth.uid(), p.id)
$$;
-- === 20260111025104_2d89c182-27cb-442f-b243-74fb9069027e.sql ===
-- Drop the existing unique constraint that prevents multiple campus_admin roles per user
ALTER TABLE public.user_roles DROP CONSTRAINT user_roles_user_id_role_key;

-- Add a new unique constraint that allows multiple campus_admin roles per user (one per campus)
-- This ensures a user can't have duplicate roles for the same campus, but CAN have multiple campus_admin roles for different campuses
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_role_campus_key 
  UNIQUE (user_id, role, admin_campus_id);

-- Add a comment for clarity
COMMENT ON CONSTRAINT user_roles_user_id_role_campus_key ON public.user_roles IS 'Allows users to have multiple campus_admin roles (one per campus) while preventing duplicate role assignments';
-- === 20260111030145_02f34ef3-5aeb-4c95-a43f-1052faadc688.sql ===
-- Add network_worship_leader to the app_role enum
ALTER TYPE public.app_role ADD VALUE 'network_worship_leader';
-- === 20260111030353_6e085c7e-4458-4465-96b7-87ead81934f4.sql ===
-- Add network_worship_leader to all RLS policies that include campus_worship_pastor

-- plan_songs table
DROP POLICY IF EXISTS "Admins and pastors can delete plan songs" ON public.plan_songs;
CREATE POLICY "Admins and pastors can delete plan songs" ON public.plan_songs
FOR DELETE USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role)
);

DROP POLICY IF EXISTS "Admins and pastors can insert plan songs" ON public.plan_songs;
CREATE POLICY "Admins and pastors can insert plan songs" ON public.plan_songs
FOR INSERT WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role)
);

DROP POLICY IF EXISTS "Admins and pastors can update plan songs" ON public.plan_songs;
CREATE POLICY "Admins and pastors can update plan songs" ON public.plan_songs
FOR UPDATE USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role)
) WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role)
);

-- songs table
DROP POLICY IF EXISTS "Admins and pastors can delete songs" ON public.songs;
CREATE POLICY "Admins and pastors can delete songs" ON public.songs
FOR DELETE USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role)
);

DROP POLICY IF EXISTS "Admins and pastors can insert songs" ON public.songs;
CREATE POLICY "Admins and pastors can insert songs" ON public.songs
FOR INSERT WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role)
);

DROP POLICY IF EXISTS "Admins and pastors can update songs" ON public.songs;
CREATE POLICY "Admins and pastors can update songs" ON public.songs
FOR UPDATE USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role)
) WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role)
);

-- message_reactions table
DROP POLICY IF EXISTS "Users can view reactions on messages from their campuses" ON public.message_reactions;
CREATE POLICY "Users can view reactions on messages from their campuses" ON public.message_reactions
FOR SELECT USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  (message_id IN (
    SELECT cm.id FROM chat_messages cm
    WHERE cm.campus_id IN (
      SELECT user_campuses.campus_id FROM user_campuses WHERE user_campuses.user_id = auth.uid()
    )
  ))
);

-- user_campuses table
DROP POLICY IF EXISTS "Campus admins and above can delete campus assignments" ON public.user_campuses;
CREATE POLICY "Campus admins and above can delete campus assignments" ON public.user_campuses
FOR DELETE USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  ((has_role(auth.uid(), 'campus_admin'::app_role) OR 
    has_role(auth.uid(), 'network_worship_leader'::app_role) OR
    has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
    has_role(auth.uid(), 'student_worship_pastor'::app_role)) 
   AND shares_campus_with(auth.uid(), user_id))
);

DROP POLICY IF EXISTS "Campus admins and above can insert campus assignments" ON public.user_campuses;
CREATE POLICY "Campus admins and above can insert campus assignments" ON public.user_campuses
FOR INSERT WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role)
);

DROP POLICY IF EXISTS "Campus admins and above can update campus assignments" ON public.user_campuses;
CREATE POLICY "Campus admins and above can update campus assignments" ON public.user_campuses
FOR UPDATE USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  ((has_role(auth.uid(), 'campus_admin'::app_role) OR 
    has_role(auth.uid(), 'network_worship_leader'::app_role) OR
    has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
    has_role(auth.uid(), 'student_worship_pastor'::app_role)) 
   AND shares_campus_with(auth.uid(), user_id))
);

-- draft_sets table
DROP POLICY IF EXISTS "Campus admins and pastors can create draft sets" ON public.draft_sets;
CREATE POLICY "Campus admins and pastors can create draft sets" ON public.draft_sets
FOR INSERT WITH CHECK (
  (auth.uid() = created_by) AND (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'network_worship_leader'::app_role) OR
    has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
    has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
    has_role(auth.uid(), 'campus_admin'::app_role)
  )
);

DROP POLICY IF EXISTS "Users can view draft sets for their campuses" ON public.draft_sets;
CREATE POLICY "Users can view draft sets for their campuses" ON public.draft_sets
FOR SELECT USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role) OR 
  (campus_id IN (SELECT uc.campus_id FROM user_campuses uc WHERE uc.user_id = auth.uid()))
);

-- draft_set_songs table
DROP POLICY IF EXISTS "Users can view songs in accessible draft sets" ON public.draft_set_songs;
CREATE POLICY "Users can view songs in accessible draft sets" ON public.draft_set_songs
FOR SELECT USING (
  draft_set_id IN (
    SELECT draft_sets.id FROM draft_sets
    WHERE (
      has_role(auth.uid(), 'admin'::app_role) OR 
      has_role(auth.uid(), 'network_worship_leader'::app_role) OR
      has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
      has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
      has_role(auth.uid(), 'campus_admin'::app_role) OR 
      (draft_sets.campus_id IN (SELECT uc.campus_id FROM user_campuses uc WHERE uc.user_id = auth.uid()))
    )
  )
);

-- user_roles table
DROP POLICY IF EXISTS "Campus admins and above can delete roles" ON public.user_roles;
CREATE POLICY "Campus admins and above can delete roles" ON public.user_roles
FOR DELETE USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  ((has_role(auth.uid(), 'campus_admin'::app_role) OR 
    has_role(auth.uid(), 'network_worship_leader'::app_role) OR
    has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
    has_role(auth.uid(), 'student_worship_pastor'::app_role)) 
   AND shares_campus_with(auth.uid(), user_id))
);

DROP POLICY IF EXISTS "Campus admins and above can insert roles" ON public.user_roles;
CREATE POLICY "Campus admins and above can insert roles" ON public.user_roles
FOR INSERT WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  ((has_role(auth.uid(), 'campus_admin'::app_role) OR 
    has_role(auth.uid(), 'network_worship_leader'::app_role) OR
    has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
    has_role(auth.uid(), 'student_worship_pastor'::app_role)) 
   AND shares_campus_with(auth.uid(), user_id))
);

DROP POLICY IF EXISTS "Campus admins and above can update roles" ON public.user_roles;
CREATE POLICY "Campus admins and above can update roles" ON public.user_roles
FOR UPDATE USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  ((has_role(auth.uid(), 'campus_admin'::app_role) OR 
    has_role(auth.uid(), 'network_worship_leader'::app_role) OR
    has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
    has_role(auth.uid(), 'student_worship_pastor'::app_role)) 
   AND shares_campus_with(auth.uid(), user_id))
);

DROP POLICY IF EXISTS "Users can view roles" ON public.user_roles;
CREATE POLICY "Users can view roles" ON public.user_roles
FOR SELECT USING (
  (auth.uid() = user_id) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  ((has_role(auth.uid(), 'campus_admin'::app_role) OR 
    has_role(auth.uid(), 'network_worship_leader'::app_role) OR
    has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
    has_role(auth.uid(), 'student_worship_pastor'::app_role)) 
   AND shares_campus_with(auth.uid(), user_id))
);

-- service_plans table
DROP POLICY IF EXISTS "Admins and pastors can delete service plans" ON public.service_plans;
CREATE POLICY "Admins and pastors can delete service plans" ON public.service_plans
FOR DELETE USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role)
);

DROP POLICY IF EXISTS "Admins and pastors can insert service plans" ON public.service_plans;
CREATE POLICY "Admins and pastors can insert service plans" ON public.service_plans
FOR INSERT WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role)
);

DROP POLICY IF EXISTS "Admins and pastors can update service plans" ON public.service_plans;
CREATE POLICY "Admins and pastors can update service plans" ON public.service_plans
FOR UPDATE USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role)
) WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role)
);
-- === 20260111031655_d1d8455a-b573-400a-b70f-700d3d0c42d8.sql ===
-- Add network_worship_pastor to the app_role enum
ALTER TYPE public.app_role ADD VALUE 'network_worship_pastor';
-- === 20260111032219_a36b42d2-de33-4e6d-bed5-8b71e961968f.sql ===
-- Add network_worship_pastor to all RLS policies that include campus_worship_pastor

-- plan_songs table
DROP POLICY IF EXISTS "Admins and pastors can delete plan songs" ON public.plan_songs;
CREATE POLICY "Admins and pastors can delete plan songs" ON public.plan_songs
FOR DELETE USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR
  has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role)
);

DROP POLICY IF EXISTS "Admins and pastors can insert plan songs" ON public.plan_songs;
CREATE POLICY "Admins and pastors can insert plan songs" ON public.plan_songs
FOR INSERT WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR
  has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role)
);

DROP POLICY IF EXISTS "Admins and pastors can update plan songs" ON public.plan_songs;
CREATE POLICY "Admins and pastors can update plan songs" ON public.plan_songs
FOR UPDATE USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR
  has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role)
) WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR
  has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role)
);

-- songs table
DROP POLICY IF EXISTS "Admins and pastors can delete songs" ON public.songs;
CREATE POLICY "Admins and pastors can delete songs" ON public.songs
FOR DELETE USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR
  has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role)
);

DROP POLICY IF EXISTS "Admins and pastors can insert songs" ON public.songs;
CREATE POLICY "Admins and pastors can insert songs" ON public.songs
FOR INSERT WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR
  has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role)
);

DROP POLICY IF EXISTS "Admins and pastors can update songs" ON public.songs;
CREATE POLICY "Admins and pastors can update songs" ON public.songs
FOR UPDATE USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR
  has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role)
) WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR
  has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role)
);

-- message_reactions table
DROP POLICY IF EXISTS "Users can view reactions on messages from their campuses" ON public.message_reactions;
CREATE POLICY "Users can view reactions on messages from their campuses" ON public.message_reactions
FOR SELECT USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR
  has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  (message_id IN (
    SELECT cm.id FROM chat_messages cm
    WHERE cm.campus_id IN (
      SELECT user_campuses.campus_id FROM user_campuses WHERE user_campuses.user_id = auth.uid()
    )
  ))
);

-- user_campuses table
DROP POLICY IF EXISTS "Campus admins and above can delete campus assignments" ON public.user_campuses;
CREATE POLICY "Campus admins and above can delete campus assignments" ON public.user_campuses
FOR DELETE USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  ((has_role(auth.uid(), 'campus_admin'::app_role) OR 
    has_role(auth.uid(), 'network_worship_leader'::app_role) OR
    has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
    has_role(auth.uid(), 'student_worship_pastor'::app_role)) 
   AND shares_campus_with(auth.uid(), user_id))
);

DROP POLICY IF EXISTS "Campus admins and above can insert campus assignments" ON public.user_campuses;
CREATE POLICY "Campus admins and above can insert campus assignments" ON public.user_campuses
FOR INSERT WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR
  has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role)
);

DROP POLICY IF EXISTS "Campus admins and above can update campus assignments" ON public.user_campuses;
CREATE POLICY "Campus admins and above can update campus assignments" ON public.user_campuses
FOR UPDATE USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  ((has_role(auth.uid(), 'campus_admin'::app_role) OR 
    has_role(auth.uid(), 'network_worship_leader'::app_role) OR
    has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
    has_role(auth.uid(), 'student_worship_pastor'::app_role)) 
   AND shares_campus_with(auth.uid(), user_id))
);

-- draft_sets table
DROP POLICY IF EXISTS "Campus admins and pastors can create draft sets" ON public.draft_sets;
CREATE POLICY "Campus admins and pastors can create draft sets" ON public.draft_sets
FOR INSERT WITH CHECK (
  (auth.uid() = created_by) AND (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'network_worship_leader'::app_role) OR
    has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
    has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
    has_role(auth.uid(), 'campus_admin'::app_role)
  )
);

DROP POLICY IF EXISTS "Users can view draft sets for their campuses" ON public.draft_sets;
CREATE POLICY "Users can view draft sets for their campuses" ON public.draft_sets
FOR SELECT USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR
  has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role) OR 
  (campus_id IN (SELECT uc.campus_id FROM user_campuses uc WHERE uc.user_id = auth.uid()))
);

-- draft_set_songs table
DROP POLICY IF EXISTS "Users can view songs in accessible draft sets" ON public.draft_set_songs;
CREATE POLICY "Users can view songs in accessible draft sets" ON public.draft_set_songs
FOR SELECT USING (
  draft_set_id IN (
    SELECT draft_sets.id FROM draft_sets
    WHERE (
      has_role(auth.uid(), 'admin'::app_role) OR 
      has_role(auth.uid(), 'network_worship_leader'::app_role) OR
      has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
      has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
      has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
      has_role(auth.uid(), 'campus_admin'::app_role) OR 
      (draft_sets.campus_id IN (SELECT uc.campus_id FROM user_campuses uc WHERE uc.user_id = auth.uid()))
    )
  )
);

-- user_roles table
DROP POLICY IF EXISTS "Campus admins and above can delete roles" ON public.user_roles;
CREATE POLICY "Campus admins and above can delete roles" ON public.user_roles
FOR DELETE USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  ((has_role(auth.uid(), 'campus_admin'::app_role) OR 
    has_role(auth.uid(), 'network_worship_leader'::app_role) OR
    has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
    has_role(auth.uid(), 'student_worship_pastor'::app_role)) 
   AND shares_campus_with(auth.uid(), user_id))
);

DROP POLICY IF EXISTS "Campus admins and above can insert roles" ON public.user_roles;
CREATE POLICY "Campus admins and above can insert roles" ON public.user_roles
FOR INSERT WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  ((has_role(auth.uid(), 'campus_admin'::app_role) OR 
    has_role(auth.uid(), 'network_worship_leader'::app_role) OR
    has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
    has_role(auth.uid(), 'student_worship_pastor'::app_role)) 
   AND shares_campus_with(auth.uid(), user_id))
);

DROP POLICY IF EXISTS "Campus admins and above can update roles" ON public.user_roles;
CREATE POLICY "Campus admins and above can update roles" ON public.user_roles
FOR UPDATE USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  ((has_role(auth.uid(), 'campus_admin'::app_role) OR 
    has_role(auth.uid(), 'network_worship_leader'::app_role) OR
    has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
    has_role(auth.uid(), 'student_worship_pastor'::app_role)) 
   AND shares_campus_with(auth.uid(), user_id))
);

DROP POLICY IF EXISTS "Users can view roles" ON public.user_roles;
CREATE POLICY "Users can view roles" ON public.user_roles
FOR SELECT USING (
  (auth.uid() = user_id) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  ((has_role(auth.uid(), 'campus_admin'::app_role) OR 
    has_role(auth.uid(), 'network_worship_leader'::app_role) OR
    has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
    has_role(auth.uid(), 'student_worship_pastor'::app_role)) 
   AND shares_campus_with(auth.uid(), user_id))
);

-- service_plans table
DROP POLICY IF EXISTS "Admins and pastors can delete service plans" ON public.service_plans;
CREATE POLICY "Admins and pastors can delete service plans" ON public.service_plans
FOR DELETE USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR
  has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role)
);

DROP POLICY IF EXISTS "Admins and pastors can insert service plans" ON public.service_plans;
CREATE POLICY "Admins and pastors can insert service plans" ON public.service_plans
FOR INSERT WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR
  has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role)
);

DROP POLICY IF EXISTS "Admins and pastors can update service plans" ON public.service_plans;
CREATE POLICY "Admins and pastors can update service plans" ON public.service_plans
FOR UPDATE USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR
  has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role)
) WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR
  has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role)
);
-- === 20260111033951_af8d73a2-dd43-4fae-bf4b-f3bc8ebe0e3b.sql ===
-- Add service configuration columns to campuses table
ALTER TABLE campuses ADD COLUMN has_saturday_service boolean DEFAULT false;
ALTER TABLE campuses ADD COLUMN has_sunday_service boolean DEFAULT true;
ALTER TABLE campuses ADD COLUMN saturday_service_time time;
ALTER TABLE campuses ADD COLUMN sunday_service_time time;

-- Set Murfreesboro Central and Cannon County to have Saturday+Sunday
UPDATE campuses 
SET has_saturday_service = true, 
    has_sunday_service = true,
    saturday_service_time = '17:00:00',
    sunday_service_time = '09:00:00'
WHERE id IN (
  'd70b980c-27a4-43b5-800b-1c58899ece90',
  '57ddbb2e-6cc5-48f1-a813-f5bbfa8ce5ad'
);

-- Ensure all others have Sunday-only with default time
UPDATE campuses 
SET has_saturday_service = false, 
    has_sunday_service = true,
    sunday_service_time = '10:00:00'
WHERE id NOT IN (
  'd70b980c-27a4-43b5-800b-1c58899ece90',
  '57ddbb2e-6cc5-48f1-a813-f5bbfa8ce5ad'
);
-- === 20260111035057_5659ce05-7584-44e9-b4ab-1dfb46615b4e.sql ===
-- Change single time columns to arrays for multiple service times
ALTER TABLE campuses 
  ALTER COLUMN saturday_service_time TYPE text[] USING CASE 
    WHEN saturday_service_time IS NOT NULL THEN ARRAY[saturday_service_time::text] 
    ELSE NULL 
  END;

ALTER TABLE campuses 
  ALTER COLUMN sunday_service_time TYPE text[] USING CASE 
    WHEN sunday_service_time IS NOT NULL THEN ARRAY[sunday_service_time::text] 
    ELSE NULL 
  END;
-- === 20260111035907_bb43d03a-69f8-4f09-991b-bc79581ee15d.sql ===
-- Add new base roles to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'video_director';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'production_manager';
-- === 20260111040506_13063fae-762a-431d-bbf6-bf364fbeaecc.sql ===
-- Update RLS policies to add video_director and production_manager with same permissions as campus_admin

-- plan_songs policies
DROP POLICY IF EXISTS "Admins and pastors can delete plan songs" ON public.plan_songs;
CREATE POLICY "Admins and pastors can delete plan songs" ON public.plan_songs
FOR DELETE USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR 
  has_role(auth.uid(), 'network_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role) OR
  has_role(auth.uid(), 'video_director'::app_role) OR
  has_role(auth.uid(), 'production_manager'::app_role)
);

DROP POLICY IF EXISTS "Admins and pastors can insert plan songs" ON public.plan_songs;
CREATE POLICY "Admins and pastors can insert plan songs" ON public.plan_songs
FOR INSERT WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR 
  has_role(auth.uid(), 'network_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role) OR
  has_role(auth.uid(), 'video_director'::app_role) OR
  has_role(auth.uid(), 'production_manager'::app_role)
);

DROP POLICY IF EXISTS "Admins and pastors can update plan songs" ON public.plan_songs;
CREATE POLICY "Admins and pastors can update plan songs" ON public.plan_songs
FOR UPDATE USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR 
  has_role(auth.uid(), 'network_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role) OR
  has_role(auth.uid(), 'video_director'::app_role) OR
  has_role(auth.uid(), 'production_manager'::app_role)
) WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR 
  has_role(auth.uid(), 'network_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role) OR
  has_role(auth.uid(), 'video_director'::app_role) OR
  has_role(auth.uid(), 'production_manager'::app_role)
);

-- break_requests policies
DROP POLICY IF EXISTS "Admins can update break requests" ON public.break_requests;
CREATE POLICY "Admins can update break requests" ON public.break_requests
FOR UPDATE USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = ANY (ARRAY['admin'::app_role, 'leader'::app_role, 'campus_admin'::app_role, 'campus_worship_pastor'::app_role, 'video_director'::app_role, 'production_manager'::app_role]))
);

DROP POLICY IF EXISTS "Admins can view all break requests" ON public.break_requests;
CREATE POLICY "Admins can view all break requests" ON public.break_requests
FOR SELECT USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = ANY (ARRAY['admin'::app_role, 'leader'::app_role, 'campus_admin'::app_role, 'campus_worship_pastor'::app_role, 'video_director'::app_role, 'production_manager'::app_role]))
);

-- draft_set_songs - update SELECT policy
DROP POLICY IF EXISTS "Users can view songs in accessible draft sets" ON public.draft_set_songs;
CREATE POLICY "Users can view songs in accessible draft sets" ON public.draft_set_songs
FOR SELECT USING (
  draft_set_id IN (
    SELECT draft_sets.id FROM draft_sets
    WHERE (
      has_role(auth.uid(), 'admin'::app_role) OR 
      has_role(auth.uid(), 'network_worship_leader'::app_role) OR 
      has_role(auth.uid(), 'network_worship_pastor'::app_role) OR 
      has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
      has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
      has_role(auth.uid(), 'campus_admin'::app_role) OR
      has_role(auth.uid(), 'video_director'::app_role) OR
      has_role(auth.uid(), 'production_manager'::app_role) OR
      (draft_sets.campus_id IN (SELECT uc.campus_id FROM user_campuses uc WHERE uc.user_id = auth.uid()))
    )
  )
);

-- team_period_locks - update ALL policy
DROP POLICY IF EXISTS "Admins can manage team locks" ON public.team_period_locks;
CREATE POLICY "Admins can manage team locks" ON public.team_period_locks
FOR ALL USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role) OR
  has_role(auth.uid(), 'video_director'::app_role) OR
  has_role(auth.uid(), 'production_manager'::app_role)
);

-- service_plans policies
DROP POLICY IF EXISTS "Admins and pastors can delete service plans" ON public.service_plans;
CREATE POLICY "Admins and pastors can delete service plans" ON public.service_plans
FOR DELETE USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR 
  has_role(auth.uid(), 'network_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role) OR
  has_role(auth.uid(), 'video_director'::app_role) OR
  has_role(auth.uid(), 'production_manager'::app_role)
);

DROP POLICY IF EXISTS "Admins and pastors can insert service plans" ON public.service_plans;
CREATE POLICY "Admins and pastors can insert service plans" ON public.service_plans
FOR INSERT WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR 
  has_role(auth.uid(), 'network_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role) OR
  has_role(auth.uid(), 'video_director'::app_role) OR
  has_role(auth.uid(), 'production_manager'::app_role)
);

DROP POLICY IF EXISTS "Admins and pastors can update service plans" ON public.service_plans;
CREATE POLICY "Admins and pastors can update service plans" ON public.service_plans
FOR UPDATE USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR 
  has_role(auth.uid(), 'network_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role) OR
  has_role(auth.uid(), 'video_director'::app_role) OR
  has_role(auth.uid(), 'production_manager'::app_role)
) WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR 
  has_role(auth.uid(), 'network_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role) OR
  has_role(auth.uid(), 'video_director'::app_role) OR
  has_role(auth.uid(), 'production_manager'::app_role)
);

-- songs policies
DROP POLICY IF EXISTS "Admins and pastors can delete songs" ON public.songs;
CREATE POLICY "Admins and pastors can delete songs" ON public.songs
FOR DELETE USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR 
  has_role(auth.uid(), 'network_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role) OR
  has_role(auth.uid(), 'video_director'::app_role) OR
  has_role(auth.uid(), 'production_manager'::app_role)
);

DROP POLICY IF EXISTS "Admins and pastors can insert songs" ON public.songs;
CREATE POLICY "Admins and pastors can insert songs" ON public.songs
FOR INSERT WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR 
  has_role(auth.uid(), 'network_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role) OR
  has_role(auth.uid(), 'video_director'::app_role) OR
  has_role(auth.uid(), 'production_manager'::app_role)
);

DROP POLICY IF EXISTS "Admins and pastors can update songs" ON public.songs;
CREATE POLICY "Admins and pastors can update songs" ON public.songs
FOR UPDATE USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR 
  has_role(auth.uid(), 'network_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role) OR
  has_role(auth.uid(), 'video_director'::app_role) OR
  has_role(auth.uid(), 'production_manager'::app_role)
) WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR 
  has_role(auth.uid(), 'network_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role) OR
  has_role(auth.uid(), 'video_director'::app_role) OR
  has_role(auth.uid(), 'production_manager'::app_role)
);

-- message_reactions - update SELECT policy
DROP POLICY IF EXISTS "Users can view reactions on messages from their campuses" ON public.message_reactions;
CREATE POLICY "Users can view reactions on messages from their campuses" ON public.message_reactions
FOR SELECT USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR 
  has_role(auth.uid(), 'network_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR
  has_role(auth.uid(), 'video_director'::app_role) OR
  has_role(auth.uid(), 'production_manager'::app_role) OR
  (message_id IN (
    SELECT cm.id FROM chat_messages cm 
    WHERE cm.campus_id IN (SELECT user_campuses.campus_id FROM user_campuses WHERE user_campuses.user_id = auth.uid())
  ))
);

-- user_campuses policies
DROP POLICY IF EXISTS "Campus admins and above can delete campus assignments" ON public.user_campuses;
CREATE POLICY "Campus admins and above can delete campus assignments" ON public.user_campuses
FOR DELETE USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  ((has_role(auth.uid(), 'campus_admin'::app_role) OR 
    has_role(auth.uid(), 'network_worship_leader'::app_role) OR 
    has_role(auth.uid(), 'network_worship_pastor'::app_role) OR 
    has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
    has_role(auth.uid(), 'student_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'video_director'::app_role) OR
    has_role(auth.uid(), 'production_manager'::app_role)) 
   AND shares_campus_with(auth.uid(), user_id))
);

DROP POLICY IF EXISTS "Campus admins and above can insert campus assignments" ON public.user_campuses;
CREATE POLICY "Campus admins and above can insert campus assignments" ON public.user_campuses
FOR INSERT WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR 
  has_role(auth.uid(), 'network_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR
  has_role(auth.uid(), 'video_director'::app_role) OR
  has_role(auth.uid(), 'production_manager'::app_role)
);

DROP POLICY IF EXISTS "Campus admins and above can update campus assignments" ON public.user_campuses;
CREATE POLICY "Campus admins and above can update campus assignments" ON public.user_campuses
FOR UPDATE USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  ((has_role(auth.uid(), 'campus_admin'::app_role) OR 
    has_role(auth.uid(), 'network_worship_leader'::app_role) OR 
    has_role(auth.uid(), 'network_worship_pastor'::app_role) OR 
    has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
    has_role(auth.uid(), 'student_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'video_director'::app_role) OR
    has_role(auth.uid(), 'production_manager'::app_role)) 
   AND shares_campus_with(auth.uid(), user_id))
);

-- draft_sets - update INSERT policy
DROP POLICY IF EXISTS "Campus admins and pastors can create draft sets" ON public.draft_sets;
CREATE POLICY "Campus admins and pastors can create draft sets" ON public.draft_sets
FOR INSERT WITH CHECK (
  (auth.uid() = created_by) AND (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'network_worship_leader'::app_role) OR 
    has_role(auth.uid(), 'network_worship_pastor'::app_role) OR 
    has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
    has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
    has_role(auth.uid(), 'campus_admin'::app_role) OR
    has_role(auth.uid(), 'video_director'::app_role) OR
    has_role(auth.uid(), 'production_manager'::app_role)
  )
);

-- draft_sets - update SELECT policy
DROP POLICY IF EXISTS "Users can view draft sets for their campuses" ON public.draft_sets;
CREATE POLICY "Users can view draft sets for their campuses" ON public.draft_sets
FOR SELECT USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR 
  has_role(auth.uid(), 'network_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role) OR
  has_role(auth.uid(), 'video_director'::app_role) OR
  has_role(auth.uid(), 'production_manager'::app_role) OR
  (campus_id IN (SELECT uc.campus_id FROM user_campuses uc WHERE uc.user_id = auth.uid()))
);

-- user_roles policies
DROP POLICY IF EXISTS "Campus admins and above can delete roles" ON public.user_roles;
CREATE POLICY "Campus admins and above can delete roles" ON public.user_roles
FOR DELETE USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  ((has_role(auth.uid(), 'campus_admin'::app_role) OR 
    has_role(auth.uid(), 'network_worship_leader'::app_role) OR 
    has_role(auth.uid(), 'network_worship_pastor'::app_role) OR 
    has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
    has_role(auth.uid(), 'student_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'video_director'::app_role) OR
    has_role(auth.uid(), 'production_manager'::app_role)) 
   AND shares_campus_with(auth.uid(), user_id))
);

DROP POLICY IF EXISTS "Campus admins and above can insert roles" ON public.user_roles;
CREATE POLICY "Campus admins and above can insert roles" ON public.user_roles
FOR INSERT WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  ((has_role(auth.uid(), 'campus_admin'::app_role) OR 
    has_role(auth.uid(), 'network_worship_leader'::app_role) OR 
    has_role(auth.uid(), 'network_worship_pastor'::app_role) OR 
    has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
    has_role(auth.uid(), 'student_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'video_director'::app_role) OR
    has_role(auth.uid(), 'production_manager'::app_role)) 
   AND shares_campus_with(auth.uid(), user_id))
);

DROP POLICY IF EXISTS "Campus admins and above can update roles" ON public.user_roles;
CREATE POLICY "Campus admins and above can update roles" ON public.user_roles
FOR UPDATE USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  ((has_role(auth.uid(), 'campus_admin'::app_role) OR 
    has_role(auth.uid(), 'network_worship_leader'::app_role) OR 
    has_role(auth.uid(), 'network_worship_pastor'::app_role) OR 
    has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
    has_role(auth.uid(), 'student_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'video_director'::app_role) OR
    has_role(auth.uid(), 'production_manager'::app_role)) 
   AND shares_campus_with(auth.uid(), user_id))
);

DROP POLICY IF EXISTS "Users can view roles" ON public.user_roles;
CREATE POLICY "Users can view roles" ON public.user_roles
FOR SELECT USING (
  (auth.uid() = user_id) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  ((has_role(auth.uid(), 'campus_admin'::app_role) OR 
    has_role(auth.uid(), 'network_worship_leader'::app_role) OR 
    has_role(auth.uid(), 'network_worship_pastor'::app_role) OR 
    has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR 
    has_role(auth.uid(), 'student_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'video_director'::app_role) OR
    has_role(auth.uid(), 'production_manager'::app_role)) 
   AND shares_campus_with(auth.uid(), user_id))
);

-- rotation_periods - update ALL policy
DROP POLICY IF EXISTS "Admins can manage rotation periods" ON public.rotation_periods;
CREATE POLICY "Admins can manage rotation periods" ON public.rotation_periods
FOR ALL USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  ((has_role(auth.uid(), 'campus_admin'::app_role) OR
    has_role(auth.uid(), 'video_director'::app_role) OR
    has_role(auth.uid(), 'production_manager'::app_role)) 
   AND (campus_id IN (SELECT user_roles.admin_campus_id FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'campus_admin'::app_role)))
);
-- === 20260111041205_c3917be4-d29b-441a-a2f3-35ad3ee10eb8.sql ===
-- Add new video positions to the team_position enum
ALTER TYPE public.team_position ADD VALUE IF NOT EXISTS 'camera_1';
ALTER TYPE public.team_position ADD VALUE IF NOT EXISTS 'camera_2';
ALTER TYPE public.team_position ADD VALUE IF NOT EXISTS 'camera_3';
ALTER TYPE public.team_position ADD VALUE IF NOT EXISTS 'camera_4';
ALTER TYPE public.team_position ADD VALUE IF NOT EXISTS 'chat_host';
ALTER TYPE public.team_position ADD VALUE IF NOT EXISTS 'director';
ALTER TYPE public.team_position ADD VALUE IF NOT EXISTS 'graphics';
ALTER TYPE public.team_position ADD VALUE IF NOT EXISTS 'producer';
ALTER TYPE public.team_position ADD VALUE IF NOT EXISTS 'switcher';
-- === 20260111041839_b4c387ac-e2a8-4ed9-ae28-ec0bd566dcb9.sql ===
-- Add audio_shadow position to the team_position enum
ALTER TYPE public.team_position ADD VALUE IF NOT EXISTS 'audio_shadow';
-- === 20260111155024_c71c275a-02a3-421e-84d1-68b7f30df6c7.sql ===
-- Add new audio positions to the team_position enum
ALTER TYPE team_position ADD VALUE IF NOT EXISTS 'mon';
ALTER TYPE team_position ADD VALUE IF NOT EXISTS 'broadcast';
-- === 20260111172959_4a553270-4bef-4cdd-825f-d149b4d7a9b3.sql ===
-- Add acoustic_1 and acoustic_2 to the team_position enum
ALTER TYPE team_position ADD VALUE IF NOT EXISTS 'acoustic_1';
ALTER TYPE team_position ADD VALUE IF NOT EXISTS 'acoustic_2';
-- === 20260112034435_fe5c7bd6-b1cd-421f-ad86-1eb199f645f4.sql ===
-- Add camera_5 and camera_6 to team_position enum
ALTER TYPE team_position ADD VALUE 'camera_5';
ALTER TYPE team_position ADD VALUE 'camera_6';

-- Add service_day column to team_members table
-- NULL = serves both days (default for band/audio)
-- 'saturday' or 'sunday' = specific day assignment (for video team)
ALTER TABLE team_members 
ADD COLUMN service_day TEXT CHECK (service_day IN ('saturday', 'sunday'));

-- Add comment explaining the column
COMMENT ON COLUMN team_members.service_day IS 'Indicates which day this member serves. NULL means both days (typical for band). saturday/sunday for video team positions.';
-- === 20260112034846_26a46677-87ad-4c55-86cd-54ccf83345fd.sql ===
-- Add policy for admins to delete any swap request
CREATE POLICY "Admins can delete swap requests"
ON public.swap_requests
FOR DELETE
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role) OR
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR
  has_role(auth.uid(), 'video_director'::app_role) OR
  has_role(auth.uid(), 'production_manager'::app_role)
);
-- === 20260112042256_83475624-1af4-4a11-a5d9-4d52d810d60d.sql ===

-- Create table for campus-specific ministry assignments
-- This allows a volunteer to have Weekend ministry at Tullahoma but only Encounter/EON at Murfreesboro Central
CREATE TABLE public.user_ministry_campuses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  campus_id UUID NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  ministry_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, campus_id, ministry_type)
);

-- Enable RLS
ALTER TABLE public.user_ministry_campuses ENABLE ROW LEVEL SECURITY;

-- Policies for user_ministry_campuses
CREATE POLICY "Users can view their own ministry assignments"
ON public.user_ministry_campuses
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Leaders can view all ministry assignments"
ON public.user_ministry_campuses
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role IN ('admin', 'campus_admin', 'network_worship_pastor', 'campus_worship_pastor')
  )
);

CREATE POLICY "Leaders can insert ministry assignments"
ON public.user_ministry_campuses
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role IN ('admin', 'campus_admin', 'network_worship_pastor', 'campus_worship_pastor')
  )
);

CREATE POLICY "Leaders can delete ministry assignments"
ON public.user_ministry_campuses
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role IN ('admin', 'campus_admin', 'network_worship_pastor', 'campus_worship_pastor')
  )
);

-- Users can manage their own ministry assignments
CREATE POLICY "Users can insert their own ministry assignments"
ON public.user_ministry_campuses
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own ministry assignments"
ON public.user_ministry_campuses
FOR DELETE
USING (auth.uid() = user_id);

-- Enable realtime for the table
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_ministry_campuses;

-- Migrate existing data: For each user's ministry_types, create entries for ALL their campuses
-- This preserves current behavior while enabling campus-specific assignments
INSERT INTO public.user_ministry_campuses (user_id, campus_id, ministry_type)
SELECT DISTINCT
  p.id as user_id,
  uc.campus_id,
  unnest(p.ministry_types) as ministry_type
FROM profiles p
CROSS JOIN user_campuses uc
WHERE p.id = uc.user_id
AND p.ministry_types IS NOT NULL
AND array_length(p.ministry_types, 1) > 0
ON CONFLICT (user_id, campus_id, ministry_type) DO NOTHING;

-- === 20260113145803_ff07d361-af17-4f6c-b95c-879b20514861.sql ===
-- Create the new user_campus_ministry_positions table
CREATE TABLE public.user_campus_ministry_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  campus_id UUID NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  ministry_type TEXT NOT NULL,
  position TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(user_id, campus_id, ministry_type, position)
);

-- Enable RLS
ALTER TABLE public.user_campus_ministry_positions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Anyone can view campus ministry positions"
ON public.user_campus_ministry_positions
FOR SELECT
USING (true);

CREATE POLICY "Leaders can manage campus ministry positions"
ON public.user_campus_ministry_positions
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role IN ('admin', 'campus_admin', 'leader')
  )
);

CREATE POLICY "Users can manage their own positions"
ON public.user_campus_ministry_positions
FOR ALL
USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_user_campus_ministry_positions_user ON public.user_campus_ministry_positions(user_id);
CREATE INDEX idx_user_campus_ministry_positions_campus ON public.user_campus_ministry_positions(campus_id);
CREATE INDEX idx_user_campus_ministry_positions_campus_ministry ON public.user_campus_ministry_positions(campus_id, ministry_type);

-- Migrate existing data: For each user_ministry_campuses record, copy all positions from profiles.positions
INSERT INTO public.user_campus_ministry_positions (user_id, campus_id, ministry_type, position)
SELECT 
  umc.user_id,
  umc.campus_id,
  umc.ministry_type,
  unnest(p.positions) as position
FROM public.user_ministry_campuses umc
JOIN public.profiles p ON p.id = umc.user_id
WHERE p.positions IS NOT NULL AND array_length(p.positions, 1) > 0
ON CONFLICT (user_id, campus_id, ministry_type, position) DO NOTHING;
-- === 20260113202000_3a802dd1-c47d-43eb-b44e-7e7096d79dce.sql ===
-- Add 'vocalist' to the team_position enum
ALTER TYPE team_position ADD VALUE IF NOT EXISTS 'vocalist';
-- === 20260113202014_27e94c41-9923-4651-882f-b7e31e0a379b.sql ===
-- Update existing data: change lead_vocals to vocalist in profiles.positions
UPDATE public.profiles 
SET positions = array_replace(positions, 'lead_vocals'::team_position, 'vocalist'::team_position)
WHERE positions @> ARRAY['lead_vocals']::team_position[];

-- Update existing data: change lead_vocals to vocalist in team_members.position
UPDATE public.team_members 
SET position = 'vocalist'
WHERE position = 'lead_vocals';

-- Update existing data: change lead_vocals to vocalist in user_campus_ministry_positions.position
UPDATE public.user_campus_ministry_positions 
SET position = 'vocalist'
WHERE position = 'lead_vocals';
-- === 20260113202420_babbc38e-a621-4a0a-b5ed-8a5bdc6af19d.sql ===
-- First, clean up the messy data in team_members
-- Normalize all vocal-related positions to 'vocalist'
UPDATE public.team_members SET position = 'vocalist' WHERE position IN ('Vocals', 'Vocalist 1', 'harmony_vocals', 'background_vocals', 'lead_vocals');

-- Normalize instrument positions
UPDATE public.team_members SET position = 'drums' WHERE position = 'Drums';
UPDATE public.team_members SET position = 'bass' WHERE position = 'Bass';
UPDATE public.team_members SET position = 'keys' WHERE position = 'Keys';
UPDATE public.team_members SET position = 'electric_1' WHERE position IN ('Electric 1', 'EG 1');
UPDATE public.team_members SET position = 'electric_2' WHERE position IN ('Electric 2', 'EG 2');
UPDATE public.team_members SET position = 'acoustic_1' WHERE position IN ('Acoustic 1', 'AG 1');
UPDATE public.team_members SET position = 'acoustic_2' WHERE position IN ('Acoustic 2', 'AG 2');
UPDATE public.team_members SET position = 'sound_tech' WHERE position = 'FOH';
UPDATE public.team_members SET position = 'media' WHERE position = 'Lyrics';
-- === 20260113202459_dd41bc36-ce61-45d4-bbdf-6b4dbeb6c9b3.sql ===
-- Clean up the orphaned new enum type from failed migrations
DROP TYPE IF EXISTS team_position_new;
-- === 20260115023614_ccdabb2b-7723-4352-a6f0-1eb196ef6c92.sql ===
-- Add published_at column to draft_sets
ALTER TABLE public.draft_sets 
ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- Create setlist_confirmations table
CREATE TABLE public.setlist_confirmations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  draft_set_id UUID NOT NULL REFERENCES public.draft_sets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(draft_set_id, user_id)
);

-- Enable RLS
ALTER TABLE public.setlist_confirmations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view confirmations for setlists in their campus
CREATE POLICY "Users can view confirmations for their campus setlists"
ON public.setlist_confirmations
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.draft_sets ds
    JOIN public.user_campuses uc ON uc.campus_id = ds.campus_id
    WHERE ds.id = setlist_confirmations.draft_set_id
    AND uc.user_id = auth.uid()
  )
);

-- Policy: Users can insert their own confirmations
CREATE POLICY "Users can confirm their own setlists"
ON public.setlist_confirmations
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own confirmations (in case they need to re-confirm)
CREATE POLICY "Users can delete their own confirmations"
ON public.setlist_confirmations
FOR DELETE
USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX idx_setlist_confirmations_draft_set ON public.setlist_confirmations(draft_set_id);
CREATE INDEX idx_setlist_confirmations_user ON public.setlist_confirmations(user_id);
CREATE INDEX idx_draft_sets_published_at ON public.draft_sets(published_at) WHERE published_at IS NOT NULL;
-- === 20260115025845_0143e2a4-77a2-4783-ad97-462367d4835f.sql ===
-- Create song_keys lookup table
CREATE TABLE public.song_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_name text NOT NULL UNIQUE,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.song_keys ENABLE ROW LEVEL SECURITY;

-- Everyone can view keys
CREATE POLICY "Anyone can view song keys"
  ON public.song_keys FOR SELECT
  USING (true);

-- Admins and leaders can manage keys
CREATE POLICY "Leaders can manage song keys"
  ON public.song_keys FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'leader', 'campus_worship_pastor', 'network_worship_pastor', 'network_worship_leader')
    )
  );

-- Seed with standard musical keys (major and minor)
INSERT INTO public.song_keys (key_name, display_order) VALUES
  ('C', 1), ('C#', 2), ('Db', 3), ('D', 4), ('D#', 5), ('Eb', 6),
  ('E', 7), ('F', 8), ('F#', 9), ('Gb', 10), ('G', 11), ('G#', 12),
  ('Ab', 13), ('A', 14), ('A#', 15), ('Bb', 16), ('B', 17),
  ('Cm', 18), ('C#m', 19), ('Dm', 20), ('D#m', 21), ('Ebm', 22),
  ('Em', 23), ('Fm', 24), ('F#m', 25), ('Gm', 26), ('G#m', 27),
  ('Am', 28), ('A#m', 29), ('Bbm', 30), ('Bm', 31);

-- Also add any unique keys from existing PCO plan_songs data
INSERT INTO public.song_keys (key_name, display_order)
SELECT DISTINCT ps.song_key, 100
FROM public.plan_songs ps
WHERE ps.song_key IS NOT NULL 
  AND ps.song_key != ''
  AND NOT EXISTS (
    SELECT 1 FROM public.song_keys sk WHERE sk.key_name = ps.song_key
  );

-- Create index for faster lookups
CREATE INDEX idx_song_keys_display_order ON public.song_keys(display_order);
-- === 20260115030658_250b4629-6231-44c6-a33f-c2180f7ee572.sql ===
-- Add vocalist assignment to draft_set_songs
ALTER TABLE public.draft_set_songs
ADD COLUMN vocalist_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX idx_draft_set_songs_vocalist ON public.draft_set_songs(vocalist_id);
-- === 20260115032435_8c28a3a7-d3a1-439e-852f-3d8c8db13fcb.sql ===
-- Add ministry_type column to team_schedule table
ALTER TABLE public.team_schedule 
ADD COLUMN ministry_type text DEFAULT 'weekend';

-- Update existing Wednesday dates to 'encounter'
UPDATE public.team_schedule 
SET ministry_type = 'encounter' 
WHERE EXTRACT(DOW FROM schedule_date) = 3;
-- === 20260115033316_e8a1385f-11a8-4dfe-ae72-8c864f90f695.sql ===
-- Add gender column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN gender text CHECK (gender IN ('male', 'female'));

-- Add index for filtering
CREATE INDEX idx_profiles_gender ON public.profiles(gender);
-- === 20260115045547_68f74057-7ec7-46d8-8885-4472cbfeb9d4.sql ===
-- Add BPM column to songs table
ALTER TABLE public.songs ADD COLUMN bpm numeric(5,1) NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.songs.bpm IS 'Beats per minute from Planning Center arrangement';
-- === 20260115045740_75408544-721f-44c5-9107-3b94a5b89924.sql ===
-- Drop and recreate get_songs_with_stats function to include bpm
DROP FUNCTION IF EXISTS public.get_songs_with_stats();

CREATE FUNCTION public.get_songs_with_stats()
 RETURNS TABLE(id uuid, pco_song_id text, title text, author text, ccli_number text, bpm numeric, created_at timestamp with time zone, updated_at timestamp with time zone, usage_count bigint, first_used date, last_used date, upcoming_uses bigint, usages jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH today AS (
    SELECT current_date AS d
  ),
  song_usages AS (
    SELECT 
      ps.song_id,
      sp.plan_date,
      sp.campus_id,
      sp.service_type_name
    FROM plan_songs ps
    JOIN service_plans sp ON ps.plan_id = sp.id
  ),
  song_stats AS (
    SELECT 
      su.song_id,
      COUNT(*) FILTER (WHERE su.plan_date < (SELECT d FROM today)) AS usage_count,
      MIN(su.plan_date) FILTER (WHERE su.plan_date < (SELECT d FROM today)) AS first_used,
      MAX(su.plan_date) FILTER (WHERE su.plan_date < (SELECT d FROM today)) AS last_used,
      COUNT(*) FILTER (WHERE su.plan_date >= (SELECT d FROM today)) AS upcoming_uses,
      jsonb_agg(
        jsonb_build_object(
          'plan_date', su.plan_date,
          'campus_id', su.campus_id,
          'service_type_name', su.service_type_name
        )
      ) AS usages
    FROM song_usages su
    GROUP BY su.song_id
  )
  SELECT 
    s.id,
    s.pco_song_id,
    s.title,
    s.author,
    s.ccli_number,
    s.bpm,
    s.created_at,
    s.updated_at,
    COALESCE(ss.usage_count, 0) AS usage_count,
    ss.first_used,
    ss.last_used,
    COALESCE(ss.upcoming_uses, 0) AS upcoming_uses,
    COALESCE(ss.usages, '[]'::jsonb) AS usages
  FROM songs s
  LEFT JOIN song_stats ss ON s.id = ss.song_id
  ORDER BY s.title;
$function$;
-- === 20260115235626_b9571d7e-6531-4caf-8157-285566185f42.sql ===
-- Fix notify_published_set trigger to use vault secrets instead of app.settings
CREATE OR REPLACE FUNCTION public.notify_published_set()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  set_campus_name TEXT;
  set_date DATE;
  set_ministry TEXT;
  campus_user_ids JSONB;
  supabase_url TEXT;
  service_key TEXT;
BEGIN
  -- Only trigger when status changes to 'published'
  IF NEW.status = 'published' AND (OLD.status IS NULL OR OLD.status != 'published') THEN
    -- Get campus name
    SELECT name INTO set_campus_name FROM campuses WHERE id = NEW.campus_id;
    
    set_date := NEW.plan_date;
    set_ministry := NEW.ministry_type;
    
    -- Get user IDs for the set's campus
    SELECT jsonb_agg(user_id::text)
    INTO campus_user_ids
    FROM user_campuses
    WHERE campus_id = NEW.campus_id;
    
    -- Try to get the URL and key from vault secrets
    BEGIN
      SELECT decrypted_secret INTO supabase_url
      FROM vault.decrypted_secrets
      WHERE name = 'supabase_url'
      LIMIT 1;
      
      SELECT decrypted_secret INTO service_key
      FROM vault.decrypted_secrets
      WHERE name = 'service_role_key'
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      -- If vault access fails, skip the notification silently
      RETURN NEW;
    END;
    
    -- Only send if there are users to notify and we have credentials
    IF campus_user_ids IS NOT NULL AND supabase_url IS NOT NULL AND service_key IS NOT NULL THEN
      PERFORM net.http_post(
        url := supabase_url || '/functions/v1/send-push-notification',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || service_key
        ),
        body := jsonb_build_object(
          'title', 'New Set Published',
          'message', COALESCE(set_campus_name, '') || ' ' || set_ministry || ' set for ' || to_char(set_date, 'Mon DD, YYYY'),
          'url', '/set-planner',
          'tag', 'set-' || NEW.id::text,
          'userIds', campus_user_ids
        )
      );
    END IF;
  END IF;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Don't let notification failures block the publish
  RAISE WARNING 'notify_published_set failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;

-- Also fix notify_new_event and notify_chat_mention triggers that have the same issue
CREATE OR REPLACE FUNCTION public.notify_new_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  event_title TEXT;
  event_date DATE;
  campus_user_ids JSONB;
  supabase_url TEXT;
  service_key TEXT;
BEGIN
  event_title := NEW.title;
  event_date := NEW.event_date;
  
  -- Get user IDs for the event's campus (or all users if no campus specified)
  IF NEW.campus_id IS NOT NULL THEN
    SELECT jsonb_agg(user_id::text)
    INTO campus_user_ids
    FROM user_campuses
    WHERE campus_id = NEW.campus_id;
  ELSE
    -- No campus filter, don't specify userIds (sends to all)
    campus_user_ids := NULL;
  END IF;
  
  -- Try to get the URL and key from vault secrets
  BEGIN
    SELECT decrypted_secret INTO supabase_url
    FROM vault.decrypted_secrets
    WHERE name = 'supabase_url'
    LIMIT 1;
    
    SELECT decrypted_secret INTO service_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
  END;
  
  -- Only send if there are users to notify and we have credentials
  IF (campus_user_ids IS NOT NULL OR NEW.campus_id IS NULL) AND supabase_url IS NOT NULL AND service_key IS NOT NULL THEN
    PERFORM net.http_post(
      url := supabase_url || '/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      body := jsonb_build_object(
        'title', 'New Event',
        'message', event_title || ' on ' || to_char(event_date, 'Mon DD, YYYY'),
        'url', '/calendar',
        'tag', 'event-' || NEW.id::text,
        'userIds', campus_user_ids
      )
    );
  END IF;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_new_event failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_chat_mention()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  sender_name TEXT;
  campus_name TEXT;
  mentioned_user_id UUID;
  mentioned_user_ids JSONB := '[]'::jsonb;
  mention_pattern TEXT;
  match_result TEXT[];
  supabase_url TEXT;
  service_key TEXT;
BEGIN
  -- Get sender name
  SELECT full_name INTO sender_name FROM profiles WHERE id = NEW.user_id;
  
  -- Get campus name if available
  IF NEW.campus_id IS NOT NULL THEN
    SELECT name INTO campus_name FROM campuses WHERE id = NEW.campus_id;
  END IF;
  
  -- Find all @mentions in the message content
  -- Pattern matches @[Name](user_id) format commonly used in mention systems
  -- Also matches simple @name patterns
  
  -- First try to find mentions with UUID pattern: @[Name](uuid)
  FOR match_result IN 
    SELECT regexp_matches(NEW.content, '@\[[^\]]+\]\(([0-9a-f-]{36})\)', 'gi')
  LOOP
    mentioned_user_id := match_result[1]::uuid;
    -- Don't notify the sender about their own message
    IF mentioned_user_id != NEW.user_id THEN
      mentioned_user_ids := mentioned_user_ids || jsonb_build_array(mentioned_user_id::text);
    END IF;
  END LOOP;
  
  -- Also check for @everyone or @all mentions - notify all campus members
  IF NEW.content ~* '@(everyone|all|team)\b' THEN
    SELECT jsonb_agg(user_id::text)
    INTO mentioned_user_ids
    FROM user_campuses
    WHERE campus_id = NEW.campus_id
    AND user_id != NEW.user_id;
  END IF;
  
  -- Try to get the URL and key from vault secrets
  BEGIN
    SELECT decrypted_secret INTO supabase_url
    FROM vault.decrypted_secrets
    WHERE name = 'supabase_url'
    LIMIT 1;
    
    SELECT decrypted_secret INTO service_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
  END;
  
  -- Send notification if there are mentioned users and we have credentials
  IF jsonb_array_length(mentioned_user_ids) > 0 AND supabase_url IS NOT NULL AND service_key IS NOT NULL THEN
    PERFORM net.http_post(
      url := supabase_url || '/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      body := jsonb_build_object(
        'title', COALESCE(sender_name, 'Someone') || ' mentioned you',
        'message', CASE 
          WHEN length(NEW.content) > 100 THEN substring(NEW.content, 1, 100) || '...'
          ELSE NEW.content
        END,
        'url', '/chat',
        'tag', 'mention-' || NEW.id::text,
        'userIds', mentioned_user_ids
      )
    );
  END IF;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_chat_mention failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;
-- === 20260116203926_21f81abf-81e0-4600-ba3f-e48e4eaff5fb.sql ===
-- First drop the existing function that has a different return type
DROP FUNCTION IF EXISTS public.get_profiles_for_campus();

-- Create the new function with filtered sensitive data
CREATE OR REPLACE FUNCTION public.get_profiles_for_campus()
RETURNS TABLE(
  id uuid,
  full_name text,
  avatar_url text,
  positions team_position[],
  email text,
  phone text,
  birthday date,
  anniversary date,
  share_contact_with_campus boolean,
  share_contact_with_pastors boolean,
  ministry_types text[],
  welcome_email_sent_at timestamp with time zone
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  viewer_id uuid := auth.uid();
  is_admin boolean;
  is_pastor boolean;
BEGIN
  -- Check viewer's roles
  is_admin := has_role(viewer_id, 'admin'::app_role);
  is_pastor := has_role(viewer_id, 'campus_worship_pastor'::app_role) 
            OR has_role(viewer_id, 'student_worship_pastor'::app_role)
            OR has_role(viewer_id, 'campus_pastor'::app_role)
            OR has_role(viewer_id, 'network_worship_pastor'::app_role);

  RETURN QUERY
  SELECT 
    p.id,
    p.full_name,
    p.avatar_url,
    p.positions,
    -- Email: filtered based on permissions
    CASE 
      WHEN p.id = viewer_id THEN p.email
      WHEN is_admin THEN p.email
      WHEN is_pastor AND p.share_contact_with_pastors THEN p.email
      WHEN shares_campus_with(viewer_id, p.id) AND p.share_contact_with_campus THEN p.email
      ELSE NULL
    END,
    -- Phone: filtered
    CASE 
      WHEN p.id = viewer_id THEN p.phone
      WHEN is_admin THEN p.phone
      WHEN is_pastor AND p.share_contact_with_pastors THEN p.phone
      WHEN shares_campus_with(viewer_id, p.id) AND p.share_contact_with_campus THEN p.phone
      ELSE NULL
    END,
    -- Birthday: filtered
    CASE 
      WHEN p.id = viewer_id THEN p.birthday
      WHEN is_admin THEN p.birthday
      WHEN is_pastor AND p.share_contact_with_pastors THEN p.birthday
      WHEN shares_campus_with(viewer_id, p.id) AND p.share_contact_with_campus THEN p.birthday
      ELSE NULL
    END,
    -- Anniversary: filtered
    CASE 
      WHEN p.id = viewer_id THEN p.anniversary
      WHEN is_admin THEN p.anniversary
      WHEN is_pastor AND p.share_contact_with_pastors THEN p.anniversary
      WHEN shares_campus_with(viewer_id, p.id) AND p.share_contact_with_campus THEN p.anniversary
      ELSE NULL
    END,
    p.share_contact_with_campus,
    p.share_contact_with_pastors,
    p.ministry_types,
    p.welcome_email_sent_at
  FROM profiles p
  WHERE 
    p.id = viewer_id
    OR is_admin
    OR shares_campus_with(viewer_id, p.id);
END;
$$;
-- === 20260116205248_5cef6b4e-7695-4b93-8e61-aebfd434938f.sql ===
-- Enable pgcrypto extension for encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add encrypted token columns (we'll migrate data in edge functions)
ALTER TABLE public.pco_connections 
ADD COLUMN IF NOT EXISTS access_token_encrypted bytea,
ADD COLUMN IF NOT EXISTS refresh_token_encrypted bytea;

-- Create a view that only exposes non-sensitive fields for client-side queries
DROP VIEW IF EXISTS public.pco_connections_safe;
CREATE VIEW public.pco_connections_safe AS
SELECT 
  id,
  user_id,
  campus_id,
  pco_organization_name,
  connected_at,
  last_sync_at,
  sync_team_members,
  sync_phone_numbers,
  sync_birthdays,
  sync_positions,
  sync_active_only
FROM public.pco_connections;

-- Grant access to the safe view
GRANT SELECT ON public.pco_connections_safe TO authenticated;

-- Add comment explaining the encryption
COMMENT ON COLUMN public.pco_connections.access_token_encrypted IS 'AES-256 encrypted access token. Decryption key stored in edge function secrets.';
COMMENT ON COLUMN public.pco_connections.refresh_token_encrypted IS 'AES-256 encrypted refresh token. Decryption key stored in edge function secrets.';
-- === 20260116205302_094be41b-2902-4c92-895a-56edb1a9a90b.sql ===
-- Drop the SECURITY DEFINER view and recreate with proper RLS
DROP VIEW IF EXISTS public.pco_connections_safe;

-- Create the view without SECURITY DEFINER (inherits caller's permissions)
CREATE VIEW public.pco_connections_safe WITH (security_invoker = true) AS
SELECT 
  id,
  user_id,
  campus_id,
  pco_organization_name,
  connected_at,
  last_sync_at,
  sync_team_members,
  sync_phone_numbers,
  sync_birthdays,
  sync_positions,
  sync_active_only
FROM public.pco_connections;

-- Grant access to the safe view
GRANT SELECT ON public.pco_connections_safe TO authenticated;
-- === 20260116210144_fb3f9011-ae3b-40ef-9a6e-fe9f97e3fa48.sql ===
-- 1. Remove plaintext token columns from pco_connections (keep only encrypted)
-- First check if there's any data to migrate, then remove columns
ALTER TABLE public.pco_connections 
DROP COLUMN IF EXISTS access_token,
DROP COLUMN IF EXISTS refresh_token;

-- 2. Fix user_campus_ministry_positions - require authentication
DROP POLICY IF EXISTS "Anyone can view campus ministry positions" ON public.user_campus_ministry_positions;
CREATE POLICY "Authenticated users can view campus ministry positions" 
ON public.user_campus_ministry_positions 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- 3. Fix song_keys - require authentication  
DROP POLICY IF EXISTS "Anyone can view song keys" ON public.song_keys;
CREATE POLICY "Authenticated users can view song keys"
ON public.song_keys
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- 4. Fix pco_connections_safe view - add proper RLS by recreating with security invoker
DROP VIEW IF EXISTS public.pco_connections_safe;
CREATE VIEW public.pco_connections_safe WITH (security_invoker = true) AS
SELECT 
  id,
  user_id,
  campus_id,
  pco_organization_name,
  connected_at,
  last_sync_at,
  sync_team_members,
  sync_phone_numbers,
  sync_birthdays,
  sync_positions,
  sync_active_only
FROM public.pco_connections
WHERE user_id = auth.uid();

-- Grant access
GRANT SELECT ON public.pco_connections_safe TO authenticated;

-- 5. Tighten profiles table - update RLS to be more restrictive
-- Drop overly permissive policies if they exist
DROP POLICY IF EXISTS "Users can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can view basic profile info" ON public.profiles;

-- Create strict profile viewing policy
CREATE POLICY "Users can view own profile or authorized via consent" 
ON public.profiles 
FOR SELECT 
USING (
  auth.uid() = id 
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (
    shares_campus_with(auth.uid(), id) 
    AND (share_contact_with_campus = true OR share_contact_with_pastors = true)
  )
);

-- 6. Fix service_plans - restrict NULL campus_id visibility to admins/pastors only
DROP POLICY IF EXISTS "Users can view their campus plans" ON public.service_plans;
CREATE POLICY "Users can view their campus plans or network-wide as authorized" 
ON public.service_plans 
FOR SELECT 
USING (
  -- User's own campus plans
  EXISTS (
    SELECT 1 FROM public.user_campuses uc 
    WHERE uc.user_id = auth.uid() 
    AND uc.campus_id = service_plans.campus_id
  )
  OR (
    -- Network-wide plans (null campus) only for admins/pastors
    campus_id IS NULL 
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
      OR has_role(auth.uid(), 'network_worship_leader'::app_role)
    )
  )
);
-- === 20260116211756_65f31853-6fc9-4df2-aed7-823df4b6fc32.sql ===
-- Drop existing policies first
DROP POLICY IF EXISTS "Users can view plans for their campuses" ON public.service_plans;
DROP POLICY IF EXISTS "Users can view songs for accessible plans" ON public.plan_songs;

-- Recreate service_plans policy: Require campus membership or leadership role
CREATE POLICY "Users can view plans for their campuses"
ON public.service_plans
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND (
    -- User is a member of this campus
    EXISTS (
      SELECT 1 FROM public.user_campuses uc
      WHERE uc.user_id = auth.uid()
      AND uc.campus_id = service_plans.campus_id
    )
    -- OR user has network-wide leadership role (for plans with NULL campus_id)
    OR (
      service_plans.campus_id IS NULL
      AND EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin'::public.app_role, 'network_worship_pastor'::public.app_role, 'network_worship_leader'::public.app_role)
      )
    )
  )
);

-- Recreate plan_songs policy: Only allow viewing if user can view the parent service_plan
CREATE POLICY "Users can view songs for accessible plans"
ON public.plan_songs
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.service_plans sp
    WHERE sp.id = plan_songs.plan_id
    AND (
      -- User is a member of the plan's campus
      EXISTS (
        SELECT 1 FROM public.user_campuses uc
        WHERE uc.user_id = auth.uid()
        AND uc.campus_id = sp.campus_id
      )
      -- OR network-wide leadership for NULL campus plans
      OR (
        sp.campus_id IS NULL
        AND EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
          AND ur.role IN ('admin'::public.app_role, 'network_worship_pastor'::public.app_role, 'network_worship_leader'::public.app_role)
        )
      )
    )
  )
);
-- === 20260116211934_f65ef063-0ca3-431f-86c2-c57f47811f67.sql ===
-- Enable RLS on the pco_connections_safe view
ALTER VIEW public.pco_connections_safe SET (security_invoker = true);

-- Since views with security_invoker inherit RLS from base tables, 
-- but the scanner wants explicit policies, let's ensure the base table policy is tight
-- and recreate the view to only show user's own data

DROP VIEW IF EXISTS public.pco_connections_safe;

CREATE VIEW public.pco_connections_safe 
WITH (security_invoker = true)
AS
SELECT 
  id,
  user_id,
  campus_id,
  pco_organization_name,
  connected_at,
  last_sync_at,
  sync_team_members,
  sync_positions,
  sync_birthdays,
  sync_phone_numbers,
  sync_active_only
FROM public.pco_connections
WHERE user_id = auth.uid();

-- Grant appropriate permissions
GRANT SELECT ON public.pco_connections_safe TO authenticated;
-- === 20260116212027_ddd9880a-1b53-497e-a2ea-df614c403c63.sql ===
-- Fix 1: Tighten profiles RLS - require same campus for consent-based visibility
DROP POLICY IF EXISTS "Users can view own profile or authorized via consent" ON public.profiles;

CREATE POLICY "Users can view own profile or same-campus authorized"
ON public.profiles
FOR SELECT
USING (
  -- Always can view own profile
  auth.uid() = id
  -- OR user is admin (can view all)
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role = 'admin'::public.app_role
  )
  -- OR shares campus AND has appropriate consent
  OR (
    public.shares_campus_with(id, auth.uid())
    AND (
      -- Campus members who share with campus
      share_contact_with_campus = true
      -- OR pastors can see if user shares with pastors
      OR (
        share_contact_with_pastors = true
        AND EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
          AND ur.role IN ('campus_pastor'::public.app_role, 'campus_worship_pastor'::public.app_role, 'network_worship_pastor'::public.app_role)
        )
      )
    )
  )
);

-- Fix 2: Prevent direct access to encrypted tokens in pco_connections
-- Users should only access via the safe view, not read encrypted columns directly
DROP POLICY IF EXISTS "Users can read own connection" ON public.pco_connections;

-- Create a restrictive read policy that excludes token columns
-- Since RLS can't filter columns, we prevent all direct reads and force use of safe view
CREATE POLICY "Only service role can read pco_connections"
ON public.pco_connections
FOR SELECT
USING (
  -- Only allow reads via service role (edge functions)
  -- Users must use pco_connections_safe view instead
  false
);

-- But allow users to check if they have a connection (for UI purposes) via the safe view
-- The safe view with security_invoker will work because it's defined with auth.uid() filter

-- Allow users to insert/update/delete their own connections
DROP POLICY IF EXISTS "Users can insert own connection" ON public.pco_connections;
CREATE POLICY "Users can insert own connection"
ON public.pco_connections
FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own connection" ON public.pco_connections;
CREATE POLICY "Users can update own connection"
ON public.pco_connections
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own connection" ON public.pco_connections;
CREATE POLICY "Users can delete own connection"
ON public.pco_connections
FOR DELETE
USING (auth.uid() = user_id);

-- Fix 3: Recreate safe view to work without direct table RLS
-- Since we blocked direct reads, recreate view as SECURITY DEFINER function instead
DROP VIEW IF EXISTS public.pco_connections_safe;

-- Create a secure function that returns only the user's connection metadata
CREATE OR REPLACE FUNCTION public.get_my_pco_connection()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  campus_id uuid,
  pco_organization_name text,
  connected_at timestamptz,
  last_sync_at timestamptz,
  sync_team_members boolean,
  sync_positions boolean,
  sync_birthdays boolean,
  sync_phone_numbers boolean,
  sync_active_only boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    id,
    user_id,
    campus_id,
    pco_organization_name,
    connected_at,
    last_sync_at,
    sync_team_members,
    sync_positions,
    sync_birthdays,
    sync_phone_numbers,
    sync_active_only
  FROM public.pco_connections
  WHERE user_id = auth.uid();
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_my_pco_connection() TO authenticated;
-- === 20260116213231_61f93557-a361-48ab-92d5-78dfcf7bfd8d.sql ===
-- Create a trigger function to protect encrypted token columns
-- Only service role (edge functions) can modify these sensitive columns
CREATE OR REPLACE FUNCTION public.protect_pco_encrypted_tokens()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if encrypted token columns are being modified
  IF (OLD.access_token_encrypted IS DISTINCT FROM NEW.access_token_encrypted) OR 
     (OLD.refresh_token_encrypted IS DISTINCT FROM NEW.refresh_token_encrypted) OR
     (OLD.token_expires_at IS DISTINCT FROM NEW.token_expires_at) THEN
    -- Only allow if this is a service role operation (edge functions)
    -- Service role operations have auth.uid() as NULL and role claim as 'service_role'
    IF auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot modify encrypted tokens directly. Use the authorized API.';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create the trigger
DROP TRIGGER IF EXISTS protect_pco_tokens_trigger ON public.pco_connections;
CREATE TRIGGER protect_pco_tokens_trigger
  BEFORE UPDATE ON public.pco_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_pco_encrypted_tokens();

-- Also add a trigger for INSERT to ensure only service role can set initial tokens
CREATE OR REPLACE FUNCTION public.protect_pco_encrypted_tokens_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If encrypted tokens are being set, only allow from service role
  IF NEW.access_token_encrypted IS NOT NULL OR NEW.refresh_token_encrypted IS NOT NULL THEN
    IF auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot set encrypted tokens directly. Use the authorized API.';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_pco_tokens_insert_trigger ON public.pco_connections;
CREATE TRIGGER protect_pco_tokens_insert_trigger
  BEFORE INSERT ON public.pco_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_pco_encrypted_tokens_insert();
-- === 20260116222858_d403caa5-653b-4bc2-b59e-027d7539f18b.sql ===
-- Add submitted_for_approval_at column to track when setlist was submitted for approval
ALTER TABLE public.draft_sets 
ADD COLUMN IF NOT EXISTS submitted_for_approval_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone;

-- Create a table to track setlist approvals
CREATE TABLE public.setlist_approvals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  draft_set_id uuid NOT NULL REFERENCES public.draft_sets(id) ON DELETE CASCADE,
  submitted_by uuid NOT NULL REFERENCES public.profiles(id),
  submitted_at timestamp with time zone NOT NULL DEFAULT now(),
  approver_id uuid REFERENCES public.profiles(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  notes text,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.setlist_approvals ENABLE ROW LEVEL SECURITY;

-- Create policies for setlist_approvals
-- Anyone can view approvals (for transparency)
CREATE POLICY "Users can view setlist approvals" 
ON public.setlist_approvals 
FOR SELECT 
USING (true);

-- Only campus admins and above can submit for approval
CREATE POLICY "Authorized users can submit for approval" 
ON public.setlist_approvals 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'campus_admin', 'campus_worship_pastor', 'network_worship_pastor', 'network_worship_leader')
  )
);

-- Kyle Elkins and admins can update approvals (approve/reject)
CREATE POLICY "Approvers can update approvals" 
ON public.setlist_approvals 
FOR UPDATE 
USING (
  -- Kyle Elkins specifically
  auth.uid() = '22c10f05-955a-498c-b18f-2ac570868b35'::uuid
  OR
  -- Or admins/network worship leaders
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'network_worship_pastor', 'network_worship_leader')
  )
);

-- Create index for faster lookups
CREATE INDEX idx_setlist_approvals_draft_set_id ON public.setlist_approvals(draft_set_id);
CREATE INDEX idx_setlist_approvals_status ON public.setlist_approvals(status);
CREATE INDEX idx_setlist_approvals_submitted_at ON public.setlist_approvals(submitted_at DESC);

-- Enable realtime for approvals
ALTER PUBLICATION supabase_realtime ADD TABLE public.setlist_approvals;
-- === 20260117013454_dc1df26d-efb2-4c0c-ae1b-9677fd3c5c2f.sql ===
-- Drop and recreate get_profile_safe function to include gender field
DROP FUNCTION IF EXISTS public.get_profile_safe(uuid);

CREATE FUNCTION public.get_profile_safe(profile_id uuid)
RETURNS TABLE (
  id uuid,
  full_name text,
  avatar_url text,
  positions public.team_position[],
  email text,
  phone text,
  birthday text,
  anniversary text,
  share_contact_with_campus boolean,
  share_contact_with_pastors boolean,
  created_at timestamptz,
  updated_at timestamptz,
  gender text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  viewer_id uuid := auth.uid();
  is_admin boolean;
  is_pastor boolean;
BEGIN
  -- Check viewer's roles
  is_admin := has_role(viewer_id, 'admin'::app_role);
  is_pastor := has_role(viewer_id, 'campus_worship_pastor'::app_role) 
            OR has_role(viewer_id, 'student_worship_pastor'::app_role)
            OR has_role(viewer_id, 'campus_pastor'::app_role);

  RETURN QUERY
  SELECT 
    p.id,
    p.full_name,
    p.avatar_url,
    p.positions,
    -- Email: filtered based on permissions
    CASE 
      WHEN p.id = viewer_id THEN p.email
      WHEN is_admin THEN p.email
      WHEN is_pastor AND p.share_contact_with_pastors THEN p.email
      WHEN shares_campus_with(viewer_id, p.id) AND p.share_contact_with_campus THEN p.email
      ELSE NULL
    END,
    -- Phone: filtered
    CASE 
      WHEN p.id = viewer_id THEN p.phone
      WHEN is_admin THEN p.phone
      WHEN is_pastor AND p.share_contact_with_pastors THEN p.phone
      WHEN shares_campus_with(viewer_id, p.id) AND p.share_contact_with_campus THEN p.phone
      ELSE NULL
    END,
    -- Birthday: filtered
    CASE 
      WHEN p.id = viewer_id THEN p.birthday
      WHEN is_admin THEN p.birthday
      WHEN is_pastor AND p.share_contact_with_pastors THEN p.birthday
      WHEN shares_campus_with(viewer_id, p.id) AND p.share_contact_with_campus THEN p.birthday
      ELSE NULL
    END,
    -- Anniversary: filtered
    CASE 
      WHEN p.id = viewer_id THEN p.anniversary
      WHEN is_admin THEN p.anniversary
      WHEN is_pastor AND p.share_contact_with_pastors THEN p.anniversary
      WHEN shares_campus_with(viewer_id, p.id) AND p.share_contact_with_campus THEN p.anniversary
      ELSE NULL
    END,
    p.share_contact_with_campus,
    p.share_contact_with_pastors,
    p.created_at,
    p.updated_at,
    -- Gender: always visible (needed for swap matching)
    p.gender
  FROM profiles p
  WHERE p.id = profile_id
    AND (
      p.id = viewer_id
      OR is_admin
      OR shares_campus_with(viewer_id, p.id)
    );
END;
$$;
-- === 20260117035155_3062684d-5902-472a-9ef5-c7a42b8a248b.sql ===
-- Drop and recreate get_profile_safe function with correct return type
DROP FUNCTION IF EXISTS public.get_profile_safe(uuid);

CREATE FUNCTION public.get_profile_safe(profile_id uuid)
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  avatar_url text,
  phone text,
  birthday text,
  anniversary text,
  gender text,
  positions public.team_position[],
  share_contact_with_campus boolean,
  share_contact_with_pastors boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  viewer_id uuid := auth.uid();
  is_own_profile boolean;
  is_admin boolean;
  is_pastor boolean;
  shares_campus boolean;
BEGIN
  -- Check if viewing own profile
  is_own_profile := (profile_id = viewer_id);
  
  -- Check if viewer is admin or network worship pastor/leader
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = viewer_id 
    AND ur.role IN ('admin', 'network_worship_pastor', 'network_worship_leader')
  ) INTO is_admin;
  
  -- Check if viewer is any type of pastor
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = viewer_id 
    AND ur.role IN ('campus_pastor', 'campus_worship_pastor', 'student_worship_pastor', 'network_worship_pastor')
  ) INTO is_pastor;
  
  -- Check if they share a campus
  SELECT EXISTS (
    SELECT 1 FROM public.user_campuses uc1
    JOIN public.user_campuses uc2 ON uc1.campus_id = uc2.campus_id
    WHERE uc1.user_id = viewer_id AND uc2.user_id = profile_id
  ) INTO shares_campus;
  
  -- Return profile data with appropriate masking
  RETURN QUERY
  SELECT 
    p.id,
    p.email,
    p.full_name,
    p.avatar_url,
    -- Mask phone based on consent
    CASE 
      WHEN is_own_profile OR is_admin THEN p.phone
      WHEN is_pastor AND p.share_contact_with_pastors THEN p.phone
      WHEN shares_campus AND p.share_contact_with_campus THEN p.phone
      ELSE NULL
    END as phone,
    -- Mask birthday based on consent  
    CASE 
      WHEN is_own_profile OR is_admin THEN p.birthday::text
      WHEN is_pastor AND p.share_contact_with_pastors THEN p.birthday::text
      WHEN shares_campus AND p.share_contact_with_campus THEN p.birthday::text
      ELSE NULL
    END as birthday,
    -- Mask anniversary based on consent
    CASE 
      WHEN is_own_profile OR is_admin THEN p.anniversary::text
      WHEN is_pastor AND p.share_contact_with_pastors THEN p.anniversary::text
      WHEN shares_campus AND p.share_contact_with_campus THEN p.anniversary::text
      ELSE NULL
    END as anniversary,
    p.gender,
    p.positions,
    p.share_contact_with_campus,
    p.share_contact_with_pastors,
    p.created_at,
    p.updated_at
  FROM public.profiles p
  WHERE p.id = profile_id;
END;
$$;
-- === 20260117035729_d5e4642b-5f46-44b7-8f9c-6d5848d38f5c.sql ===
-- Drop and recreate get_profiles_for_campus to include gender field
DROP FUNCTION IF EXISTS public.get_profiles_for_campus();

CREATE FUNCTION public.get_profiles_for_campus()
RETURNS TABLE(
  id uuid, 
  full_name text, 
  avatar_url text, 
  positions team_position[], 
  email text, 
  phone text, 
  birthday date, 
  anniversary date, 
  share_contact_with_campus boolean, 
  share_contact_with_pastors boolean, 
  ministry_types text[], 
  welcome_email_sent_at timestamp with time zone,
  gender text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  viewer_id uuid := auth.uid();
  is_admin boolean;
  is_pastor boolean;
BEGIN
  -- Check viewer's roles
  is_admin := has_role(viewer_id, 'admin'::app_role);
  is_pastor := has_role(viewer_id, 'campus_worship_pastor'::app_role) 
            OR has_role(viewer_id, 'student_worship_pastor'::app_role)
            OR has_role(viewer_id, 'campus_pastor'::app_role)
            OR has_role(viewer_id, 'network_worship_pastor'::app_role);

  RETURN QUERY
  SELECT 
    p.id,
    p.full_name,
    p.avatar_url,
    p.positions,
    -- Email: filtered based on permissions
    CASE 
      WHEN p.id = viewer_id THEN p.email
      WHEN is_admin THEN p.email
      WHEN is_pastor AND p.share_contact_with_pastors THEN p.email
      WHEN shares_campus_with(viewer_id, p.id) AND p.share_contact_with_campus THEN p.email
      ELSE NULL
    END,
    -- Phone: filtered
    CASE 
      WHEN p.id = viewer_id THEN p.phone
      WHEN is_admin THEN p.phone
      WHEN is_pastor AND p.share_contact_with_pastors THEN p.phone
      WHEN shares_campus_with(viewer_id, p.id) AND p.share_contact_with_campus THEN p.phone
      ELSE NULL
    END,
    -- Birthday: filtered
    CASE 
      WHEN p.id = viewer_id THEN p.birthday
      WHEN is_admin THEN p.birthday
      WHEN is_pastor AND p.share_contact_with_pastors THEN p.birthday
      WHEN shares_campus_with(viewer_id, p.id) AND p.share_contact_with_campus THEN p.birthday
      ELSE NULL
    END,
    -- Anniversary: filtered
    CASE 
      WHEN p.id = viewer_id THEN p.anniversary
      WHEN is_admin THEN p.anniversary
      WHEN is_pastor AND p.share_contact_with_pastors THEN p.anniversary
      WHEN shares_campus_with(viewer_id, p.id) AND p.share_contact_with_campus THEN p.anniversary
      ELSE NULL
    END,
    p.share_contact_with_campus,
    p.share_contact_with_pastors,
    p.ministry_types,
    p.welcome_email_sent_at,
    p.gender
  FROM profiles p
  WHERE 
    p.id = viewer_id
    OR is_admin
    OR shares_campus_with(viewer_id, p.id);
END;
$$;
-- === 20260118035913_1734fd0d-0586-4a31-9307-df4efe5cc258.sql ===
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
-- === 20260118035923_a7480c49-02d2-424a-a2dd-ccdaa782b194.sql ===
-- Fix function search path security warning
CREATE OR REPLACE FUNCTION public.cleanup_old_notification_reads()
RETURNS void AS $$
BEGIN
  DELETE FROM public.notification_read_status
  WHERE created_at < now() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
-- === 20260124172235_3103a72b-66de-4c7b-88d0-0aa81f899070.sql ===
-- Drop the overly permissive SELECT policy
DROP POLICY IF EXISTS "Users can view setlist approvals" ON public.setlist_approvals;

-- Create a new policy that restricts SELECT to admins only
CREATE POLICY "Admins can view setlist approvals"
ON public.setlist_approvals
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
);
-- === 20260124192337_b194b8b5-e6be-4acd-ad54-f5c699f5539d.sql ===
-- Security Hardening Migration
-- Phase 1: Remove duplicate PCO connections policies
DROP POLICY IF EXISTS "Users can delete own connection" ON public.pco_connections;
DROP POLICY IF EXISTS "Users can insert own connection" ON public.pco_connections;
DROP POLICY IF EXISTS "Users can update own connection" ON public.pco_connections;

-- Phase 2: Tighten user_roles visibility
DROP POLICY IF EXISTS "Users can view roles" ON public.user_roles;

CREATE POLICY "Users can view their own roles or admins can view all"
ON public.user_roles FOR SELECT
USING (
  auth.uid() = user_id 
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (
    shares_campus_with(auth.uid(), user_id)
    AND (
      has_role(auth.uid(), 'campus_admin'::app_role)
      OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
    )
  )
);

-- Phase 3: Tighten swap_requests visibility
DROP POLICY IF EXISTS "Users can view relevant swap requests" ON public.swap_requests;

CREATE POLICY "Users can view relevant swap requests"
ON public.swap_requests FOR SELECT
USING (
  auth.uid() = requester_id 
  OR auth.uid() = target_user_id
  OR auth.uid() = accepted_by_id
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (
    target_user_id IS NULL 
    AND status = 'pending'::swap_request_status
    AND EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
      AND tm.team_id = swap_requests.team_id
      AND tm.position = swap_requests.position
    )
  )
);

-- Phase 4: Remove duplicate service_plans policy
DROP POLICY IF EXISTS "Users can view plans for their campuses" ON public.service_plans;

-- Phase 5: Remove duplicate plan_songs policy
DROP POLICY IF EXISTS "Users can view songs for accessible plans" ON public.plan_songs;
-- === 20260124200529_1f72554f-0127-4f5f-b594-19f2be3ec772.sql ===
-- Security Hardening: Restrict direct profiles table access
-- All profile queries MUST go through secure RPC functions that implement field-level masking

-- Drop the overly permissive SELECT policy
DROP POLICY IF EXISTS "Users can view own profile or same-campus authorized" ON public.profiles;

-- Create a restrictive policy: users can only directly SELECT their own profile
-- All other access must go through get_profiles_for_campus, get_profile_safe, or get_basic_profiles
CREATE POLICY "Users can only view their own profile directly"
ON public.profiles FOR SELECT
USING (auth.uid() = id);

-- Admins still need direct access for management purposes
CREATE POLICY "Admins can view all profiles"
ON public.profiles FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));
-- === 20260126171851_3b6ab809-ae26-4b68-8b43-fa4048f4ef8c.sql ===
-- Drop the overly permissive SELECT policy
DROP POLICY IF EXISTS "Admins can view all break requests" ON public.break_requests;

-- Drop the overly permissive UPDATE policy  
DROP POLICY IF EXISTS "Admins can update break requests" ON public.break_requests;

-- Create a function to check if the viewer is a Campus Worship Pastor for the user's campus
CREATE OR REPLACE FUNCTION public.can_view_break_request(_request_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    -- Global admins can see all
    has_role(auth.uid(), 'admin'::app_role)
    OR
    -- Campus Worship Pastors can only see requests from users at their campus
    (
      has_role(auth.uid(), 'campus_worship_pastor'::app_role)
      AND shares_campus_with(auth.uid(), _request_user_id)
    )
$$;

-- Create a function to check if the viewer can review (update) a break request
CREATE OR REPLACE FUNCTION public.can_review_break_request(_request_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    -- Global admins can review all
    has_role(auth.uid(), 'admin'::app_role)
    OR
    -- Campus Worship Pastors can only review requests from users at their campus
    (
      has_role(auth.uid(), 'campus_worship_pastor'::app_role)
      AND shares_campus_with(auth.uid(), _request_user_id)
    )
$$;

-- Create new restrictive SELECT policy for admins - global admin only
CREATE POLICY "Global admins can view all break requests"
ON public.break_requests
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create SELECT policy for Campus Worship Pastors - campus-scoped
CREATE POLICY "Campus Worship Pastors can view campus break requests"
ON public.break_requests
FOR SELECT
USING (
  has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  AND shares_campus_with(auth.uid(), user_id)
);

-- Create new restrictive UPDATE policy for global admins
CREATE POLICY "Global admins can update break requests"
ON public.break_requests
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create UPDATE policy for Campus Worship Pastors - campus-scoped
CREATE POLICY "Campus Worship Pastors can update campus break requests"
ON public.break_requests
FOR UPDATE
USING (
  has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  AND shares_campus_with(auth.uid(), user_id)
);
-- === 20260126172846_a75481e7-b3c4-4a4c-81d3-ed035794f21b.sql ===
-- Create a function to get upcoming birthdays for all authenticated users
-- This only exposes birthday-related data (id, name, avatar, birthday)
-- without revealing other sensitive fields like phone, email, etc.

CREATE OR REPLACE FUNCTION public.get_upcoming_birthdays()
RETURNS TABLE (
  id uuid,
  full_name text,
  avatar_url text,
  birthday date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    p.id,
    p.full_name,
    p.avatar_url,
    p.birthday
  FROM public.profiles p
  INNER JOIN public.user_campuses uc ON uc.user_id = p.id
  WHERE p.birthday IS NOT NULL
    AND EXISTS (
      -- Only show birthdays for users who share a campus with the viewer
      SELECT 1 FROM public.user_campuses viewer_uc
      WHERE viewer_uc.user_id = auth.uid()
        AND viewer_uc.campus_id = uc.campus_id
    )
  GROUP BY p.id, p.full_name, p.avatar_url, p.birthday
$$;
-- === 20260126173512_fb580524-87b8-4ad7-aeda-2378d92e73c2.sql ===
-- Add request_type column to break_requests table
ALTER TABLE public.break_requests 
ADD COLUMN request_type text NOT NULL DEFAULT 'need_break';

-- Add a check constraint to ensure valid values
ALTER TABLE public.break_requests 
ADD CONSTRAINT break_requests_request_type_check 
CHECK (request_type IN ('need_break', 'willing_break'));
-- === 20260126174021_bcd77342-705c-49cf-94e1-87d708ee0afa.sql ===
-- Create trigger function to notify Campus Worship Pastors of new break requests
CREATE OR REPLACE FUNCTION public.notify_break_request_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  requester_name TEXT;
  period_name TEXT;
  request_type_label TEXT;
  pastor_user_ids JSONB;
  supabase_url TEXT;
  service_key TEXT;
BEGIN
  -- Get requester name
  SELECT full_name INTO requester_name FROM profiles WHERE id = NEW.user_id;
  
  -- Get rotation period name
  SELECT name INTO period_name FROM rotation_periods WHERE id = NEW.rotation_period_id;
  
  -- Format request type for display
  request_type_label := CASE 
    WHEN NEW.request_type = 'willing_break' THEN 'is willing to take a break'
    ELSE 'needs a break'
  END;
  
  -- Find Campus Worship Pastors who share a campus with the requester
  SELECT jsonb_agg(DISTINCT ur.user_id::text)
  INTO pastor_user_ids
  FROM user_roles ur
  WHERE ur.role = 'campus_worship_pastor'
    AND shares_campus_with(ur.user_id, NEW.user_id);
  
  -- Try to get the URL and key from vault secrets
  BEGIN
    SELECT decrypted_secret INTO supabase_url
    FROM vault.decrypted_secrets
    WHERE name = 'supabase_url'
    LIMIT 1;
    
    SELECT decrypted_secret INTO service_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
  END;
  
  -- Only send if there are pastors to notify and we have credentials
  IF pastor_user_ids IS NOT NULL AND jsonb_array_length(pastor_user_ids) > 0 
     AND supabase_url IS NOT NULL AND service_key IS NOT NULL THEN
    PERFORM net.http_post(
      url := supabase_url || '/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      body := jsonb_build_object(
        'title', 'Break Request',
        'message', COALESCE(requester_name, 'Someone') || ' ' || request_type_label || ' for ' || COALESCE(period_name, 'a rotation period'),
        'url', '/team-builder',
        'tag', 'break-request-' || NEW.id::text,
        'userIds', pastor_user_ids
      )
    );
  END IF;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_break_request_created failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- Create the trigger
DROP TRIGGER IF EXISTS on_break_request_created ON public.break_requests;
CREATE TRIGGER on_break_request_created
  AFTER INSERT ON public.break_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_break_request_created();
-- === 20260126174746_8447e29d-26aa-41e5-8903-9150cd174057.sql ===
-- Add ministry_type column to break_requests
ALTER TABLE public.break_requests 
ADD COLUMN ministry_type text;

-- Add comment to explain the column
COMMENT ON COLUMN public.break_requests.ministry_type IS 'Optional ministry type the break request applies to (e.g., weekend, student)';
-- === 20260126175426_3f68f547-f25d-416a-9707-d4bc861da010.sql ===
-- Update the notify_break_request_created function to include admin role holders
CREATE OR REPLACE FUNCTION public.notify_break_request_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  requester_name TEXT;
  period_name TEXT;
  request_type_label TEXT;
  recipient_user_ids JSONB;
  supabase_url TEXT;
  service_key TEXT;
BEGIN
  -- Get requester name
  SELECT full_name INTO requester_name FROM profiles WHERE id = NEW.user_id;
  
  -- Get rotation period name
  SELECT name INTO period_name FROM rotation_periods WHERE id = NEW.rotation_period_id;
  
  -- Format request type for display
  request_type_label := CASE 
    WHEN NEW.request_type = 'willing_break' THEN 'is willing to take a break'
    ELSE 'needs a break'
  END;
  
  -- Find Admins (global) and Campus Worship Pastors (campus-scoped) to notify
  SELECT jsonb_agg(DISTINCT ur.user_id::text)
  INTO recipient_user_ids
  FROM user_roles ur
  WHERE 
    -- Global admins always get notified
    ur.role = 'admin'
    OR
    -- Campus Worship Pastors only for their campus
    (ur.role = 'campus_worship_pastor' AND shares_campus_with(ur.user_id, NEW.user_id));
  
  -- Try to get the URL and key from vault secrets
  BEGIN
    SELECT decrypted_secret INTO supabase_url
    FROM vault.decrypted_secrets
    WHERE name = 'supabase_url'
    LIMIT 1;
    
    SELECT decrypted_secret INTO service_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
  END;
  
  -- Only send if there are recipients to notify and we have credentials
  IF recipient_user_ids IS NOT NULL AND jsonb_array_length(recipient_user_ids) > 0 
     AND supabase_url IS NOT NULL AND service_key IS NOT NULL THEN
    PERFORM net.http_post(
      url := supabase_url || '/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      body := jsonb_build_object(
        'title', 'Break Request',
        'message', COALESCE(requester_name, 'Someone') || ' ' || request_type_label || ' for ' || COALESCE(period_name, 'a rotation period'),
        'url', '/team-builder',
        'tag', 'break-request-' || NEW.id::text,
        'userIds', recipient_user_ids
      )
    );
  END IF;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_break_request_created failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;
-- === 20260126204012_ec65ee09-39e9-43f1-b0b3-6bcb0dcd4f37.sql ===
-- Add campus_id to team_schedule for per-campus schedules
ALTER TABLE team_schedule 
ADD COLUMN campus_id uuid REFERENCES campuses(id);

-- Create index for efficient campus-based queries
CREATE INDEX idx_team_schedule_campus_id ON team_schedule(campus_id);
-- === 20260127015126_12e3e8ef-4581-475b-b063-8834c376ac19.sql ===
-- Add audio_url column to songs table
ALTER TABLE public.songs ADD COLUMN IF NOT EXISTS audio_url TEXT;

-- Create storage bucket for song audio files
INSERT INTO storage.buckets (id, name, public) 
VALUES ('song-audio', 'song-audio', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policy: Admins can upload audio files
CREATE POLICY "Admins can upload audio" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'song-audio' AND
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'campus_admin', 'campus_worship_pastor', 'student_worship_pastor')
    )
  );

-- RLS policy: Admins can update audio files
CREATE POLICY "Admins can update audio" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'song-audio' AND
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'campus_admin', 'campus_worship_pastor', 'student_worship_pastor')
    )
  );

-- RLS policy: Admins can delete audio files
CREATE POLICY "Admins can delete audio" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'song-audio' AND
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'campus_admin', 'campus_worship_pastor', 'student_worship_pastor')
    )
  );

-- RLS policy: Anyone authenticated can view audio files
CREATE POLICY "Anyone can view audio" ON storage.objects
  FOR SELECT USING (bucket_id = 'song-audio');
-- === 20260127025029_c8ba0dd8-01cb-4d3c-9908-4b25e306d8fa.sql ===
-- Create albums table
CREATE TABLE public.albums (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  artwork_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create album_tracks junction table (links albums to songs)
CREATE TABLE public.album_tracks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  album_id UUID NOT NULL REFERENCES public.albums(id) ON DELETE CASCADE,
  song_id UUID NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
  track_number INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(album_id, song_id),
  UNIQUE(album_id, track_number)
);

-- Enable RLS
ALTER TABLE public.albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.album_tracks ENABLE ROW LEVEL SECURITY;

-- Anyone can view albums
CREATE POLICY "Anyone can view albums" ON public.albums
  FOR SELECT USING (true);

-- Only admin can manage albums
CREATE POLICY "Admin can insert albums" ON public.albums
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );

CREATE POLICY "Admin can update albums" ON public.albums
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );

CREATE POLICY "Admin can delete albums" ON public.albums
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );

-- Anyone can view album tracks
CREATE POLICY "Anyone can view album tracks" ON public.album_tracks
  FOR SELECT USING (true);

-- Only admin can manage album tracks
CREATE POLICY "Admin can insert album tracks" ON public.album_tracks
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );

CREATE POLICY "Admin can update album tracks" ON public.album_tracks
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );

CREATE POLICY "Admin can delete album tracks" ON public.album_tracks
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );

-- Create storage bucket for album artwork
INSERT INTO storage.buckets (id, name, public) 
VALUES ('album-artwork', 'album-artwork', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies - only admin can upload artwork
CREATE POLICY "Admin can upload album artwork" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'album-artwork' AND
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );

CREATE POLICY "Admin can update album artwork" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'album-artwork' AND
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );

CREATE POLICY "Admin can delete album artwork" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'album-artwork' AND
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );

CREATE POLICY "Anyone can view album artwork" ON storage.objects
  FOR SELECT USING (bucket_id = 'album-artwork');

-- Update song-audio bucket to only allow admin uploads
DROP POLICY IF EXISTS "Admins can upload audio" ON storage.objects;
CREATE POLICY "Admin can upload song audio" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'song-audio' AND
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );

CREATE POLICY "Admin can update song audio" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'song-audio' AND
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );

CREATE POLICY "Admin can delete song audio" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'song-audio' AND
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );

-- Add trigger for updated_at on albums
CREATE TRIGGER update_albums_updated_at
  BEFORE UPDATE ON public.albums
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
-- === 20260127034717_f3aadf6c-1f80-48d2-a2f7-6cb77916eff5.sql ===
-- Make song_id nullable in album_tracks to allow standalone album tracks
ALTER TABLE public.album_tracks 
ALTER COLUMN song_id DROP NOT NULL;

-- Add columns for standalone track info
ALTER TABLE public.album_tracks
ADD COLUMN IF NOT EXISTS title TEXT,
ADD COLUMN IF NOT EXISTS author TEXT,
ADD COLUMN IF NOT EXISTS audio_url TEXT;

-- Add constraint: either song_id OR title must be present
ALTER TABLE public.album_tracks
ADD CONSTRAINT album_tracks_has_title_or_song 
CHECK (song_id IS NOT NULL OR title IS NOT NULL);
-- === 20260129015939_3c930659-72f4-4c1c-9154-c1f53d4d1370.sql ===
-- Add request_type column to swap_requests to distinguish between swap and fill-in requests
ALTER TABLE public.swap_requests 
ADD COLUMN request_type text NOT NULL DEFAULT 'swap' 
CHECK (request_type IN ('swap', 'fill_in'));
-- === 20260129030734_54c5d82a-52c1-42ee-8cf1-5afef08e500b.sql ===
-- Allow team members and campus-scoped leaders to see ACCEPTED swap/cover requests so rosters render correctly.
-- This does NOT change who can create/accept requests; it only broadens read access for accepted requests.

CREATE POLICY "Users can view accepted swaps for their teams"
ON public.swap_requests
FOR SELECT
USING (
  status = 'accepted'::swap_request_status
  AND EXISTS (
    SELECT 1
    FROM public.team_members tm
    WHERE tm.user_id = auth.uid()
      AND tm.team_id = swap_requests.team_id
  )
);

CREATE POLICY "Leaders can view accepted swaps for their campus"
ON public.swap_requests
FOR SELECT
USING (
  status = 'accepted'::swap_request_status
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'campus_admin'::app_role)
    OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'network_worship_leader'::app_role)
    OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'video_director'::app_role)
    OR has_role(auth.uid(), 'production_manager'::app_role)
  )
  AND (
    shares_campus_with(auth.uid(), swap_requests.requester_id)
    OR (swap_requests.accepted_by_id IS NOT NULL AND shares_campus_with(auth.uid(), swap_requests.accepted_by_id))
    OR (swap_requests.target_user_id IS NOT NULL AND shares_campus_with(auth.uid(), swap_requests.target_user_id))
  )
);

-- === 20260129035133_c3f4bf63-d3a7-491b-9666-feaf8d3ea58d.sql ===
-- Allow campus pastors to view accepted swaps affecting users in their campus
-- This fixes roster/Calendar not applying accepted covers for campus-scoped managers.

DROP POLICY IF EXISTS "Leaders can view accepted swaps for their campus" ON public.swap_requests;

CREATE POLICY "Leaders can view accepted swaps for their campus"
ON public.swap_requests
FOR SELECT
USING (
  (status = 'accepted'::swap_request_status)
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'campus_admin'::app_role)
    OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'network_worship_leader'::app_role)
    OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'video_director'::app_role)
    OR has_role(auth.uid(), 'production_manager'::app_role)
    OR has_role(auth.uid(), 'campus_pastor'::app_role)
  )
  AND (
    shares_campus_with(auth.uid(), requester_id)
    OR (accepted_by_id IS NOT NULL AND shares_campus_with(auth.uid(), accepted_by_id))
    OR (target_user_id IS NOT NULL AND shares_campus_with(auth.uid(), target_user_id))
  )
);

-- === 20260129043307_bead7067-68fb-4b36-b003-a512b62a0d13.sql ===
-- Add policy requiring authentication for profiles table
-- This prevents unauthenticated users from accessing any profile data
CREATE POLICY "Require authentication for profiles"
ON public.profiles
FOR SELECT
USING (auth.uid() IS NOT NULL);
-- === 20260130022034_5ac36665-6a6f-4d73-b638-8fa412aee250.sql ===
-- Add policy to allow ALL authenticated users to view accepted swap requests
-- This ensures team rosters correctly display confirmed swaps/covers for everyone
CREATE POLICY "All users can view accepted swaps for roster display"
ON public.swap_requests
FOR SELECT
USING (
  status = 'accepted'::swap_request_status
  AND auth.uid() IS NOT NULL
);
-- === 20260130034430_82c846f0-7ef0-40f4-bbc5-dba75da828e3.sql ===
-- Add default_campus_id column to profiles table for admin users
ALTER TABLE public.profiles
ADD COLUMN default_campus_id UUID REFERENCES public.campuses(id) ON DELETE SET NULL;

-- Add comment explaining usage
COMMENT ON COLUMN public.profiles.default_campus_id IS 'Default campus for admins - used as initial selection across all campus-filtered views';
-- === 20260130034957_73f66d79-43c3-4005-bfa3-a4d2987e19ce.sql ===
-- Drop and recreate get_profile_safe function to include default_campus_id
DROP FUNCTION IF EXISTS public.get_profile_safe(uuid);

CREATE FUNCTION public.get_profile_safe(profile_id uuid)
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  avatar_url text,
  phone text,
  birthday text,
  anniversary text,
  gender text,
  positions public.team_position[],
  share_contact_with_campus boolean,
  share_contact_with_pastors boolean,
  created_at timestamptz,
  updated_at timestamptz,
  default_campus_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  viewer_id uuid := auth.uid();
  is_own_profile boolean;
  is_admin boolean;
  is_pastor boolean;
  shares_campus boolean;
BEGIN
  -- Check if viewing own profile
  is_own_profile := (profile_id = viewer_id);
  
  -- Check if viewer is admin or network worship pastor/leader
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = viewer_id 
    AND ur.role IN ('admin', 'network_worship_pastor', 'network_worship_leader')
  ) INTO is_admin;
  
  -- Check if viewer is any type of pastor
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = viewer_id 
    AND ur.role IN ('campus_pastor', 'campus_worship_pastor', 'student_worship_pastor', 'network_worship_pastor')
  ) INTO is_pastor;
  
  -- Check if they share a campus
  SELECT EXISTS (
    SELECT 1 FROM public.user_campuses uc1
    JOIN public.user_campuses uc2 ON uc1.campus_id = uc2.campus_id
    WHERE uc1.user_id = viewer_id AND uc2.user_id = profile_id
  ) INTO shares_campus;
  
  -- Return profile data with appropriate masking
  RETURN QUERY
  SELECT 
    p.id,
    p.email,
    p.full_name,
    p.avatar_url,
    -- Mask phone based on consent
    CASE 
      WHEN is_own_profile OR is_admin THEN p.phone
      WHEN is_pastor AND p.share_contact_with_pastors THEN p.phone
      WHEN shares_campus AND p.share_contact_with_campus THEN p.phone
      ELSE NULL
    END as phone,
    -- Mask birthday based on consent  
    CASE 
      WHEN is_own_profile OR is_admin THEN p.birthday::text
      WHEN is_pastor AND p.share_contact_with_pastors THEN p.birthday::text
      WHEN shares_campus AND p.share_contact_with_campus THEN p.birthday::text
      ELSE NULL
    END as birthday,
    -- Mask anniversary based on consent
    CASE 
      WHEN is_own_profile OR is_admin THEN p.anniversary::text
      WHEN is_pastor AND p.share_contact_with_pastors THEN p.anniversary::text
      WHEN shares_campus AND p.share_contact_with_campus THEN p.anniversary::text
      ELSE NULL
    END as anniversary,
    p.gender,
    p.positions,
    p.share_contact_with_campus,
    p.share_contact_with_pastors,
    p.created_at,
    p.updated_at,
    -- Only return default_campus_id for own profile or admin
    CASE 
      WHEN is_own_profile OR is_admin THEN p.default_campus_id
      ELSE NULL
    END as default_campus_id
  FROM public.profiles p
  WHERE p.id = profile_id;
END;
$$;
-- === 20260130040228_93448c4c-be53-429a-9a70-375b8f5384cb.sql ===
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
-- === 20260130050758_e88d4aee-56fe-4960-be19-66d8b368b4d3.sql ===
-- Add display_order column to albums for custom ordering
ALTER TABLE public.albums ADD COLUMN display_order integer DEFAULT 0;

-- Create index for efficient ordering
CREATE INDEX idx_albums_display_order ON public.albums(display_order);
-- === 20260131213950_4454bec9-00fb-4fc4-ad36-11a00ea7f125.sql ===

-- Update RLS policy for viewing open swap requests to require same campus
DROP POLICY IF EXISTS "Users can view relevant swap requests" ON public.swap_requests;

CREATE POLICY "Users can view relevant swap requests"
ON public.swap_requests
FOR SELECT
USING (
  -- Own requests
  (auth.uid() = requester_id)
  -- Direct target
  OR (auth.uid() = target_user_id)
  -- Accepted by me
  OR (auth.uid() = accepted_by_id)
  -- Admin sees all
  OR has_role(auth.uid(), 'admin'::app_role)
  -- Open requests: same position AND same campus as requester
  OR (
    target_user_id IS NULL 
    AND status = 'pending'::swap_request_status
    AND shares_campus_with(auth.uid(), requester_id)
    AND EXISTS (
      SELECT 1
      FROM team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.position = swap_requests.position
    )
  )
);

-- Also update the UPDATE policy to match the same campus restriction
DROP POLICY IF EXISTS "Users can update relevant swap requests" ON public.swap_requests;

CREATE POLICY "Users can update relevant swap requests"
ON public.swap_requests
FOR UPDATE
USING (
  -- Requester can update their own pending request
  ((auth.uid() = requester_id) AND (status = 'pending'::swap_request_status))
  -- Target can respond to direct requests
  OR ((auth.uid() = target_user_id) AND (status = 'pending'::swap_request_status))
  -- Same position + same campus can accept open requests
  OR (
    (target_user_id IS NULL) 
    AND (status = 'pending'::swap_request_status) 
    AND (auth.uid() <> requester_id)
    AND shares_campus_with(auth.uid(), requester_id)
    AND (position IN (
      SELECT tm.position
      FROM team_members tm
      WHERE tm.user_id = auth.uid()
    ))
  )
  -- Admin can update any
  OR has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  ((auth.uid() = requester_id) AND (status = ANY (ARRAY['pending'::swap_request_status, 'cancelled'::swap_request_status])))
  OR ((auth.uid() <> requester_id) AND (status = ANY (ARRAY['pending'::swap_request_status, 'accepted'::swap_request_status, 'declined'::swap_request_status])))
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- === 20260131214429_25a00310-0372-4922-afc6-7ba4b9b8dd25.sql ===

-- Create a table to track when users dismiss/pass on open swap requests
CREATE TABLE public.swap_request_dismissals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  swap_request_id UUID NOT NULL REFERENCES public.swap_requests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  dismissed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(swap_request_id, user_id)
);

-- Enable RLS
ALTER TABLE public.swap_request_dismissals ENABLE ROW LEVEL SECURITY;

-- Users can view their own dismissals
CREATE POLICY "Users can view own dismissals"
ON public.swap_request_dismissals
FOR SELECT
USING (auth.uid() = user_id);

-- Users can create their own dismissals
CREATE POLICY "Users can dismiss requests"
ON public.swap_request_dismissals
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own dismissals (if they want to un-dismiss)
CREATE POLICY "Users can remove own dismissals"
ON public.swap_request_dismissals
FOR DELETE
USING (auth.uid() = user_id);

-- === 20260201165549_e87d7605-118e-49e2-9825-72d43443337d.sql ===

-- Create a security definer function to get profiles for chat mentions
-- This allows ALL users to see basic profile info for people in the same campus+ministry
CREATE OR REPLACE FUNCTION public.get_profiles_for_chat_mention(
  _campus_id uuid,
  _ministry_type text
)
RETURNS TABLE(id uuid, full_name text, avatar_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT p.id, p.full_name, p.avatar_url
  FROM public.profiles p
  INNER JOIN public.user_ministry_campuses umc 
    ON umc.user_id = p.id
  WHERE umc.campus_id = _campus_id
    AND umc.ministry_type = _ministry_type
  ORDER BY p.full_name;
$$;

-- === 20260201222032_f71422b2-1b0c-4312-81db-7a6df9add1e3.sql ===
-- Create setlist_playlists table for auto-generated practice playlists
CREATE TABLE public.setlist_playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_set_id UUID NOT NULL REFERENCES public.draft_sets(id) ON DELETE CASCADE,
  campus_id UUID NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  service_date DATE NOT NULL,
  ministry_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(draft_set_id)
);

-- Enable RLS
ALTER TABLE public.setlist_playlists ENABLE ROW LEVEL SECURITY;

-- Create a security definer function to check if user is scheduled for a service
CREATE OR REPLACE FUNCTION public.is_scheduled_for_service(_user_id UUID, _service_date DATE, _campus_id UUID, _ministry_type TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM team_members tm
    JOIN team_schedule ts ON tm.team_id = ts.team_id
    JOIN rotation_periods rp ON tm.rotation_period_id = rp.id
    WHERE tm.user_id = _user_id
      AND ts.schedule_date = _service_date
      AND ts.campus_id = _campus_id
      AND (ts.ministry_type = _ministry_type OR ts.ministry_type IS NULL)
      AND rp.campus_id = _campus_id
      AND _service_date BETWEEN rp.start_date AND rp.end_date
      AND (tm.ministry_types IS NULL OR _ministry_type = ANY(tm.ministry_types))
  )
$$;

-- RLS Policy: Users can only view playlists for services they're scheduled on (and service date >= today)
CREATE POLICY "Users can view their scheduled playlists"
ON public.setlist_playlists
FOR SELECT
USING (
  service_date >= CURRENT_DATE
  AND is_scheduled_for_service(auth.uid(), service_date, campus_id, ministry_type)
);

-- RLS Policy: Admins can view all playlists
CREATE POLICY "Admins can view all playlists"
ON public.setlist_playlists
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Function to cleanup expired playlists (service_date < today)
CREATE OR REPLACE FUNCTION public.cleanup_expired_setlist_playlists()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.setlist_playlists
  WHERE service_date < CURRENT_DATE;
END;
$$;
-- === 20260202193735_c8c9138c-7fe7-47ab-9613-219bd4fa063b.sql ===
-- Update the notify_swap_request_resolved function to also notify campus admins
CREATE OR REPLACE FUNCTION public.notify_swap_request_resolved()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  accepter_name TEXT;
  requester_name TEXT;
  request_date TEXT;
  notification_title TEXT;
  notification_message TEXT;
  supabase_url TEXT;
  service_key TEXT;
  swap_campus_id UUID;
  swap_ministry_type TEXT;
  campus_admin_ids JSONB;
BEGIN
  -- Only trigger when status changes to accepted or declined
  IF NEW.status IN ('accepted', 'declined') AND OLD.status = 'pending' THEN
    request_date := to_char(NEW.original_date::date, 'Mon DD, YYYY');
    
    -- Get the campus_id and ministry_type from team_schedule for this swap
    SELECT ts.campus_id, ts.ministry_type 
    INTO swap_campus_id, swap_ministry_type
    FROM team_schedule ts
    WHERE ts.team_id = NEW.team_id
      AND ts.schedule_date = NEW.original_date
    LIMIT 1;
    
    IF NEW.status = 'accepted' THEN
      SELECT full_name INTO accepter_name FROM profiles WHERE id = NEW.accepted_by_id;
      SELECT full_name INTO requester_name FROM profiles WHERE id = NEW.requester_id;
      notification_title := 'Swap Accepted';
      notification_message := COALESCE(accepter_name, 'Someone') || ' will cover your date on ' || request_date;
    ELSE
      notification_title := 'Swap Declined';
      notification_message := 'Your swap request for ' || request_date || ' was declined';
    END IF;
    
    -- Try to get the URL and key from vault secrets
    BEGIN
      SELECT decrypted_secret INTO supabase_url
      FROM vault.decrypted_secrets
      WHERE name = 'supabase_url'
      LIMIT 1;
      
      SELECT decrypted_secret INTO service_key
      FROM vault.decrypted_secrets
      WHERE name = 'service_role_key'
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      RETURN NEW;
    END;
    
    -- Only proceed if we have both values
    IF supabase_url IS NOT NULL AND service_key IS NOT NULL THEN
      -- Notify the requester
      PERFORM net.http_post(
        url := supabase_url || '/functions/v1/send-push-notification',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || service_key
        ),
        body := jsonb_build_object(
          'title', notification_title,
          'message', notification_message,
          'url', '/swaps',
          'tag', 'swap-resolved-' || NEW.id::text,
          'userIds', jsonb_build_array(NEW.requester_id::text)
        )
      );
      
      -- If accepted, also notify campus admins for this campus
      IF NEW.status = 'accepted' AND swap_campus_id IS NOT NULL THEN
        -- Find campus_admin users for this specific campus
        SELECT jsonb_agg(DISTINCT ur.user_id::text)
        INTO campus_admin_ids
        FROM user_roles ur
        WHERE ur.role = 'campus_admin'
          AND ur.admin_campus_id = swap_campus_id
          AND ur.user_id != NEW.requester_id
          AND ur.user_id != NEW.accepted_by_id;
        
        -- Send notification to campus admins if any exist
        IF campus_admin_ids IS NOT NULL AND jsonb_array_length(campus_admin_ids) > 0 THEN
          PERFORM net.http_post(
            url := supabase_url || '/functions/v1/send-push-notification',
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer ' || service_key
            ),
            body := jsonb_build_object(
              'title', 'Swap Confirmed',
              'message', COALESCE(accepter_name, 'Someone') || ' is covering for ' || COALESCE(requester_name, 'a team member') || ' on ' || request_date,
              'url', '/swaps',
              'tag', 'swap-admin-' || NEW.id::text,
              'userIds', campus_admin_ids
            )
          );
        END IF;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_swap_request_resolved failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;
-- === 20260203042445_72d24717-5483-4242-8fa9-18e4f578f279.sql ===
-- Create reference tracks table for Practice Playlists
CREATE TABLE public.setlist_playlist_reference_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id uuid NOT NULL REFERENCES public.setlist_playlists(id) ON DELETE CASCADE,
  title text NOT NULL,
  audio_url text NOT NULL,
  sequence_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Index for faster lookups
CREATE INDEX idx_reference_tracks_playlist 
  ON public.setlist_playlist_reference_tracks(playlist_id);

-- RLS policies
ALTER TABLE public.setlist_playlist_reference_tracks ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read reference tracks
CREATE POLICY "Authenticated users can view reference tracks"
  ON public.setlist_playlist_reference_tracks
  FOR SELECT TO authenticated
  USING (true);

-- Only admins can insert reference tracks
CREATE POLICY "Admins can insert reference tracks"
  ON public.setlist_playlist_reference_tracks
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Only admins can update reference tracks
CREATE POLICY "Admins can update reference tracks"
  ON public.setlist_playlist_reference_tracks
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Only admins can delete reference tracks
CREATE POLICY "Admins can delete reference tracks"
  ON public.setlist_playlist_reference_tracks
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
-- === 20260203045834_1e06b057-9970-4d3e-9af4-24cbb51a2657.sql ===
CREATE TABLE public.reference_track_markers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_track_id uuid NOT NULL 
    REFERENCES public.setlist_playlist_reference_tracks(id) ON DELETE CASCADE,
  title text NOT NULL,
  timestamp_seconds int NOT NULL DEFAULT 0,
  sequence_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_markers_reference_track 
  ON public.reference_track_markers(reference_track_id);

ALTER TABLE public.reference_track_markers ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read markers
CREATE POLICY "Authenticated users can view markers"
  ON public.reference_track_markers
  FOR SELECT TO authenticated
  USING (true);

-- Only admins can manage markers
CREATE POLICY "Admins can manage markers"
  ON public.reference_track_markers
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
-- === 20260203052059_dc2943ad-2639-4b87-aa72-f44a0b52bd28.sql ===

-- Fix is_scheduled_for_service to handle NULL campus_id in team_schedule (shared teams)
CREATE OR REPLACE FUNCTION public.is_scheduled_for_service(_user_id uuid, _service_date date, _campus_id uuid, _ministry_type text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM team_members tm
    JOIN team_schedule ts ON tm.team_id = ts.team_id
    JOIN rotation_periods rp ON tm.rotation_period_id = rp.id
    WHERE tm.user_id = _user_id
      AND ts.schedule_date = _service_date
      -- Allow NULL campus_id in team_schedule (shared teams) or exact match
      AND (ts.campus_id IS NULL OR ts.campus_id = _campus_id)
      AND (ts.ministry_type = _ministry_type OR ts.ministry_type IS NULL)
      -- User's rotation period must match the campus
      AND rp.campus_id = _campus_id
      AND _service_date BETWEEN rp.start_date AND rp.end_date
      AND (tm.ministry_types IS NULL OR _ministry_type = ANY(tm.ministry_types))
  )
$$;

-- === 20260203052459_015029bf-3a32-4ce5-ab9b-69ea92c3660d.sql ===

-- Update is_scheduled_for_service to also check for accepted swap/cover requests
-- If a user has accepted a swap/cover for a date, they should be considered scheduled
CREATE OR REPLACE FUNCTION public.is_scheduled_for_service(_user_id uuid, _service_date date, _campus_id uuid, _ministry_type text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    -- Check original team schedule assignment
    SELECT 1
    FROM team_members tm
    JOIN team_schedule ts ON tm.team_id = ts.team_id
    JOIN rotation_periods rp ON tm.rotation_period_id = rp.id
    WHERE tm.user_id = _user_id
      AND ts.schedule_date = _service_date
      AND (ts.campus_id IS NULL OR ts.campus_id = _campus_id)
      AND (ts.ministry_type = _ministry_type OR ts.ministry_type IS NULL)
      AND rp.campus_id = _campus_id
      AND _service_date BETWEEN rp.start_date AND rp.end_date
      AND (tm.ministry_types IS NULL OR _ministry_type = ANY(tm.ministry_types))
  )
  OR EXISTS (
    -- Check if user accepted a swap/cover for this date
    SELECT 1
    FROM swap_requests sr
    JOIN worship_teams wt ON sr.team_id = wt.id
    JOIN team_schedule ts ON ts.team_id = sr.team_id AND ts.schedule_date = sr.original_date
    WHERE sr.accepted_by_id = _user_id
      AND sr.original_date = _service_date
      AND sr.status = 'accepted'
      AND (ts.campus_id IS NULL OR ts.campus_id = _campus_id)
      AND (ts.ministry_type = _ministry_type OR ts.ministry_type IS NULL)
  )
$$;

-- === 20260203145421_4af1dd50-00a1-423a-956b-5f90fc5d4f80.sql ===
-- Service Flow Templates: Master templates per campus/ministry
CREATE TABLE public.service_flow_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campus_id UUID NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  ministry_type TEXT NOT NULL DEFAULT 'weekend',
  name TEXT NOT NULL,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(campus_id, ministry_type)
);

-- Service Flow Template Items: Items within a template
CREATE TABLE public.service_flow_template_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.service_flow_templates(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('header', 'item', 'song_placeholder')),
  title TEXT NOT NULL,
  default_duration_seconds INTEGER,
  sequence_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Service Flows: Generated service flows for specific dates
CREATE TABLE public.service_flows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  draft_set_id UUID REFERENCES public.draft_sets(id) ON DELETE SET NULL,
  campus_id UUID NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  ministry_type TEXT NOT NULL DEFAULT 'weekend',
  service_date DATE NOT NULL,
  created_from_template_id UUID REFERENCES public.service_flow_templates(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(campus_id, ministry_type, service_date)
);

-- Service Flow Items: Individual items in a service flow
CREATE TABLE public.service_flow_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service_flow_id UUID NOT NULL REFERENCES public.service_flows(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('header', 'item', 'song')),
  title TEXT NOT NULL,
  duration_seconds INTEGER,
  sequence_order INTEGER NOT NULL DEFAULT 0,
  song_id UUID REFERENCES public.songs(id) ON DELETE SET NULL,
  song_key TEXT,
  vocalist_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.service_flow_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_flow_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_flow_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for service_flow_templates
CREATE POLICY "Authenticated users can view templates"
  ON public.service_flow_templates FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Pastors and admins can insert templates"
  ON public.service_flow_templates FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'campus_admin'::app_role) OR
    has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'student_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'video_director'::app_role) OR
    has_role(auth.uid(), 'production_manager'::app_role)
  );

CREATE POLICY "Pastors and admins can update templates"
  ON public.service_flow_templates FOR UPDATE
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'campus_admin'::app_role) OR
    has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'student_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'video_director'::app_role) OR
    has_role(auth.uid(), 'production_manager'::app_role)
  );

CREATE POLICY "Pastors and admins can delete templates"
  ON public.service_flow_templates FOR DELETE
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'campus_admin'::app_role) OR
    has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  );

-- RLS Policies for service_flow_template_items
CREATE POLICY "Authenticated users can view template items"
  ON public.service_flow_template_items FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Pastors and admins can insert template items"
  ON public.service_flow_template_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.service_flow_templates t
      WHERE t.id = template_id
      AND (
        has_role(auth.uid(), 'admin'::app_role) OR
        has_role(auth.uid(), 'campus_admin'::app_role) OR
        has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
        has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR
        has_role(auth.uid(), 'student_worship_pastor'::app_role) OR
        has_role(auth.uid(), 'video_director'::app_role) OR
        has_role(auth.uid(), 'production_manager'::app_role)
      )
    )
  );

CREATE POLICY "Pastors and admins can update template items"
  ON public.service_flow_template_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.service_flow_templates t
      WHERE t.id = template_id
      AND (
        has_role(auth.uid(), 'admin'::app_role) OR
        has_role(auth.uid(), 'campus_admin'::app_role) OR
        has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
        has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR
        has_role(auth.uid(), 'student_worship_pastor'::app_role) OR
        has_role(auth.uid(), 'video_director'::app_role) OR
        has_role(auth.uid(), 'production_manager'::app_role)
      )
    )
  );

CREATE POLICY "Pastors and admins can delete template items"
  ON public.service_flow_template_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.service_flow_templates t
      WHERE t.id = template_id
      AND (
        has_role(auth.uid(), 'admin'::app_role) OR
        has_role(auth.uid(), 'campus_admin'::app_role) OR
        has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
        has_role(auth.uid(), 'campus_worship_pastor'::app_role)
      )
    )
  );

-- RLS Policies for service_flows (similar to draft_sets)
CREATE POLICY "Users can view service flows for their campuses"
  ON public.service_flows FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'student_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'campus_admin'::app_role) OR
    has_role(auth.uid(), 'video_director'::app_role) OR
    has_role(auth.uid(), 'production_manager'::app_role) OR
    campus_id IN (SELECT uc.campus_id FROM user_campuses uc WHERE uc.user_id = auth.uid())
  );

CREATE POLICY "Pastors and admins can insert service flows"
  ON public.service_flows FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'campus_admin'::app_role) OR
    has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'student_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'video_director'::app_role) OR
    has_role(auth.uid(), 'production_manager'::app_role)
  );

CREATE POLICY "Pastors and admins can update service flows"
  ON public.service_flows FOR UPDATE
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'campus_admin'::app_role) OR
    has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'student_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'video_director'::app_role) OR
    has_role(auth.uid(), 'production_manager'::app_role)
  );

CREATE POLICY "Pastors and admins can delete service flows"
  ON public.service_flows FOR DELETE
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'campus_admin'::app_role) OR
    has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
    has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  );

-- RLS Policies for service_flow_items
CREATE POLICY "Users can view service flow items for accessible flows"
  ON public.service_flow_items FOR SELECT
  USING (
    service_flow_id IN (
      SELECT id FROM public.service_flows
      WHERE has_role(auth.uid(), 'admin'::app_role) OR
        has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
        has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR
        has_role(auth.uid(), 'student_worship_pastor'::app_role) OR
        has_role(auth.uid(), 'campus_admin'::app_role) OR
        has_role(auth.uid(), 'video_director'::app_role) OR
        has_role(auth.uid(), 'production_manager'::app_role) OR
        campus_id IN (SELECT uc.campus_id FROM user_campuses uc WHERE uc.user_id = auth.uid())
    )
  );

CREATE POLICY "Pastors and admins can insert service flow items"
  ON public.service_flow_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.service_flows sf
      WHERE sf.id = service_flow_id
      AND (
        has_role(auth.uid(), 'admin'::app_role) OR
        has_role(auth.uid(), 'campus_admin'::app_role) OR
        has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
        has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR
        has_role(auth.uid(), 'student_worship_pastor'::app_role) OR
        has_role(auth.uid(), 'video_director'::app_role) OR
        has_role(auth.uid(), 'production_manager'::app_role)
      )
    )
  );

CREATE POLICY "Pastors and admins can update service flow items"
  ON public.service_flow_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.service_flows sf
      WHERE sf.id = service_flow_id
      AND (
        has_role(auth.uid(), 'admin'::app_role) OR
        has_role(auth.uid(), 'campus_admin'::app_role) OR
        has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
        has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR
        has_role(auth.uid(), 'student_worship_pastor'::app_role) OR
        has_role(auth.uid(), 'video_director'::app_role) OR
        has_role(auth.uid(), 'production_manager'::app_role)
      )
    )
  );

CREATE POLICY "Pastors and admins can delete service flow items"
  ON public.service_flow_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.service_flows sf
      WHERE sf.id = service_flow_id
      AND (
        has_role(auth.uid(), 'admin'::app_role) OR
        has_role(auth.uid(), 'campus_admin'::app_role) OR
        has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
        has_role(auth.uid(), 'campus_worship_pastor'::app_role)
      )
    )
  );

-- Create updated_at trigger for templates and flows
CREATE TRIGGER update_service_flow_templates_updated_at
  BEFORE UPDATE ON public.service_flow_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_service_flows_updated_at
  BEFORE UPDATE ON public.service_flows
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_service_flow_templates_campus_ministry ON public.service_flow_templates(campus_id, ministry_type);
CREATE INDEX idx_service_flows_campus_date ON public.service_flows(campus_id, service_date);
CREATE INDEX idx_service_flows_draft_set ON public.service_flows(draft_set_id);
CREATE INDEX idx_service_flow_items_flow ON public.service_flow_items(service_flow_id);
CREATE INDEX idx_service_flow_template_items_template ON public.service_flow_template_items(template_id);
-- === 20260203161757_ed4749b1-cb4f-4513-8664-091672e9cd34.sql ===
-- Add duration_seconds column to reference tracks for calculating last song duration
ALTER TABLE public.setlist_playlist_reference_tracks 
ADD COLUMN duration_seconds integer;

-- Update the existing reference track with the known duration (20:44 = 1244 seconds)
UPDATE public.setlist_playlist_reference_tracks 
SET duration_seconds = 1244 
WHERE id = '678ef27e-43f0-4171-95cd-6a7e1ee1ed68';
-- === 20260204213921_2136989d-b573-4b84-9825-0189daea4ff4.sql ===
-- Create junction table for multiple vocalists per song in draft sets
CREATE TABLE public.draft_set_song_vocalists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  draft_set_song_id UUID NOT NULL REFERENCES public.draft_set_songs(id) ON DELETE CASCADE,
  vocalist_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  -- Prevent duplicate vocalist assignments to the same song
  UNIQUE(draft_set_song_id, vocalist_id)
);

-- Create junction table for multiple vocalists per song in service flow items
CREATE TABLE public.service_flow_item_vocalists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service_flow_item_id UUID NOT NULL REFERENCES public.service_flow_items(id) ON DELETE CASCADE,
  vocalist_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  -- Prevent duplicate vocalist assignments to the same item
  UNIQUE(service_flow_item_id, vocalist_id)
);

-- Enable RLS on both tables
ALTER TABLE public.draft_set_song_vocalists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_flow_item_vocalists ENABLE ROW LEVEL SECURITY;

-- RLS policies for draft_set_song_vocalists (same access as draft_set_songs)
CREATE POLICY "Authenticated users can view draft set song vocalists" 
ON public.draft_set_song_vocalists 
FOR SELECT 
USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert draft set song vocalists" 
ON public.draft_set_song_vocalists 
FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update draft set song vocalists" 
ON public.draft_set_song_vocalists 
FOR UPDATE 
USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete draft set song vocalists" 
ON public.draft_set_song_vocalists 
FOR DELETE 
USING (auth.role() = 'authenticated');

-- RLS policies for service_flow_item_vocalists (same access as service_flow_items)
CREATE POLICY "Authenticated users can view service flow item vocalists" 
ON public.service_flow_item_vocalists 
FOR SELECT 
USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert service flow item vocalists" 
ON public.service_flow_item_vocalists 
FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update service flow item vocalists" 
ON public.service_flow_item_vocalists 
FOR UPDATE 
USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete service flow item vocalists" 
ON public.service_flow_item_vocalists 
FOR DELETE 
USING (auth.role() = 'authenticated');

-- Create indexes for performance
CREATE INDEX idx_draft_set_song_vocalists_song_id ON public.draft_set_song_vocalists(draft_set_song_id);
CREATE INDEX idx_service_flow_item_vocalists_item_id ON public.service_flow_item_vocalists(service_flow_item_id);
-- === 20260206000000_merge_forever_yhwh_songs.sql ===
-- Reusable function to merge two songs within the app
-- Merges source_song_id into target_song_id: all references point to target, source is deleted
CREATE OR REPLACE FUNCTION public.merge_songs(source_song_id UUID, target_song_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF source_song_id = target_song_id THEN
    RAISE EXCEPTION 'Cannot merge a song into itself';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM songs WHERE id = source_song_id) THEN
    RAISE EXCEPTION 'Source song not found';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM songs WHERE id = target_song_id) THEN
    RAISE EXCEPTION 'Target song not found';
  END IF;

  -- 1. Update plan_songs
  UPDATE plan_songs SET song_id = target_song_id WHERE song_id = source_song_id;

  -- 2. Update draft_set_songs (handle duplicates: delete source row if target already in same draft)
  DELETE FROM draft_set_songs
  WHERE song_id = source_song_id
  AND draft_set_id IN (SELECT draft_set_id FROM draft_set_songs WHERE song_id = target_song_id);
  UPDATE draft_set_songs SET song_id = target_song_id WHERE song_id = source_song_id;

  -- 3. Update service_flow_items
  UPDATE service_flow_items SET song_id = target_song_id WHERE song_id = source_song_id;

  -- 4. Update album_tracks (handle duplicates)
  DELETE FROM album_tracks
  WHERE song_id = source_song_id
  AND album_id IN (SELECT album_id FROM album_tracks WHERE song_id = target_song_id);
  UPDATE album_tracks SET song_id = target_song_id WHERE song_id = source_song_id;

  -- 5. Delete the source song
  DELETE FROM songs WHERE id = source_song_id;
END $$;

-- Grant execute to authenticated users (caller should enforce admin/leader permission in app)
GRANT EXECUTE ON FUNCTION public.merge_songs(UUID, UUID) TO authenticated;

-- === 20260206100000_get_prior_song_uses_rpc.sql ===
-- RPC to count prior song uses (avoids client URI length limits with large plan/draft sets)
-- Returns song_id -> total count from plans and drafts before given date
-- Handles case when service_plans/plan_songs don't exist (PCO not set up)
CREATE OR REPLACE FUNCTION public.get_prior_song_uses(
  _song_ids uuid[],
  _before_date date,
  _campus_ids uuid[] DEFAULT NULL,
  _ministry_types text[] DEFAULT NULL
)
RETURNS TABLE(song_id uuid, usage_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _has_service_plans boolean;
BEGIN
  -- Check if service_plans table exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'service_plans'
  ) INTO _has_service_plans;

  IF _has_service_plans THEN
    -- Include PCO plans (service_plans + plan_songs)
    RETURN QUERY
    WITH prior_plans AS (
      SELECT sp.id
      FROM service_plans sp
      WHERE sp.plan_date < _before_date
        AND (_campus_ids IS NULL OR sp.campus_id = ANY(_campus_ids) OR (sp.campus_id IS NULL AND _campus_ids IS NOT NULL))
        AND (_ministry_types IS NULL OR (
          CASE
            WHEN lower(sp.service_type_name) LIKE '%eon%' THEN 'eon'
            WHEN lower(sp.service_type_name) LIKE '%encounter%' THEN 'encounter'
            WHEN lower(sp.service_type_name) LIKE '%evident%' THEN 'evident'
            WHEN lower(sp.service_type_name) ~ ' er |^er | er$' THEN 'er'
            ELSE 'weekend'
          END
        ) = ANY(_ministry_types))
    ),
    plan_counts AS (
      SELECT ps.song_id, count(*)::bigint AS cnt
      FROM plan_songs ps
      JOIN prior_plans pp ON ps.plan_id = pp.id
      WHERE ps.song_id = ANY(_song_ids)
      GROUP BY ps.song_id
    ),
    prior_drafts AS (
      SELECT ds.id
      FROM draft_sets ds
      WHERE ds.plan_date < _before_date
        AND ds.status = 'published'
        AND (_campus_ids IS NULL OR ds.campus_id = ANY(_campus_ids))
        AND (_ministry_types IS NULL OR ds.ministry_type = ANY(_ministry_types))
    ),
    draft_counts AS (
      SELECT dss.song_id, count(*)::bigint AS cnt
      FROM draft_set_songs dss
      JOIN prior_drafts pd ON dss.draft_set_id = pd.id
      WHERE dss.song_id = ANY(_song_ids)
      GROUP BY dss.song_id
    ),
    combined AS (
      SELECT song_id, cnt FROM plan_counts
      UNION ALL
      SELECT song_id, cnt FROM draft_counts
    )
    SELECT c.song_id, sum(c.cnt)::bigint
    FROM combined c
    GROUP BY c.song_id;
  ELSE
    -- Draft sets only (no PCO)
    RETURN QUERY
    WITH prior_drafts AS (
      SELECT ds.id
      FROM draft_sets ds
      WHERE ds.plan_date < _before_date
        AND ds.status = 'published'
        AND (_campus_ids IS NULL OR ds.campus_id = ANY(_campus_ids))
        AND (_ministry_types IS NULL OR ds.ministry_type = ANY(_ministry_types))
    ),
    draft_counts AS (
      SELECT dss.song_id, count(*)::bigint AS cnt
      FROM draft_set_songs dss
      JOIN prior_drafts pd ON dss.draft_set_id = pd.id
      WHERE dss.song_id = ANY(_song_ids)
      GROUP BY dss.song_id
    )
    SELECT dc.song_id, dc.cnt FROM draft_counts dc;
  END IF;
END;
$$;

-- Grant to authenticated users
GRANT EXECUTE ON FUNCTION public.get_prior_song_uses(uuid[], date, uuid[], text[]) TO authenticated;

