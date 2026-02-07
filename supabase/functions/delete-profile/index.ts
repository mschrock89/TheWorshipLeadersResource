import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Get the authorization header from the request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create a client with the user's token to verify they're authenticated
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user: callingUser }, error: authError } = await userClient.auth.getUser();
    if (authError || !callingUser) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is admin using the has_role function
    const { data: isAdmin, error: roleError } = await userClient.rpc('has_role', {
      _user_id: callingUser.id,
      _role: 'admin'
    });

    if (roleError || !isAdmin) {
      console.error('Role check error:', roleError, 'isAdmin:', isAdmin);
      return new Response(
        JSON.stringify({ error: 'Only admins can delete profiles' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the profile ID to delete
    const { profileId } = await req.json();
    if (!profileId) {
      return new Response(
        JSON.stringify({ error: 'Profile ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Prevent deleting yourself
    if (profileId === callingUser.id) {
      return new Response(
        JSON.stringify({ error: 'You cannot delete your own profile' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create admin client for deletion
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Get the profile email for logging
    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('email, full_name')
      .eq('id', profileId)
      .single();

    if (profileError || !profile) {
      console.error('Profile not found:', profileError);
      return new Response(
        JSON.stringify({ error: 'Profile not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Admin ${callingUser.email} is deleting profile: ${profile.full_name} (${profile.email})`);

    // Delete the auth user (this will cascade to profiles due to ON DELETE CASCADE)
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(profileId);

    if (deleteError) {
      console.error('Delete error:', deleteError);
      
      // If auth user doesn't exist, just delete the profile directly
      if (deleteError.message?.includes('User not found')) {
        const { error: profileDeleteError } = await adminClient
          .from('profiles')
          .delete()
          .eq('id', profileId);
        
        if (profileDeleteError) {
          console.error('Profile delete error:', profileDeleteError);
          return new Response(
            JSON.stringify({ error: 'Failed to delete profile' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        console.log('Profile deleted (no auth user existed)');
      } else {
        return new Response(
          JSON.stringify({ error: 'Failed to delete user' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log(`Successfully deleted user: ${profile.full_name} (${profile.email})`);

    return new Response(
      JSON.stringify({ success: true, message: `Deleted ${profile.full_name || profile.email}` }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
