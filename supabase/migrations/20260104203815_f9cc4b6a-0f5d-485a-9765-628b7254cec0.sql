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