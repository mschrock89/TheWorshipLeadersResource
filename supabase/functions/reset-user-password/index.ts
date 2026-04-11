import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('No authorization header provided');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { email } = await req.json();
    if (!email) {
      console.log('No email provided in request body');
      return new Response(
        JSON.stringify({ error: 'Email is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Password reset requested for: ${email}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      console.log('Failed to verify requesting user:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;
    console.log(`Authenticated user ID: ${userId}`);

    // Create admin client (service role bypasses RLS)
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const allowedRoles = [
      'admin',
      'campus_admin',
      'campus_worship_pastor',
      'student_worship_pastor',
      'video_director',
      'production_manager',
      'network_worship_pastor',
      'network_worship_leader',
      'leader',
    ];

    let hasRole = false;
    for (const role of allowedRoles) {
      const { data, error: roleError } = await adminClient.rpc('has_role', {
        _user_id: userId,
        _role: role,
      });

      if (roleError) {
        console.log('Error checking role:', roleError);
        return new Response(
          JSON.stringify({ error: 'Failed to verify permissions' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (data) {
        hasRole = true;
        break;
      }
    }

    if (!hasRole) {
      console.log(`User ${userId} is not allowed to reset passwords`);
      return new Response(
        JSON.stringify({ error: 'Only team managers can reset passwords' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    // Find the user by email with pagination
    const normalizedEmail = String(email).trim().toLowerCase();

    let targetUser: any = null;
    let page = 1;
    const perPage = 1000;

    while (!targetUser) {
      const { data: usersData, error: listError } = await adminClient.auth.admin.listUsers({
        page,
        perPage,
      });

      if (listError) {
        console.error('Failed to list users:', listError);
        return new Response(
          JSON.stringify({ error: 'Failed to list users' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      targetUser = usersData.users.find(u => (u.email || '').trim().toLowerCase() === normalizedEmail);

      // If we found the user or there are no more pages, break
      if (targetUser || usersData.users.length < perPage) {
        break;
      }

      page++;

      // Safety limit to prevent infinite loops
      if (page > 100) {
        console.error('Too many pages when searching for user');
        break;
      }
    }

    // Fallback: if not found by email, try to find a matching profile and then lookup auth user by profile.id
    if (!targetUser) {
      const { data: profile } = await adminClient
        .from('profiles')
        .select('id, email')
        .ilike('email', normalizedEmail)
        .maybeSingle();

      if (profile?.id) {
        const { data: userById, error: userByIdError } = await adminClient.auth.admin.getUserById(profile.id);

        if (!userByIdError && userById?.user) {
          targetUser = userById.user;
        } else {
          console.log(`Profile exists but auth user missing for: ${normalizedEmail} (profile id: ${profile.id})`);
        }
      }
    }

    if (!targetUser) {
      console.log(`User not found: ${normalizedEmail}`);
      return new Response(
        JSON.stringify({
          error: 'User not found',
          hint: 'This person has a profile but no login account yet. Send a welcome email (or have them sign up) to create the account, then reset again.',
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const defaultPassword = "123456";

    // Update password
    const { error: updateError } = await adminClient.auth.admin.updateUserById(
      targetUser.id,
      { password: defaultPassword }
    );

    if (updateError) {
      console.error(`Failed to reset password for ${email}:`, updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to reset password' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Password reset successful for ${email}`);

    return new Response(
      JSON.stringify({ success: true, email }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Reset error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
