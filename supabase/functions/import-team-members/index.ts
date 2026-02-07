import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TeamMember {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  positions?: string[];
  birthday?: string;
  anniversary?: string;
}

interface ImportResult {
  email: string;
  success: boolean;
  error?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify the requesting user is a leader
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('No authorization header provided');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;

    // Create client with user's token to check permissions
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      console.error('Failed to get user:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is a leader or admin
    const { data: isLeader } = await userClient.rpc('has_role', { 
      _user_id: user.id, 
      _role: 'leader' 
    });

    const { data: isAdmin } = await userClient.rpc('has_role', { 
      _user_id: user.id, 
      _role: 'admin' 
    });

    if (!isLeader && !isAdmin) {
      console.error('User is not a leader or admin:', user.id);
      return new Response(
        JSON.stringify({ error: 'Only leaders and admins can import team members' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const { members } = await req.json() as { members: TeamMember[] };
    
    if (!members || !Array.isArray(members) || members.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No members provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Importing ${members.length} team members`);

    // Create admin client for user creation
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const results: ImportResult[] = [];

    for (const member of members) {
      const email = member.email?.trim().toLowerCase();
      const firstName = member.firstName?.trim() || '';
      const lastName = member.lastName?.trim() || '';
      const fullName = [firstName, lastName].filter(Boolean).join(' ');
      
      if (!email) {
        results.push({ email: member.email || 'unknown', success: false, error: 'Invalid email' });
        continue;
      }

      try {
        // Check if user already exists
        const { data: existingUsers } = await adminClient.auth.admin.listUsers();
        const existingUser = existingUsers?.users?.find(u => u.email?.toLowerCase() === email);

        if (existingUser) {
          console.log(`User already exists: ${email}`);
          results.push({ email, success: false, error: 'User already exists' });
          continue;
        }

        // Use default password "123456" - user will be required to change it on first login
        const defaultPassword = "123456";

        // Create the user without sending email
        const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
          email,
          password: defaultPassword,
          email_confirm: true, // Auto-confirm email
          user_metadata: { full_name: fullName }
        });

        if (createError) {
          console.error(`Failed to create user ${email}:`, createError);
          results.push({ email, success: false, error: createError.message });
          continue;
        }

        console.log(`Created user: ${email} (${newUser.user.id})`);

        // Update profile with additional fields and mark for password change
        if (newUser.user) {
          const profileUpdate: Record<string, unknown> = {
            must_change_password: true, // Require password change on first login
          };
          
          if (member.phone) {
            profileUpdate.phone = member.phone.trim();
          }
          
          if (member.positions && member.positions.length > 0) {
            profileUpdate.positions = member.positions;
          }
          
          if (member.birthday) {
            profileUpdate.birthday = member.birthday;
          }
          
          if (member.anniversary) {
            profileUpdate.anniversary = member.anniversary;
          }
          
          const { error: profileError } = await adminClient
            .from('profiles')
            .update(profileUpdate)
            .eq('id', newUser.user.id);

          if (profileError) {
            console.warn(`Failed to update profile for ${email}:`, profileError);
          } else {
            console.log(`Updated profile for ${email} with:`, Object.keys(profileUpdate).join(', '));
          }
        }

        results.push({ email, success: true });
      } catch (err) {
        console.error(`Error processing ${email}:`, err);
        results.push({ email, success: false, error: 'Unexpected error' });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    console.log(`Import complete: ${successCount} succeeded, ${failCount} failed`);

    return new Response(
      JSON.stringify({ results, successCount, failCount }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Import error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
