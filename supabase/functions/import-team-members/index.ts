import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-resource-app-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface TeamMember {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  address?: string;
  positions?: string[];
  birthday?: string;
  anniversary?: string;
}

interface ImportResult {
  email: string;
  success: boolean;
  skipped?: boolean;
  error?: string;
}

// Base roles that can be assigned to a fresh bulk-imported user. The default
// `volunteer` role created by the handle_new_user trigger is replaced with the
// role selected for the upload group.
const allowedBaseRoles = [
  'network_worship_pastor',
  'campus_worship_pastor',
  'student_pastor',
  'student_worship_pastor',
  'childrens_pastor',
  'speaker',
  'video_director',
  'production_manager',
  'creative_team_lead',
  'student',
  'ms_leader',
  'ms_leader_weekend',
  'hs_leader',
  'volunteer',
];

// Roles safe to clear before assigning the selected base role. Leadership/admin
// roles are intentionally excluded so we never strip elevated access.
const replaceableBaseRoles = [
  'leader',
  'member',
  'network_worship_pastor',
  'campus_worship_pastor',
  'student_pastor',
  'student_worship_pastor',
  'childrens_pastor',
  'speaker',
  'video_director',
  'production_manager',
  'creative_team_lead',
  'audition_candidate',
  'student',
  'ms_leader',
  'ms_leader_weekend',
  'hs_leader',
  'volunteer',
];

function normalizeEmail(email: string | null | undefined): string {
  return (email || '').trim().toLowerCase();
}

// Coerce a free-form phone string into E.164 (+15551234567) so it satisfies the
// profiles_phone_e164_chk constraint. Returns null when it can't be normalized,
// in which case the phone is simply skipped rather than failing the whole row.
function normalizePhoneE164(phone: string | null | undefined): string | null {
  const trimmed = (phone || '').trim();
  if (!trimmed) return null;

  const hasPlus = trimmed.startsWith('+');
  let digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  if (!hasPlus) {
    // Assume North American numbers when no country code is provided.
    if (digits.length === 10) {
      digits = `1${digits}`;
    } else if (digits.length === 11 && digits.startsWith('1')) {
      // already includes US country code
    }
  }

  const candidate = `+${digits}`;
  return /^\+[1-9][0-9]{7,14}$/.test(candidate) ? candidate : null;
}

function normalizeName(name: string | null | undefined): string {
  return (name || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

async function loadDirectoryFingerprints(adminClient: ReturnType<typeof createClient>) {
  const emails = new Set<string>();
  const names = new Set<string>();
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await adminClient
      .from('profiles')
      .select('email, full_name')
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(error.message);
    }

    (data || []).forEach((profile) => {
      const email = normalizeEmail(profile.email);
      const name = normalizeName(profile.full_name);
      if (email) emails.add(email);
      if (name) names.add(name);
    });

    if (!data || data.length < pageSize) {
      break;
    }
  }

  return { emails, names };
}

async function loadAuthEmails(adminClient: ReturnType<typeof createClient>) {
  const emails = new Set<string>();
  const perPage = 1000;

  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(error.message);
    }

    data.users.forEach((user) => {
      const email = normalizeEmail(user.email);
      if (email) emails.add(email);
    });

    if (data.users.length < perPage) {
      break;
    }
  }

  return emails;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify the requesting user is a leader
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('No authorization header provided');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;

    // Create client with user's token to check permissions
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      console.error('Failed to get user:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const allowedRoles = [
      'admin',
      'campus_admin',
      'campus_worship_pastor',
      'student_worship_pastor',
      'childrens_pastor',
      'video_director',
      'production_manager',
      'network_worship_pastor',
      'network_worship_leader',
      'leader',
    ];

    let isAllowed = false;
    for (const role of allowedRoles) {
      const { data } = await userClient.rpc('has_role', {
        _user_id: user.id,
        _role: role,
      });

      if (data) {
        isAllowed = true;
        break;
      }
    }

    if (!isAllowed) {
      console.error('User does not have import permissions:', user.id);
      return new Response(
        JSON.stringify({ error: 'Only team managers can import team members' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const { members, role: requestedRole } = await req.json() as {
      members: TeamMember[];
      role?: string;
    };
    
    if (!members || !Array.isArray(members) || members.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No members provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // The base role applied to every user in this upload group. Falls back to
    // `volunteer` (matching the handle_new_user default) when none is provided.
    const baseRole = (requestedRole || 'volunteer').trim();
    if (!allowedBaseRoles.includes(baseRole)) {
      return new Response(
        JSON.stringify({ error: 'Invalid base role' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Importing ${members.length} team members with base role "${baseRole}"`);

    // Create admin client for user creation
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const [directoryFingerprints, authEmails] = await Promise.all([
      loadDirectoryFingerprints(adminClient),
      loadAuthEmails(adminClient),
    ]);
    const importEmails = new Set<string>();
    const importNames = new Set<string>();
    const results: ImportResult[] = [];

    for (const member of members) {
      const email = normalizeEmail(member.email);
      const firstName = member.firstName?.trim() || '';
      const lastName = member.lastName?.trim() || '';
      const fullName = [firstName, lastName].filter(Boolean).join(' ');
      const normalizedName = normalizeName(fullName);
      
      if (!email || !email.includes('@')) {
        results.push({ email: member.email || 'unknown', success: false, error: 'Invalid email' });
        continue;
      }

      if (directoryFingerprints.emails.has(email) || authEmails.has(email)) {
        console.log(`Skipping existing user by email: ${email}`);
        results.push({ email, success: false, skipped: true, error: 'Email already in directory' });
        continue;
      }

      if (normalizedName && directoryFingerprints.names.has(normalizedName)) {
        console.log(`Skipping existing user by name: ${fullName}`);
        results.push({ email, success: false, skipped: true, error: 'Name already in directory' });
        continue;
      }

      if (importEmails.has(email)) {
        console.log(`Skipping duplicate import email: ${email}`);
        results.push({ email, success: false, skipped: true, error: 'Duplicate email in import' });
        continue;
      }

      if (normalizedName && importNames.has(normalizedName)) {
        console.log(`Skipping duplicate import name: ${fullName}`);
        results.push({ email, success: false, skipped: true, error: 'Duplicate name in import' });
        continue;
      }

      importEmails.add(email);
      if (normalizedName) importNames.add(normalizedName);

      try {
        // Use default password "123456"
        const defaultPassword = "123456";

        // Create the user without sending email
        const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
          email,
          password: defaultPassword,
          email_confirm: true, // Auto-confirm email
          user_metadata: { full_name: fullName }
        });

        if (createError) {
          console.error(`Failed to create user ${email}:`, createError);
          results.push({ email, success: false, error: createError.message });
          continue;
        }

        console.log(`Created user: ${email} (${newUser.user.id})`);

        // Update profile with additional fields
        if (newUser.user) {
          const profileUpdate: Record<string, unknown> = {};
          
          const normalizedPhone = normalizePhoneE164(member.phone);
          if (normalizedPhone) {
            profileUpdate.phone = normalizedPhone;
          }

          if (member.address && member.address.trim()) {
            profileUpdate.address = member.address.trim();
          }
          
          if (member.positions && member.positions.length > 0) {
            profileUpdate.positions = member.positions;
          }
          
          if (member.birthday) {
            profileUpdate.birthday = member.birthday;
          }
          
          if (member.anniversary) {
            profileUpdate.anniversary = member.anniversary;
          }
          
          if (Object.keys(profileUpdate).length > 0) {
            const { error: profileError } = await adminClient
              .from('profiles')
              .update(profileUpdate)
              .eq('id', newUser.user.id);

            if (profileError) {
              console.warn(`Failed to update profile for ${email}:`, profileError);
            } else {
              console.log(`Updated profile for ${email} with:`, Object.keys(profileUpdate).join(', '));
            }
          }

          // Replace the trigger's default role with the selected base role.
          if (baseRole !== 'volunteer') {
            const { error: deleteRolesError } = await adminClient
              .from('user_roles')
              .delete()
              .eq('user_id', newUser.user.id)
              .in('role', replaceableBaseRoles);

            if (deleteRolesError) {
              console.warn(`Failed to clear default role for ${email}:`, deleteRolesError);
            }

            const { error: roleError } = await adminClient
              .from('user_roles')
              .insert({ user_id: newUser.user.id, role: baseRole });

            if (roleError) {
              console.warn(`Failed to assign role "${baseRole}" for ${email}:`, roleError);
            }
          }
        }

        results.push({ email, success: true });
        directoryFingerprints.emails.add(email);
        authEmails.add(email);
        if (normalizedName) directoryFingerprints.names.add(normalizedName);
      } catch (err) {
        console.error(`Error processing ${email}:`, err);
        results.push({ email, success: false, error: 'Unexpected error' });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const skippedCount = results.filter(r => r.skipped).length;
    const failCount = results.filter(r => !r.success && !r.skipped).length;

    console.log(`Import complete: ${successCount} succeeded, ${skippedCount} skipped, ${failCount} failed`);

    return new Response(
      JSON.stringify({ results, successCount, skippedCount, failCount }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Import error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
