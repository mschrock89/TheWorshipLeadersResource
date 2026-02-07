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
    // Verify the requesting user is a leader
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
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
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is an admin
    const { data: hasRole } = await userClient.rpc('has_role', { 
      _user_id: user.id, 
      _role: 'admin' 
    });

    if (!hasRole) {
      return new Response(
        JSON.stringify({ error: 'Only admins can reset passwords' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create admin client
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Get all users
    const { data: usersData, error: listError } = await adminClient.auth.admin.listUsers();
    
    if (listError) {
      console.error('Failed to list users:', listError);
      return new Response(
        JSON.stringify({ error: 'Failed to list users' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const defaultPassword = "123456";
    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;
    const results: { email: string; success: boolean; skipped?: boolean; error?: string }[] = [];

    for (const authUser of usersData.users) {
      try {
        // Skip users who have already logged in
        if (authUser.last_sign_in_at) {
          console.log(`Skipping ${authUser.email} - has logged in before at ${authUser.last_sign_in_at}`);
          results.push({ email: authUser.email || 'unknown', success: true, skipped: true });
          skippedCount++;
          continue;
        }

        console.log(`Resetting password for ${authUser.email} - never logged in`);

        // Update password for users who have never logged in
        const { error: updateError } = await adminClient.auth.admin.updateUserById(
          authUser.id,
          { password: defaultPassword }
        );

        if (updateError) {
          console.error(`Failed to reset password for ${authUser.email}:`, updateError);
          results.push({ email: authUser.email || 'unknown', success: false, error: updateError.message });
          failCount++;
          continue;
        }

        // Set must_change_password flag
        await adminClient
          .from('profiles')
          .update({ must_change_password: true })
          .eq('id', authUser.id);

        results.push({ email: authUser.email || 'unknown', success: true });
        successCount++;
      } catch (err) {
        console.error(`Error processing ${authUser.email}:`, err);
        results.push({ email: authUser.email || 'unknown', success: false, error: 'Unexpected error' });
        failCount++;
      }
    }

    console.log(`Password reset complete: ${successCount} reset, ${skippedCount} skipped (already logged in), ${failCount} failed`);

    return new Response(
      JSON.stringify({ results, successCount, skippedCount, failCount }),
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
