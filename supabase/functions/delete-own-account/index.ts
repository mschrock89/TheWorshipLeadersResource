import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-resource-app-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: callingUser }, error: authError } = await userClient.auth.getUser();
    if (authError || !callingUser) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const userId = callingUser.id;

    console.log(`User ${callingUser.email} requested account deletion`);

    try {
      const { data: files } = await adminClient.storage.from("avatars").list(userId);
      if (files && files.length > 0) {
        await adminClient.storage
          .from("avatars")
          .remove(files.map((file) => `${userId}/${file.name}`));
      }
    } catch (storageError) {
      console.error("Avatar cleanup failed:", storageError);
    }

    try {
      await adminClient.from("push_subscriptions").delete().eq("user_id", userId);
    } catch (pushError) {
      console.error("Push subscription cleanup failed:", pushError);
    }

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);

    if (deleteError) {
      console.error("Delete error:", deleteError);

      if (deleteError.message?.includes("User not found")) {
        const { error: profileDeleteError } = await adminClient
          .from("profiles")
          .delete()
          .eq("id", userId);

        if (profileDeleteError) {
          return new Response(
            JSON.stringify({ error: "Failed to delete account" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      } else {
        return new Response(
          JSON.stringify({
            error: `Failed to delete account: ${deleteError.message || "Unknown error"}`,
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    console.log(`Successfully deleted account ${callingUser.email}`);

    return new Response(
      JSON.stringify({ success: true, message: "Account deleted" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    console.error("Unexpected error:", error);
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
