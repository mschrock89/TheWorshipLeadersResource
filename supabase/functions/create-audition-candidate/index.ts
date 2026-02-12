import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreateCandidateRequest {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  campusId?: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const allowedRoles = [
      "admin",
      "campus_admin",
      "campus_worship_pastor",
      "student_worship_pastor",
      "network_worship_pastor",
      "network_worship_leader",
      "leader",
    ];
    let isAllowed = false;
    for (const role of allowedRoles) {
      const { data } = await userClient.rpc("has_role", { _user_id: user.id, _role: role });
      if (data) {
        isAllowed = true;
        break;
      }
    }

    if (!isAllowed) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as CreateCandidateRequest;
    const firstName = body.firstName?.trim();
    const lastName = body.lastName?.trim();
    const email = body.email?.trim().toLowerCase();
    const phone = body.phone?.trim() || null;
    const campusId = body.campusId || null;

    if (!firstName || !lastName || !email) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const exists = existingUsers?.users?.some((u) => u.email?.toLowerCase() === email);
    if (exists) {
      return new Response(JSON.stringify({ error: "A user with that email already exists" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fullName = `${firstName} ${lastName}`;
    const temporaryPassword = "123456";

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (createError || !created.user) {
      throw new Error(createError?.message || "Failed to create user");
    }

    const candidateId = created.user.id;

    const { error: profileError } = await adminClient
      .from("profiles")
      .update({
        full_name: fullName,
        phone,
        must_change_password: true,
      })
      .eq("id", candidateId);

    if (profileError) {
      console.warn("Profile update warning:", profileError.message);
    }

    const { data: existingRole } = await adminClient
      .from("user_roles")
      .select("id")
      .eq("user_id", candidateId)
      .eq("role", "audition_candidate")
      .maybeSingle();

    if (!existingRole) {
      const { error: roleError } = await adminClient.from("user_roles").insert({
        user_id: candidateId,
        role: "audition_candidate",
      });
      if (roleError) {
        throw new Error(roleError.message);
      }
    }

    if (campusId) {
      const { error: campusError } = await adminClient
        .from("user_campuses")
        .upsert({ user_id: candidateId, campus_id: campusId }, { onConflict: "user_id,campus_id" });
      if (campusError) {
        console.warn("Campus assignment warning:", campusError.message);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        userId: candidateId,
        email,
        temporaryPassword,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
