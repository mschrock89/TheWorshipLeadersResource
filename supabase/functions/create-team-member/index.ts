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

async function findUserByEmail(
  adminClient: ReturnType<typeof createClient>,
  email: string,
) {
  let page = 1;
  const perPage = 1000;

  while (page <= 100) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(error.message);
    }

    const existingUser = data.users.find((existing) => existing.email?.toLowerCase() === email);
    if (existingUser) {
      return existingUser;
    }

    if (data.users.length < perPage) {
      return null;
    }

    page += 1;
  }

  return null;
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

    const fullName = `${firstName} ${lastName}`;
    const temporaryPassword = "123456";
    const existingUser = await findUserByEmail(adminClient, email);

    let userId: string;

    if (existingUser) {
      const [
        { data: existingProfile },
        { data: existingRoles, error: existingRolesError },
      ] = await Promise.all([
        adminClient
          .from("profiles")
          .select("id")
          .eq("id", existingUser.id)
          .maybeSingle(),
        adminClient
          .from("user_roles")
          .select("role")
          .eq("user_id", existingUser.id)
          .in("role", replaceableBaseRoles),
      ]);

      if (existingRolesError) {
        throw new Error(existingRolesError.message);
      }

      const existingRoleValues = (existingRoles || []).map(({ role: existingRole }) => existingRole);
      const blockingRoles = existingRoleValues.filter((existingRole) => !replaceableBaseRoles.includes(existingRole));
      const needsRecovery = !existingProfile || existingRoleValues.length === 0;

      if (blockingRoles.length > 0) {
        const formattedRoles = blockingRoles.join(", ");
        return new Response(
          JSON.stringify({
            error: "A user with that email already exists",
            hint: `That account already has protected role access (${formattedRoles}). Update the existing user instead of creating a new member.`,
          }),
          {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      if (needsRecovery) {
        const { error: repairAuthError } = await adminClient.auth.admin.updateUserById(existingUser.id, {
          email,
          password: temporaryPassword,
          email_confirm: true,
          user_metadata: { full_name: fullName },
        });

        if (repairAuthError) {
          throw new Error(repairAuthError.message);
        }
      } else {
        const { error: refreshAuthError } = await adminClient.auth.admin.updateUserById(existingUser.id, {
          user_metadata: { full_name: fullName },
        });

        if (refreshAuthError) {
          throw new Error(refreshAuthError.message);
        }
      }

      userId = existingUser.id;
    } else {
      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });

      if (createError || !created.user) {
        throw new Error(createError?.message || "Failed to create user");
      }

      userId = created.user.id;
    }

    const { error: profileError } = await adminClient
      .from("profiles")
      .upsert({
        id: userId,
        email,
        full_name: fullName,
        phone,
        default_campus_id: campusId,
      });

    if (profileError) {
      throw new Error(profileError.message);
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
        recoveredExistingUser: Boolean(existingUser),
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
