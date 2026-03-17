import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreateTeamMemberRequest {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  campusId?: string | null;
  role: string;
}

const allowedRequesterRoles = [
  "admin",
  "campus_admin",
  "campus_worship_pastor",
  "student_worship_pastor",
  "network_worship_pastor",
  "network_worship_leader",
  "video_director",
  "production_manager",
  "leader",
];

const allowedBaseRoles = [
  "network_worship_pastor",
  "campus_worship_pastor",
  "student_worship_pastor",
  "speaker",
  "video_director",
  "production_manager",
  "volunteer",
];

const replaceableBaseRoles = [
  "leader",
  "member",
  "network_worship_pastor",
  "campus_worship_pastor",
  "student_worship_pastor",
  "speaker",
  "video_director",
  "production_manager",
  "audition_candidate",
  "volunteer",
];

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

    let isAllowed = false;
    for (const role of allowedRequesterRoles) {
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

    const body = (await req.json()) as CreateTeamMemberRequest;
    const firstName = body.firstName?.trim();
    const lastName = body.lastName?.trim();
    const email = body.email?.trim().toLowerCase();
    const phone = body.phone?.trim() || null;
    const campusId = body.campusId || null;
    const role = body.role?.trim();

    if (!firstName || !lastName || !email || !role) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!allowedBaseRoles.includes(role)) {
      return new Response(JSON.stringify({ error: "Invalid base role" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const exists = existingUsers?.users?.some((existingUser) => existingUser.email?.toLowerCase() === email);
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

    const userId = created.user.id;

    const { error: profileError } = await adminClient
      .from("profiles")
      .update({
        full_name: fullName,
        phone,
        must_change_password: true,
        default_campus_id: campusId,
      })
      .eq("id", userId);

    if (profileError) {
      console.warn("Profile update warning:", profileError.message);
    }

    const { error: deleteRolesError } = await adminClient
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .in("role", replaceableBaseRoles);

    if (deleteRolesError) {
      throw new Error(deleteRolesError.message);
    }

    const { error: roleError } = await adminClient
      .from("user_roles")
      .insert({
        user_id: userId,
        role,
      });

    if (roleError) {
      throw new Error(roleError.message);
    }

    if (campusId) {
      const { error: campusError } = await adminClient
        .from("user_campuses")
        .upsert({ user_id: userId, campus_id: campusId }, { onConflict: "user_id,campus_id" });

      if (campusError) {
        throw new Error(campusError.message);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        userId,
        email,
        temporaryPassword,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
