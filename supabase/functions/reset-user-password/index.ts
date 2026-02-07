import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Helper to decode JWT payload without verification (we'll verify via RPC check)
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1];
    // Base64url decode
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = atob(base64);
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

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

    // Decode JWT to get user ID (we verify permissions via database RPC)
    const token = authHeader.replace('Bearer ', '');
    const payload = decodeJwtPayload(token);
    
    if (!payload || !payload.sub || typeof payload.sub !== 'string') {
      console.log('Invalid JWT token');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if token is expired
    const exp = payload.exp as number | undefined;
    if (exp && Date.now() >= exp * 1000) {
      console.log('Token expired');
      return new Response(
        JSON.stringify({ error: 'Token expired. Please log in again.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = payload.sub;
    console.log(`User ID from token: ${userId}`);

    // Create admin client (service role bypasses RLS)
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Verify the user exists and check admin role using service role client
    const { data: hasRole, error: roleError } = await adminClient.rpc('has_role', { 
      _user_id: userId, 
      _role: 'admin' 
    });

    if (roleError) {
      console.log('Error checking role:', roleError);
      return new Response(
        JSON.stringify({ error: 'Failed to verify permissions' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!hasRole) {
      console.log(`User ${userId} is not an admin`);
      return new Response(
        JSON.stringify({ error: 'Only admins can reset passwords' }),
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

    // Set must_change_password flag
    await adminClient
      .from('profiles')
      .update({ must_change_password: true })
      .eq('id', targetUser.id);

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
