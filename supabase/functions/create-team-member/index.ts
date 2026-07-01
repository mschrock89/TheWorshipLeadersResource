import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-resource-app-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
  "network_student_pastor",
  "student_pastor",
  "student_worship_pastor",
  "childrens_pastor",
  "network_worship_pastor",
  "network_worship_leader",
  "video_director",
  "production_manager",
  "leader",
];

const allowedBaseRoles = [
  "network_worship_pastor",
  "campus_worship_pastor",
  "network_student_pastor",
  "student_pastor",
  "student_worship_pastor",
  "childrens_pastor",
  "speaker",
  "video_director",
  "production_manager",
  "creative_team_lead",
  "student",
  "ms_leader",
  "ms_leader_weekend",
  "hs_leader",
  "volunteer",
];

const replaceableBaseRoles = [
  "leader",
  "member",
  "network_worship_pastor",
  "campus_worship_pastor",
  "network_student_pastor",
  "student_pastor",
  "student_worship_pastor",
  "childrens_pastor",
  "speaker",
  "video_director",
  "production_manager",
  "creative_team_lead",
  "audition_candidate",
  "student",
  "ms_leader",
  "ms_leader_weekend",
  "hs_leader",
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

    const existingUser = data.users.find(
      (existing) => (existing.email || "").trim().toLowerCase() === email,
    );
    if (existingUser) {
      return existingUser;
    }

    if (data.users.length < perPage) {
      break;
    }

    page += 1;
  }

  const { data: profile } = await adminClient
    .from("profiles")
    .select("id, email")
    .ilike("email", email)
    .maybeSingle();

  if (profile?.id) {
    const { data: userById, error: userByIdError } = await adminClient.auth.admin.getUserById(profile.id);
    if (!userByIdError && userById?.user) {
      return userById.user;
    }
  }

  return null;
}

function isDuplicateEmailError(message: string | undefined) {
  const normalized = message?.trim().toLowerCase() || "";
  return normalized.includes("already") || normalized.includes("registered");
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

    if (campusId) {
      const { data: campusRow, error: campusLookupError } = await adminClient
        .from("campuses")
        .select("id")
        .eq("id", campusId)
        .maybeSingle();

      if (campusLookupError) {
        throw new Error(campusLookupError.message);
      }

      if (!campusRow) {
        return new Response(JSON.stringify({ error: "Selected campus is no longer available" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const fullName = `${firstName} ${lastName}`;
    const temporaryPassword = "123456";
    let existingUser = await findUserByEmail(adminClient, email);
    let userId: string | undefined;
    let recoveredExistingUser = false;

    if (!existingUser) {
      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });

      if (createError || !created.user) {
        if (isDuplicateEmailError(createError?.message)) {
          existingUser = await findUserByEmail(adminClient, email);
        }

        if (!existingUser) {
          throw new Error(createError?.message || "Failed to create user");
        }
      } else {
        userId = created.user.id;
      }
    }

    if (existingUser) {
      recoveredExistingUser = true;

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
          .eq("user_id", existingUser.id),
      ]);

      if (existingRolesError) {
        throw new Error(existingRolesError.message);
      }

      const existingRoleValues = (existingRoles || []).map(({ role: existingRole }) => existingRole);
      const blockingRoles = existingRoleValues.filter(
        (existingRole) => !replaceableBaseRoles.includes(existingRole),
      );
      const replaceableRoles = existingRoleValues.filter((existingRole) =>
        replaceableBaseRoles.includes(existingRole)
      );
      const needsRecovery = !existingProfile || replaceableRoles.length === 0;

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
    }

    if (!userId) {
      throw new Error("Failed to resolve user id");
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
        recoveredExistingUser,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("create-team-member failed:", error);
    const rawMessage = error instanceof Error ? error.message : "Internal server error";
    let message = rawMessage;
    let status = 500;

    if (rawMessage.includes("profiles_default_campus_id_fkey")) {
      message = "Selected campus is no longer available";
      status = 400;
    } else if (rawMessage.includes("profiles_phone_e164_chk")) {
      message = "Phone number must be a valid number";
      status = 400;
    }

    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
