import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { encryptToken } from "../_shared/pco-encryption.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const { connectionCode } = await req.json();
    if (!connectionCode) {
      throw new Error('No connection code provided');
    }

    // Decode the connection data
    let connectionData;
    try {
      connectionData = JSON.parse(atob(connectionCode));
    } catch {
      throw new Error('Invalid connection code');
    }

    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    
    // Use service role for writing encrypted data
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get current user
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // Encrypt the tokens before storing
    const accessTokenEncrypted = await encryptToken(connectionData.access_token);
    const refreshTokenEncrypted = await encryptToken(connectionData.refresh_token);

    // Check if connection already exists
    const { data: existing } = await supabaseAdmin
      .from('pco_connections')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (existing) {
      // Update existing connection with encrypted tokens
      const { error: updateError } = await supabaseAdmin
        .from('pco_connections')
        .update({
          access_token_encrypted: accessTokenEncrypted,
          refresh_token_encrypted: refreshTokenEncrypted,
          token_expires_at: connectionData.token_expires_at,
          pco_organization_name: connectionData.pco_organization_name,
          campus_id: connectionData.campus_id,
          connected_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);

      if (updateError) throw updateError;
    } else {
      // Insert new connection with encrypted tokens
      const { error: insertError } = await supabaseAdmin
        .from('pco_connections')
        .insert({
          user_id: user.id,
          access_token_encrypted: accessTokenEncrypted,
          refresh_token_encrypted: refreshTokenEncrypted,
          token_expires_at: connectionData.token_expires_at,
          pco_organization_name: connectionData.pco_organization_name,
          campus_id: connectionData.campus_id,
        });

      if (insertError) throw insertError;
    }

    console.log('Saved PCO connection with encrypted tokens for user:', user.id);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Save connection error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
