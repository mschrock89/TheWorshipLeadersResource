import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { refreshTokenIfNeededEncrypted } from "../_shared/pco-encryption.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ACTIVE_LOOKBACK_DAYS = 365;
const ACTIVE_SCAN_TIMEOUT_MS = 20_000;

// Position mapping from PCO team names to our team_position enum
const positionMapping: Record<string, string> = {
  'vocals': 'lead_vocals',
  'vocal': 'lead_vocals',
  'singer': 'lead_vocals',
  'lead vocals': 'lead_vocals',
  'lead vocal': 'lead_vocals',
  'lead singer': 'lead_vocals',
  'worship leader': 'lead_vocals',
  'lead worshiper': 'lead_vocals',
  'harmony': 'harmony_vocals',
  'harmony vocals': 'harmony_vocals',
  'background vocals': 'background_vocals',
  'bgv': 'background_vocals',
  'acoustic guitar': 'acoustic_guitar',
  'acoustic': 'acoustic_guitar',
  'electric guitar': 'electric_guitar',
  'electric': 'electric_guitar',
  'lead guitar': 'electric_guitar',
  'bass': 'bass',
  'bass guitar': 'bass',
  'drums': 'drums',
  'drummer': 'drums',
  'keys': 'keys',
  'keyboard': 'keys',
  'keyboards': 'keys',
  'piano': 'piano',
  'violin': 'violin',
  'cello': 'cello',
  'saxophone': 'saxophone',
  'sax': 'saxophone',
  'trumpet': 'trumpet',
  'sound': 'sound_tech',
  'audio': 'sound_tech',
  'sound tech': 'sound_tech',
  'audio tech': 'sound_tech',
  'foh': 'sound_tech',
  'lights': 'lighting',
  'lighting': 'lighting',
  'light tech': 'lighting',
  'visuals': 'media',
  'media': 'media',
  'lyrics': 'media',
  'propresenter': 'media',
  'broadcast': 'broadcast',
  'livestream': 'broadcast',
  'live stream': 'broadcast',
  'live-stream': 'broadcast',
  'streaming': 'broadcast',
  'camera': 'tri_pod_camera',
  'camera 1': 'tri_pod_camera',
  'camera 2': 'tri_pod_camera',
  'camera 3': 'tri_pod_camera',
  'camera 4': 'tri_pod_camera',
  'camera 5': 'tri_pod_camera',
  'camera 6': 'tri_pod_camera',
  'tripod camera': 'tri_pod_camera',
  'tri-pod camera': 'tri_pod_camera',
  'tripod': 'tri_pod_camera',
  'handheld camera': 'hand_held_camera',
  'hand-held camera': 'hand_held_camera',
  'hand held camera': 'hand_held_camera',
  'handheld': 'hand_held_camera',
  'hand-held': 'hand_held_camera',
  'hand held': 'hand_held_camera',
  'hh camera': 'hand_held_camera',
  'tech': 'sound_tech',
  'production': 'sound_tech',
  'band': 'other_instrument',
  'audio/visual': 'sound_tech',
};

function mapPosition(pcoPosition: string): string | null {
  const normalized = pcoPosition.toLowerCase().trim();
  
  if (positionMapping[normalized]) {
    return positionMapping[normalized];
  }
  
  for (const [key, value] of Object.entries(positionMapping)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return value;
    }
  }
  
  return null;
}

// Token refresh is now handled by refreshTokenIfNeededEncrypted from shared module

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchFromPCO(accessToken: string, endpoint: string): Promise<any> {
  const url = `https://api.planningcenteronline.com${endpoint}`;

  const maxAttempts = 6;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.ok) return response.json();

    if (response.status === 429) {
      const retryAfterHeader = response.headers.get('retry-after');
      const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : NaN;
      const backoffMs = Number.isFinite(retryAfterSeconds)
        ? Math.max(250, retryAfterSeconds * 1000)
        : Math.min(10_000, 500 * Math.pow(2, attempt - 1));

      console.warn(`PCO rate limit (429). Backing off ${backoffMs}ms (attempt ${attempt}/${maxAttempts})`);
      await sleep(backoffMs);
      continue;
    }

    if (response.status >= 500 && response.status < 600) {
      const backoffMs = Math.min(10_000, 500 * Math.pow(2, attempt - 1));
      console.warn(`PCO server error ${response.status}. Backing off ${backoffMs}ms (attempt ${attempt}/${maxAttempts})`);
      await sleep(backoffMs);
      continue;
    }

    throw new Error(`PCO API error: ${response.status} ${await response.text()}`);
  }

  throw new Error('PCO API error: exhausted retries');
}

// Fetch all pages from a paginated PCO endpoint
async function fetchAllFromPCO(accessToken: string, endpoint: string): Promise<any[]> {
  const allData: any[] = [];
  let nextUrl: string | null = endpoint;

  while (nextUrl) {
    const response = await fetchFromPCO(accessToken, nextUrl);
    allData.push(...(response.data || []));
    
    nextUrl = response.links?.next 
      ? response.links.next.replace('https://api.planningcenteronline.com', '')
      : null;
    
    if (nextUrl) {
      await sleep(50); // Reduced delay
    }
  }

  return allData;
}

async function fetchAllAssignmentsWithPeople(
  accessToken: string,
  endpoint: string,
): Promise<{ assignments: any[]; includedPeople: any[] }> {
  const assignments: any[] = [];
  const includedPeopleById = new Map<string, any>();
  let nextUrl: string | null = endpoint;

  while (nextUrl) {
    const response = await fetchFromPCO(accessToken, nextUrl);
    assignments.push(...(response.data || []));

    for (const included of response.included || []) {
      if (included?.type === 'Person' && included?.id) {
        includedPeopleById.set(included.id, included);
      }
    }

    nextUrl = response.links?.next
      ? response.links.next.replace('https://api.planningcenteronline.com', '')
      : null;

    if (nextUrl) {
      await sleep(50);
    }
  }

  return {
    assignments,
    includedPeople: Array.from(includedPeopleById.values()),
  };
}

// Get person IDs who have been scheduled in recent plans (last 1 year)
async function getActivePersonIds(accessToken: string): Promise<{ ids: Set<string>; complete: boolean }> {
  const activePersonIds = new Set<string>();
  const startedAt = Date.now();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - ACTIVE_LOOKBACK_DAYS);
  const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

  console.log(`Fetching active members scheduled since ${cutoffDateStr} (${ACTIVE_LOOKBACK_DAYS} day lookback)`);

  const serviceTypes = await fetchAllFromPCO(accessToken, '/services/v2/service_types');
  console.log(`Found ${serviceTypes.length} service types`);

  // Process service types in parallel batches of 3
  const batchSize = 3;
  for (let i = 0; i < serviceTypes.length; i += batchSize) {
    if (Date.now() - startedAt > ACTIVE_SCAN_TIMEOUT_MS) {
      console.warn('Active member scan timed out before completion; falling back to full team sync');
      return { ids: activePersonIds, complete: false };
    }

    const batch = serviceTypes.slice(i, i + batchSize);
    
    await Promise.all(batch.map(async (serviceType) => {
      try {
        const plans = await fetchAllFromPCO(
          accessToken,
          `/services/v2/service_types/${serviceType.id}/plans?filter=after&after=${cutoffDateStr}&per_page=100`
        );
        
        // Process plans in parallel batches of 5
        const planBatchSize = 5;
        for (let j = 0; j < plans.length; j += planBatchSize) {
          if (Date.now() - startedAt > ACTIVE_SCAN_TIMEOUT_MS) {
            return;
          }

          const planBatch = plans.slice(j, j + planBatchSize);
          
          await Promise.all(planBatch.map(async (plan) => {
            try {
              const teamMembers = await fetchAllFromPCO(
                accessToken,
                `/services/v2/service_types/${serviceType.id}/plans/${plan.id}/team_members?per_page=100`
              );
              
              for (const tm of teamMembers) {
                const personId = tm.relationships?.person?.data?.id;
                if (personId) {
                  activePersonIds.add(personId);
                }
              }
            } catch (e) {
              console.warn(`Error fetching team members for plan ${plan.id}:`, e);
            }
          }));
        }
      } catch (e) {
        console.warn(`Error fetching plans for service type ${serviceType.id}:`, e);
      }
    }));
  }

  console.log(`Found ${activePersonIds.size} unique active person IDs`);
  return { ids: activePersonIds, complete: true };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { data: connection, error: connError } = await supabaseAdmin
      .from('pco_connections')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (connError || !connection) {
      throw new Error('No Planning Center connection found');
    }

    const accessToken = await refreshTokenIfNeededEncrypted(supabaseAdmin, connection);

    console.log('Starting team sync for user:', user.id);
    console.log('Sync active only:', connection.sync_active_only);

    const results = {
      synced: 0,
      updated: 0,
      skipped: 0,
      errors: [] as string[],
      active_filter_applied: false,
      active_filter_fallback_reason: null as string | null,
    };

    // If sync_active_only is enabled, fetch the list of recently scheduled person IDs
    let activePersonIds: Set<string> | null = null;
    if (connection.sync_active_only) {
      const activeScan = await getActivePersonIds(accessToken);
      if (activeScan.complete) {
        activePersonIds = activeScan.ids;
        results.active_filter_applied = true;
      } else {
        results.active_filter_fallback_reason = 'Timed out scanning active schedules, so full team sync was used instead.';
      }
    }

    // PRE-FETCH all existing profiles to avoid individual queries
    console.log('Pre-fetching all existing profiles...');
    const { data: existingProfiles } = await supabaseAdmin
      .from('profiles')
      .select('id, email, positions');
    
    const profilesByEmail = new Map<string, { id: string; positions: string[] | null }>();
    for (const profile of existingProfiles || []) {
      if (profile.email) {
        profilesByEmail.set(profile.email.toLowerCase(), {
          id: profile.id,
          positions: profile.positions,
        });
      }
    }
    console.log(`Cached ${profilesByEmail.size} existing profiles`);

    // Collect all members to process
    interface MemberToProcess {
      email: string;
      fullName: string;
      position: string | null;
      personId: string;
      phone?: string;
      birthday?: string;
    }
    
    const membersToProcess: MemberToProcess[] = [];
    const processedEmails = new Set<string>();

    // Fetch all teams from Services
    const teams = await fetchAllFromPCO(accessToken, '/services/v2/teams?per_page=100');
    console.log(`Found ${teams.length} teams`);

    for (const team of teams) {
      console.log(`Processing team: ${team.attributes.name}`);

      const { assignments: teamAssignments, includedPeople } = await fetchAllAssignmentsWithPeople(
        accessToken,
        `/services/v2/teams/${team.id}/person_team_position_assignments?include=person&per_page=100`
      );
      console.log(`Found ${includedPeople.length} included people`);
      console.log(`Team ${team.attributes.name} has ${teamAssignments.length} position assignments`);

      let noPersonId = 0, notActive = 0, noAttrs = 0, noEmail = 0, duplicates = 0;
      
      for (const assignment of teamAssignments) {
        const personId = assignment.relationships?.person?.data?.id;
        if (!personId) {
          noPersonId++;
          continue;
        }

        // Skip if sync_active_only is enabled and person hasn't been scheduled recently
        if (activePersonIds && !activePersonIds.has(personId)) {
          notActive++;
          results.skipped++;
          continue;
        }
        
        const person = includedPeople.find((p: any) => p.id === personId);
        const personAttrs = person?.attributes;
        
        if (!personAttrs) {
          noAttrs++;
          results.skipped++;
          continue;
        }
        
        const email = (personAttrs.primary_email_address || '').toLowerCase();
        if (!email) {
          noEmail++;
          results.skipped++;
          continue;
        }

        // Skip duplicates within this sync
        if (processedEmails.has(email)) {
          duplicates++;
          results.skipped++;
          continue;
        }
        processedEmails.add(email);

        const fullName = `${personAttrs.first_name || ''} ${personAttrs.last_name || ''}`.trim();
        const position = mapPosition(team.attributes.name);

        membersToProcess.push({
          email,
          fullName,
          position,
          personId,
        });
      }
      
      console.log(`Team ${team.attributes.name} skip reasons: noPersonId=${noPersonId}, notActive=${notActive}, noAttrs=${noAttrs}, noEmail=${noEmail}, duplicates=${duplicates}`);
    }

    console.log(`Collected ${membersToProcess.length} unique members to process`);

    // Process members - batch updates
    const profilesToUpdate: Array<{ id: string; positions: string[] }> = [];
    const usersToCreate: MemberToProcess[] = [];

    for (const member of membersToProcess) {
      const existing = profilesByEmail.get(member.email);
      
      if (existing) {
        // Check if we need to update positions
        if (connection.sync_positions && member.position) {
          const currentPositions = existing.positions || [];
          if (!currentPositions.includes(member.position)) {
            profilesToUpdate.push({
              id: existing.id,
              positions: [...currentPositions, member.position],
            });
            results.updated++;
            console.log(`Will update positions for ${member.email}`);
          } else {
            results.skipped++;
            console.log(`Skipped ${member.email} - already exists, no updates needed`);
          }
        } else {
          results.skipped++;
          console.log(`Skipped ${member.email} - already exists, no updates needed`);
        }
      } else if (connection.sync_team_members) {
        usersToCreate.push(member);
      } else {
        results.skipped++;
      }
    }

    // Batch update positions
    console.log(`Updating ${profilesToUpdate.length} profiles...`);
    for (const update of profilesToUpdate) {
      await supabaseAdmin
        .from('profiles')
        .update({ positions: update.positions })
        .eq('id', update.id);
    }

    // Create new users (can't batch this due to auth.admin.createUser)
    console.log(`Creating ${usersToCreate.length} new users...`);
    for (const member of usersToCreate) {
      try {
        const defaultPassword = "123456";

        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email: member.email,
          password: defaultPassword,
          email_confirm: true,
          user_metadata: { full_name: member.fullName },
        });

        if (createError) {
          console.error(`Failed to create user ${member.email}:`, createError);
          results.errors.push(`${member.email}: ${createError.message}`);
          continue;
        }

        const profileUpdate: any = {
          full_name: member.fullName,
        };

        if (connection.sync_positions && member.position) {
          profileUpdate.positions = [member.position];
        }

        await supabaseAdmin
          .from('profiles')
          .update(profileUpdate)
          .eq('id', newUser.user.id);

        if (connection.campus_id) {
          await supabaseAdmin
            .from('user_campuses')
            .insert({
              user_id: newUser.user.id,
              campus_id: connection.campus_id,
            });
        }

        results.synced++;
        console.log(`Created new user for ${member.email}`);
      } catch (memberError) {
        console.error('Error creating user:', memberError);
        const errorMessage = memberError instanceof Error ? memberError.message : 'Unknown error';
        results.errors.push(`${member.email}: ${errorMessage}`);
      }
    }

    await supabaseAdmin
      .from('pco_connections')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', connection.id);

    console.log('Sync complete:', results);

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Sync error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
