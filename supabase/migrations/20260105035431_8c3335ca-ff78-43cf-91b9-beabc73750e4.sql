-- Add user_id column to team_members table to link members to user accounts
ALTER TABLE team_members 
ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX idx_team_members_user_id ON team_members(user_id);