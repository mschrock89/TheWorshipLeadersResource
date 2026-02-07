import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PCO_CLIENT_ID = Deno.env.get('PCO_CLIENT_ID');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { redirectUri, campusId } = await req.json();

    if (!PCO_CLIENT_ID) {
      console.error('PCO_CLIENT_ID not configured');
      throw new Error('Planning Center integration not configured');
    }

    // Store campusId in state parameter (will be passed back in callback)
    const state = btoa(JSON.stringify({ campusId, redirectUri }));

    // Planning Center OAuth scopes needed
    const scopes = [
      'services',  // Access to Services (teams, schedules)
      'people',    // Access to People (contact info, birthdays)
    ].join(' ');

    // Build the authorization URL
    const authUrl = new URL('https://api.planningcenteronline.com/oauth/authorize');
    authUrl.searchParams.set('client_id', PCO_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', `${SUPABASE_URL}/functions/v1/pco-auth-callback`);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('state', state);

    console.log('Generated PCO auth URL for campus:', campusId);

    return new Response(
      JSON.stringify({ authUrl: authUrl.toString() }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error generating auth URL:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
