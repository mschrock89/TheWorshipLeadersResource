import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const PCO_CLIENT_ID = Deno.env.get('PCO_CLIENT_ID');
const PCO_CLIENT_SECRET = Deno.env.get('PCO_CLIENT_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    if (error) {
      console.error('OAuth error from PCO:', error);
      return redirectWithError('Authorization was denied');
    }

    if (!code || !state) {
      console.error('Missing code or state in callback');
      return redirectWithError('Invalid callback parameters');
    }

    // Decode state to get campusId and redirectUri
    let stateData: { campusId?: string; redirectUri: string };
    try {
      stateData = JSON.parse(atob(state));
    } catch {
      console.error('Failed to decode state parameter');
      return redirectWithError('Invalid state parameter');
    }

    // Exchange code for tokens
    console.log('Exchanging code for tokens...');
    const tokenResponse = await fetch('https://api.planningcenteronline.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        client_id: PCO_CLIENT_ID,
        client_secret: PCO_CLIENT_SECRET,
        redirect_uri: `${SUPABASE_URL}/functions/v1/pco-auth-callback`,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', errorText);
      return redirectWithError('Failed to exchange authorization code');
    }

    const tokens = await tokenResponse.json();
    console.log('Token exchange successful');

    // Get organization info from PCO - use the organization endpoint
    let orgName = 'Your Organization';
    
    try {
      // First try to get organization from the /services/v2 endpoint
      const servicesResponse = await fetch('https://api.planningcenteronline.com/services/v2', {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`,
        },
      });

      if (servicesResponse.ok) {
        const servicesData = await servicesResponse.json();
        // The organization name is in the meta.parent.name
        orgName = servicesData.meta?.parent?.name || orgName;
        console.log('Got org name from services:', orgName);
      }
    } catch (orgError) {
      console.error('Error fetching org name:', orgError);
    }

    // Calculate token expiration
    const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000));

    const connectionData = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: expiresAt.toISOString(),
      pco_organization_name: orgName,
      campus_id: stateData.campusId || null,
    };

    // Encode connection data to pass back (will be stored by authenticated user)
    const connectionCode = btoa(JSON.stringify(connectionData));

    // Redirect back to the app with the connection code
    const redirectUrl = new URL(stateData.redirectUri);
    redirectUrl.searchParams.set('pco_connection', connectionCode);

    console.log('Redirecting back to app with connection data');
    return Response.redirect(redirectUrl.toString(), 302);

  } catch (error) {
    console.error('Callback error:', error);
    return redirectWithError('An unexpected error occurred');
  }
});

function redirectWithError(message: string): Response {
  // Redirect to a generic error page or the app with an error
  const errorUrl = new URL(Deno.env.get('SUPABASE_URL') || '');
  errorUrl.pathname = '/settings/planning-center';
  errorUrl.searchParams.set('error', message);
  return Response.redirect(errorUrl.toString(), 302);
}