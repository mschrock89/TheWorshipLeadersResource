import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.log('No authorization header provided');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { userId, newEmail } = await req.json();
    if (!userId || !newEmail) {
      console.log('Missing userId or newEmail in request body');
      return new Response(
        JSON.stringify({ error: 'User ID and new email are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Email update requested for user: ${userId} to: ${newEmail}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;

    // Create client with user's token to check permissions
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      console.log('Failed to get user from token:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is an admin or campus_admin
    const { data: hasAdminRole } = await userClient.rpc('has_role', { 
      _user_id: user.id, 
      _role: 'admin' 
    });

    const { data: hasCampusAdminRole } = await userClient.rpc('has_role', { 
      _user_id: user.id, 
      _role: 'campus_admin' 
    });

    if (!hasAdminRole && !hasCampusAdminRole) {
      console.log(`User ${user.email} is not an admin`);
      return new Response(
        JSON.stringify({ error: 'Only admins can update email addresses' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create admin client
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Normalize the new email
    const normalizedEmail = String(newEmail).trim().toLowerCase();

    // Check if email is already in use
    let page = 1;
    const perPage = 1000;
    let emailExists = false;

    while (true) {
      const { data: usersData, error: listError } = await adminClient.auth.admin.listUsers({
        page,
        perPage,
      });

      if (listError) {
        console.error('Failed to list users:', listError);
        break;
      }

      const existingUser = usersData.users.find(
        u => (u.email || '').trim().toLowerCase() === normalizedEmail && u.id !== userId
      );

      if (existingUser) {
        emailExists = true;
        break;
      }

      if (usersData.users.length < perPage) {
        break;
      }

      page++;
      if (page > 100) break;
    }

    if (emailExists) {
      return new Response(
        JSON.stringify({ error: 'This email address is already in use by another account' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update the auth user's email
    const { error: updateError } = await adminClient.auth.admin.updateUserById(
      userId,
      { email: normalizedEmail }
    );

    if (updateError) {
      console.error(`Failed to update email for ${userId}:`, updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update email in auth system' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update the profile email as well
    const { error: profileError } = await adminClient
      .from('profiles')
      .update({ email: normalizedEmail })
      .eq('id', userId);

    if (profileError) {
      console.error(`Failed to update profile email for ${userId}:`, profileError);
      // Auth was updated, but profile wasn't - this is a partial failure
      return new Response(
        JSON.stringify({ 
          error: 'Email updated in auth but failed to update profile', 
          partialSuccess: true 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Email update successful for ${userId} to ${normalizedEmail}`);

    return new Response(
      JSON.stringify({ success: true, email: normalizedEmail }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Update email error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});