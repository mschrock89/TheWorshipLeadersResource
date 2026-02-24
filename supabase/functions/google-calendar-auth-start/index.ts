import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  const origin = req.headers.get("origin") ?? "*"

  const corsHeaders = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  }

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const userId = body?.userId

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Missing userId in request body" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      )
    }

    const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")

    if (!GOOGLE_CLIENT_ID) {
      return new Response(
        JSON.stringify({ error: "Missing GOOGLE_CLIENT_ID" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      )
    }

    const redirectUri =
      "https://fgemlokxbugfihaxbfyp.functions.supabase.co/google-auth-callback"

    const url =
      `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent("https://www.googleapis.com/auth/calendar.events")}` +
      `&state=${encodeURIComponent(userId)}` +
      `&access_type=offline` +
      `&prompt=consent`

    return new Response(
      JSON.stringify({ url }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    )
  }
})
