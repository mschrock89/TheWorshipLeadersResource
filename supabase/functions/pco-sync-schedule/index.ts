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

// Position mapping from PCO team names to our position slots
const audioPositionMapping: Record<string, { position: string; slot: string }> = {
  'foh': { position: 'sound_tech', slot: 'foh' },
  'front of house': { position: 'sound_tech', slot: 'foh' },
  'sound': { position: 'sound_tech', slot: 'foh' },
  'audio': { position: 'sound_tech', slot: 'foh' },
  'audio shadow': { position: 'audio_shadow', slot: 'audio_shadow' },
  'shadow': { position: 'audio_shadow', slot: 'audio_shadow' },
  'lights': { position: 'lighting', slot: 'lighting' },
  'lighting': { position: 'lighting', slot: 'lighting' },
  'propresenter': { position: 'media', slot: 'propresenter' },
  'lyrics': { position: 'media', slot: 'propresenter' },
  'media': { position: 'media', slot: 'propresenter' },
};

const videoPositionMapping: Record<string, { position: string; slot: string }> = {
  'camera 1': { position: 'camera_1', slot: 'camera_1' },
  'camera 2': { position: 'camera_2', slot: 'camera_2' },
  'camera 3': { position: 'camera_3', slot: 'camera_3' },
  'camera 4': { position: 'camera_4', slot: 'camera_4' },
  'camera': { position: 'camera_1', slot: 'camera_1' },
  'cam 1': { position: 'camera_1', slot: 'camera_1' },
  'cam 2': { position: 'camera_2', slot: 'camera_2' },
  'cam 3': { position: 'camera_3', slot: 'camera_3' },
  'cam 4': { position: 'camera_4', slot: 'camera_4' },
  'director': { position: 'director', slot: 'director' },
  'td': { position: 'director', slot: 'director' },
  'technical director': { position: 'director', slot: 'director' },
  'producer': { position: 'producer', slot: 'producer' },
  'switcher': { position: 'switcher', slot: 'switcher' },
  'graphics': { position: 'graphics', slot: 'graphics' },
  'gfx': { position: 'graphics', slot: 'graphics' },
  'chat': { position: 'chat_host', slot: 'chat_host' },
  'chat host': { position: 'chat_host', slot: 'chat_host' },
  'host': { position: 'chat_host', slot: 'chat_host' },
  'livestream': { position: 'producer', slot: 'producer' },
  'streaming': { position: 'producer', slot: 'producer' },
};

function mapToAudioPosition(pcoPosition: string): { position: string; slot: string } | null {
  const normalized = pcoPosition.toLowerCase().trim();
  
  if (audioPositionMapping[normalized]) {
    return audioPositionMapping[normalized];
  }
  
  for (const [key, value] of Object.entries(audioPositionMapping)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return value;
    }
  }
  
  return null;
}

function mapToVideoPosition(pcoPosition: string): { position: string; slot: string } | null {
  const normalized = pcoPosition.toLowerCase().trim();
  
  if (videoPositionMapping[normalized]) {
    return videoPositionMapping[normalized];
  }
  
  for (const [key, value] of Object.entries(videoPositionMapping)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return value;
    }
  }
  
  return null;
}

// Token refresh is now handled by refreshTokenIfNeededEncrypted from shared module

async function fetchFromPCO(accessToken: string, endpoint: string): Promise<any> {
  const url = `https://api.planningcenteronline.com${endpoint}`;
  
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`PCO API error: ${response.status} ${await response.text()}`);
  }

  return response.json();
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

    // Parse request body
    let targetDate: string | undefined;
    let teamType: 'audio' | 'video' | 'both' = 'both';
    let targetTeamId: string | undefined;
    
    try {
      const body = await req.json();
      targetDate = body?.date; // Expected format: YYYY-MM-DD
      teamType = body?.team_type || 'both';
      targetTeamId = body?.team_id;
    } catch {
      // No body
    }

    if (!targetDate) {
      throw new Error('Date is required (format: YYYY-MM-DD)');
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
      .maybeSingle();

    if (connError || !connection) {
      throw new Error('No Planning Center connection found');
    }

    const accessToken = await refreshTokenIfNeededEncrypted(supabaseAdmin, connection);

    console.log(`Syncing schedule for date: ${targetDate}, team type: ${teamType}, target team: ${targetTeamId || 'auto-detect'}`);

    // If no targetTeamId provided, look up the scheduled team for this date
    if (!targetTeamId) {
      const { data: scheduleEntry } = await supabaseAdmin
        .from('team_schedule')
        .select('team_id')
        .eq('schedule_date', targetDate)
        .maybeSingle();
      
      if (scheduleEntry?.team_id) {
        targetTeamId = scheduleEntry.team_id;
        console.log(`Auto-detected team from schedule: ${targetTeamId}`);
      }
    }

    const results = {
      audio_synced: 0,
      video_synced: 0,
      audio_updated: 0,
      video_updated: 0,
      members_found: [] as { name: string; position: string; team: string; email?: string }[],
      errors: [] as string[],
    };

    // Fetch service types
    const serviceTypesData = await fetchFromPCO(accessToken, '/services/v2/service_types');
    const serviceTypes = serviceTypesData.data || [];
    console.log(`Found ${serviceTypes.length} service types`);

    // Calculate date range (day before and day after to catch edge cases)
    const targetDateObj = new Date(targetDate);
    const dayBefore = new Date(targetDateObj);
    dayBefore.setDate(dayBefore.getDate() - 1);
    const dayAfter = new Date(targetDateObj);
    dayAfter.setDate(dayAfter.getDate() + 1);
    
    const afterDate = dayBefore.toISOString().split('T')[0];
    const beforeDate = dayAfter.toISOString().split('T')[0];

    // Find plans for the target date
    for (const serviceType of serviceTypes) {
      const serviceTypeName = serviceType.attributes?.name || '';
      console.log(`Checking service type: ${serviceTypeName}`);

      // Fetch plans using a date range
      const plansEndpoint = `/services/v2/service_types/${serviceType.id}/plans?filter=after,before&after=${afterDate}&before=${beforeDate}`;
      const plansData = await fetchFromPCO(accessToken, plansEndpoint);
      const plans = plansData.data || [];
      
      if (plans.length > 0) {
        console.log(`Found ${plans.length} plans in ${serviceTypeName} for date range ${afterDate} to ${beforeDate}`);
      }

      for (const plan of plans) {
        const planDate = plan.attributes?.sort_date?.split('T')[0];
        console.log(`Plan date: ${planDate}, target: ${targetDate}`);
        if (planDate !== targetDate) continue;

        console.log(`MATCH! Found plan: ${plan.attributes?.title} on ${planDate} (Plan ID: ${plan.id})`);

        // Fetch team members for this plan - include team to get team names
        const teamMembersEndpoint = `/services/v2/service_types/${serviceType.id}/plans/${plan.id}/team_members?include=person,team,team_position&per_page=100`;
        console.log(`Fetching team members from: ${teamMembersEndpoint}`);
        const teamMembersData = await fetchFromPCO(accessToken, teamMembersEndpoint);
        const teamMembers = teamMembersData.data || [];
        const included = teamMembersData.included || [];
        
        console.log(`Found ${teamMembers.length} team member assignments, ${included.length} included items`);

        // Build lookup maps
        const persons = new Map<string, any>();
        const teamPositions = new Map<string, any>();
        const teams = new Map<string, any>();
        
        for (const item of included) {
          if (item.type === 'Person') {
            persons.set(item.id, item.attributes);
          } else if (item.type === 'TeamPosition') {
            teamPositions.set(item.id, item.attributes);
          } else if (item.type === 'Team') {
            teams.set(item.id, item.attributes);
          }
        }
        
        console.log(`Built maps: ${persons.size} persons, ${teams.size} teams, ${teamPositions.size} positions`);

        // Log all unique team names found in this plan
        const uniqueTeamNames = new Set<string>();
        for (const tm of teamMembers) {
          const teamId = tm.relationships?.team?.data?.id;
          const team = teams.get(teamId);
          const teamName = team?.name || '';
          if (teamName) uniqueTeamNames.add(teamName);
        }
        if (uniqueTeamNames.size > 0) {
          console.log(`Teams in plan: ${Array.from(uniqueTeamNames).join(', ')}`);
        } else {
          console.log(`No team names found`);
        }

        for (const tm of teamMembers) {
          const personId = tm.relationships?.person?.data?.id;
          const teamId = tm.relationships?.team?.data?.id;
          const positionName = tm.attributes?.team_position_name || '';
          
          const person = persons.get(personId);
          const team = teams.get(teamId);
          const teamName = team?.name || '';
          
          if (!person) continue;

          const fullName = person.first_name && person.last_name 
            ? `${person.first_name} ${person.last_name}`.trim()
            : tm.attributes?.name || 'Unknown';
          const email = (person.primary_email_address || '').toLowerCase();

          // Check if this is an Audio or Video team
          const teamNameLower = teamName.toLowerCase();
          const isAudioTeam = teamNameLower.includes('audio') || 
                             teamNameLower.includes('production') ||
                             teamNameLower.includes('tech') ||
                             teamNameLower.includes('sound') ||
                             teamNameLower.includes('foh') ||
                             teamNameLower.includes('a/v') ||
                             teamNameLower.includes('av ');
          const isVideoTeam = teamNameLower.includes('livestream') || 
                             teamNameLower.includes('broadcast') ||
                             teamNameLower.includes('video') ||
                             teamNameLower.includes('stream') ||
                             teamNameLower.includes('camera');

          let mappedPosition: { position: string; slot: string } | null = null;
          let memberTeamType: 'Audio' | 'Video' | null = null;

          if ((teamType === 'audio' || teamType === 'both') && isAudioTeam) {
            mappedPosition = mapToAudioPosition(positionName);
            if (mappedPosition) {
              memberTeamType = 'Audio';
              results.members_found.push({
                name: fullName,
                position: positionName,
                team: 'Audio',
                email: email || undefined,
              });
            }
          }

          if ((teamType === 'video' || teamType === 'both') && isVideoTeam) {
            mappedPosition = mapToVideoPosition(positionName);
            if (mappedPosition) {
              memberTeamType = 'Video';
              results.members_found.push({
                name: fullName,
                position: positionName,
                team: 'Video',
                email: email || undefined,
              });
            }
          }

          // If we have a mapped position and a target team, create/update the assignment
          if (mappedPosition && targetTeamId) {
            // Find the user by email if available
            let userId: string | null = null;
            if (email) {
              const { data: profile } = await supabaseAdmin
                .from('profiles')
                .select('id')
                .eq('email', email)
                .maybeSingle();
              userId = profile?.id || null;
            }

            // Check if assignment already exists (by position_slot or by user_id)
            let existingMember: any = null;
            
            if (userId) {
              const { data: byUser } = await supabaseAdmin
                .from('team_members')
                .select('id')
                .eq('team_id', targetTeamId)
                .eq('user_id', userId)
                .eq('position', mappedPosition.position)
                .maybeSingle();
              existingMember = byUser;
            }
            
            if (!existingMember) {
              // Also check by name and position
              const { data: byName } = await supabaseAdmin
                .from('team_members')
                .select('id')
                .eq('team_id', targetTeamId)
                .eq('member_name', fullName)
                .eq('position', mappedPosition.position)
                .maybeSingle();
              existingMember = byName;
            }

            if (!existingMember) {
              // Create the team member assignment
              const { error: insertError } = await supabaseAdmin
                .from('team_members')
                .insert({
                  team_id: targetTeamId,
                  user_id: userId,
                  member_name: fullName,
                  position: mappedPosition.position,
                  position_slot: mappedPosition.slot,
                });

              if (insertError) {
                results.errors.push(`Failed to assign ${fullName}: ${insertError.message}`);
              } else {
                console.log(`Created assignment: ${fullName} as ${mappedPosition.position} (${memberTeamType})`);
                if (memberTeamType === 'Audio') results.audio_synced++;
                if (memberTeamType === 'Video') results.video_synced++;
              }
            } else {
              // Update existing if user_id was found and not set
              if (userId) {
                const { error: updateError } = await supabaseAdmin
                  .from('team_members')
                  .update({ user_id: userId, position_slot: mappedPosition.slot })
                  .eq('id', existingMember.id);
                
                if (!updateError) {
                  console.log(`Updated assignment: ${fullName} linked to user`);
                  if (memberTeamType === 'Audio') results.audio_updated++;
                  if (memberTeamType === 'Video') results.video_updated++;
                }
              }
            }
          }
        }
      }
    }

    console.log('Schedule sync complete:', results);

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Schedule sync error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
