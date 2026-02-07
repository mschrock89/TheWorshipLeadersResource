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

// Timeout safety margin (stop processing 5 seconds before the 60-second limit)
const TIMEOUT_MARGIN_MS = 55000;

// Token refresh is now handled by refreshTokenIfNeededEncrypted from shared module

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchFromPCO(accessToken: string, endpoint: string): Promise<any> {
  const url = `https://api.planningcenteronline.com${endpoint}`;

  // Basic retry/backoff for PCO rate limits (429) and transient errors
  const maxAttempts = 6;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.ok) return response.json();

    // Rate limit handling
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

    // Transient server errors
    if (response.status >= 500 && response.status < 600) {
      const backoffMs = Math.min(10_000, 500 * Math.pow(2, attempt - 1));
      console.warn(`PCO server error ${response.status}. Backing off ${backoffMs}ms (attempt ${attempt}/${maxAttempts})`);
      await sleep(backoffMs);
      continue;
    }

    // Non-retryable
    throw new Error(`PCO API error: ${response.status} ${await response.text()}`);
  }

  throw new Error('PCO API error: exhausted retries');
}

// Fetch all pages for a given endpoint
async function fetchAllPages(accessToken: string, baseEndpoint: string, maxPages = 50): Promise<any[]> {
  const allData: any[] = [];
  let nextUrl: string | null = `https://api.planningcenteronline.com${baseEndpoint}`;
  let pageCount = 0;

  while (nextUrl && pageCount < maxPages) {
    const endpoint = nextUrl.replace('https://api.planningcenteronline.com', '');

    let data: { data?: any[]; links?: { next?: string } };
    try {
      data = await fetchFromPCO(accessToken, endpoint);
    } catch (e) {
      console.error(`Failed to fetch page ${pageCount + 1}:`, e);
      break;
    }

    allData.push(...(data.data || []));

    nextUrl = data.links?.next || null;
    pageCount++;

    if (pageCount % 10 === 0) {
      console.log(`Fetched ${pageCount} pages, ${allData.length} items so far...`);
    }

    // Small pacing between pages
    if (nextUrl) await sleep(120);
  }

  return allData;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Parse request body for options
    let forceFullSync = false;
    let syncStartYear: number | undefined;
    let syncEndYear: number | undefined;
    let resumeFromProgress = false;
    try {
      const body = await req.json();
      forceFullSync = body?.force_full_sync === true;
      syncStartYear = body?.sync_start_year as number | undefined;
      syncEndYear = body?.sync_end_year as number | undefined;
      resumeFromProgress = body?.resume === true;
    } catch {
      // No body or invalid JSON, use defaults
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

    // Check for existing progress to resume (for historical syncs)
    let progressRecord: any = null;
    let resumeServiceTypeIndex = 0;
    let resumePlanIndex = 0;
    
    if (syncStartYear && syncEndYear) {
      // First check for in_progress records
      const { data: inProgressRecord } = await supabaseAdmin
        .from('sync_progress')
        .select('*')
        .eq('user_id', user.id)
        .eq('start_year', syncStartYear)
        .eq('end_year', syncEndYear)
        .eq('status', 'in_progress')
        .maybeSingle();
      
      // If no in_progress, check for any existing record (might be completed)
      const { data: anyExistingRecord } = !inProgressRecord ? await supabaseAdmin
        .from('sync_progress')
        .select('*')
        .eq('user_id', user.id)
        .eq('start_year', syncStartYear)
        .eq('end_year', syncEndYear)
        .maybeSingle() : { data: null };
      
      const existingProgress = inProgressRecord || anyExistingRecord;
      
      if (existingProgress && existingProgress.status === 'in_progress' && resumeFromProgress) {
        // Resume from where we left off
        progressRecord = existingProgress;
        resumeServiceTypeIndex = existingProgress.current_service_type_index || 0;
        resumePlanIndex = existingProgress.current_plan_index || 0;
        console.log(`Resuming sync from service type ${resumeServiceTypeIndex}, plan ${resumePlanIndex}`);
      } else if (existingProgress) {
        // Start fresh - reset existing progress (works for both in_progress without resume flag, or completed records)
        await supabaseAdmin
          .from('sync_progress')
          .update({ 
            status: 'in_progress',
            current_service_type_index: 0,
            current_plan_index: 0,
            total_plans_processed: 0,
            total_songs_processed: 0,
            error_message: null,
            started_at: new Date().toISOString(),
            completed_at: null,
          })
          .eq('id', existingProgress.id);
        progressRecord = existingProgress;
        console.log(`Starting fresh sync for ${syncStartYear} (previous status: ${existingProgress.status})`);
      } else {
        // Create new progress record
        const { data: newProgress } = await supabaseAdmin
          .from('sync_progress')
          .insert({
            user_id: user.id,
            sync_type: 'historical',
            start_year: syncStartYear,
            end_year: syncEndYear,
            status: 'in_progress',
          })
          .select()
          .single();
        progressRecord = newProgress;
        console.log(`Created new sync progress for ${syncStartYear}`);
      }
    }

    // If force full sync, clear last_sync_at
    if (forceFullSync) {
      console.log('Force full sync requested, clearing last_sync_at');
      await supabaseAdmin
        .from('pco_connections')
        .update({ last_sync_at: null })
        .eq('id', connection.id);
      connection.last_sync_at = null;
    }

    const accessToken = await refreshTokenIfNeededEncrypted(supabaseAdmin, connection);

    console.log('Starting optimized plans sync for user:', user.id, forceFullSync ? '(FULL SYNC)' : '(incremental)');

    const results = {
      plans_synced: 0,
      songs_synced: 0,
      errors: [] as string[],
      timed_out: false,
      resume_info: null as { service_type_index: number; plan_index: number } | null,
    };

    // Fetch service types
    const serviceTypesData = await fetchFromPCO(accessToken, '/services/v2/service_types');
    const serviceTypes = serviceTypesData.data || [];
    console.log(`Found ${serviceTypes.length} service types`);

    // Fetch all campuses for mapping
    const { data: campuses } = await supabaseAdmin.from('campuses').select('id, name');
    console.log('Available campuses:', campuses?.map(c => c.name).join(', '));

    // Function to determine campus_id from service_type_name
    const getCampusIdFromServiceType = (serviceTypeName: string): string | null => {
      if (!campuses || campuses.length === 0) return connection.campus_id;
      
      const lowerName = serviceTypeName.toLowerCase();
      
      // Check for exact or partial matches
      for (const campus of campuses) {
        const campusLower = campus.name.toLowerCase();
        // Check if service type contains campus name
        if (lowerName.includes(campusLower)) {
          return campus.id;
        }
        // Handle common abbreviations and variations
        if (campusLower === 'tullahoma' && (lowerName.includes('tullahoma') || lowerName === 'tullahoma worship')) {
          return campus.id;
        }
        if (campusLower === 'shelbyville' && lowerName.includes('shelbyville')) {
          return campus.id;
        }
        if (campusLower === 'cannon county' && (lowerName.includes('cannon') || lowerName.includes('cannon county'))) {
          return campus.id;
        }
        if (campusLower === 'murfreesboro north' && (lowerName.includes('murfreesboro north') || lowerName.includes('boro north'))) {
          return campus.id;
        }
        if (campusLower === 'murfreesboro central' && (lowerName.includes('murfreesboro central') || lowerName === 'murfreesboro central')) {
          return campus.id;
        }
      }
      
      // Default mappings for known service types
      // Network-wide events (no specific campus)
      if (lowerName.includes('worship night') || lowerName.includes('all team') || lowerName.includes('prayer night')) {
        return null; // Network-wide, no specific campus
      }
      
      // Student ministry events - map based on abbreviations in parentheses
      if (lowerName.includes('eon') || lowerName.includes('encounter') || lowerName.includes('er') || lowerName.includes('evident')) {
        // Handle abbreviations like "Encounter (CC)" for Cannon County
        if (lowerName.includes('(cc)') || lowerName.includes(' cc)')) {
          const cannonCounty = campuses.find(c => c.name.toLowerCase().includes('cannon'));
          if (cannonCounty) return cannonCounty.id;
        }
        
        // Handle Boro abbreviation for Murfreesboro Central
        if (lowerName.includes('(boro)') || lowerName.includes(' boro)') || lowerName.includes('eon boro')) {
          const central = campuses.find(c => c.name.toLowerCase().includes('central'));
          if (central) return central.id;
        }
        
        // Check if it specifies a campus name directly
        for (const campus of campuses) {
          if (lowerName.includes(campus.name.toLowerCase())) {
            return campus.id;
          }
        }
        
        // Default student events to central if no campus specified
        const central = campuses.find(c => c.name.toLowerCase().includes('central'));
        return central?.id || connection.campus_id;
      }
      
      // Default fallback to user's connected campus
      return connection.campus_id;
    };

    // Calculate date range based on sync mode
    const today = new Date();
    let afterDate: string;
    let beforeDate: string | undefined;
    
    // Check for specific date range sync (for historical chunks)
    
    if (syncStartYear && syncEndYear) {
      // Sync a specific date range (e.g., 2014-2015)
      afterDate = `${syncStartYear}-01-01`;
      beforeDate = `${syncEndYear}-12-31`;
      console.log(`Historical sync: fetching plans from ${afterDate} to ${beforeDate}`);
    } else if (connection.last_sync_at && !forceFullSync) {
      // Incremental sync: only fetch last 30 days (or since last sync, whichever is earlier)
      const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      const lastSync = new Date(connection.last_sync_at);
      // Use whichever is earlier to ensure we don't miss anything
      const syncFrom = lastSync < thirtyDaysAgo ? thirtyDaysAgo : lastSync;
      afterDate = syncFrom.toISOString().split('T')[0];
      console.log(`Incremental sync: fetching plans since ${afterDate}`);
    } else {
      // Full sync: fetch last 2 years (manageable within timeout)
      const twoYearsAgo = new Date(today.getTime() - 2 * 365 * 24 * 60 * 60 * 1000);
      afterDate = twoYearsAgo.toISOString().split('T')[0];
      console.log(`Full sync: fetching plans since ${afterDate} (last 2 years)`);
    }

    // First, fetch the entire song library directly (skip if resuming mid-sync)
    if (resumeServiceTypeIndex === 0 && resumePlanIndex === 0) {
      console.log('Fetching complete song library from PCO...');
      const allLibrarySongs = await fetchAllPages(accessToken, '/services/v2/songs?per_page=100', 100);
      console.log(`Fetched ${allLibrarySongs.length} songs from PCO library`);

      // Fetch existing songs from DB to check which need BPM updates
      const { data: existingSongs } = await supabaseAdmin
        .from('songs')
        .select('pco_song_id, bpm')
        .not('pco_song_id', 'is', null);
      
      const existingBpmMap = new Map<string, number | null>();
      for (const song of existingSongs || []) {
        if (song.pco_song_id) {
          existingBpmMap.set(song.pco_song_id, song.bpm);
        }
      }

      // Batch upsert all library songs immediately (without BPM first)
      const librarySongs = allLibrarySongs.map(song => ({
        pco_song_id: song.id,
        title: song.attributes.title || 'Unknown Song',
        author: song.attributes.author || null,
        ccli_number: song.attributes.ccli_number?.toString() || null,
      }));

      if (librarySongs.length > 0) {
        const batchSize = 100;
        for (let i = 0; i < librarySongs.length; i += batchSize) {
          const batch = librarySongs.slice(i, i + batchSize);
          const { error: songError } = await supabaseAdmin
            .from('songs')
            .upsert(batch, { onConflict: 'pco_song_id' });
          
          if (songError) {
            console.error('Error upserting library songs batch:', songError.message);
          } else {
            results.songs_synced += batch.length;
          }
        }
      }

      // Fetch BPM from arrangements for songs that don't have BPM yet
      // Limit to avoid timeout - process up to 50 songs without BPM per sync
      const songsNeedingBpm = allLibrarySongs.filter(song => {
        const existingBpm = existingBpmMap.get(song.id);
        return existingBpm === null || existingBpm === undefined;
      }).slice(0, 50);

      if (songsNeedingBpm.length > 0) {
        console.log(`Fetching BPM for ${songsNeedingBpm.length} songs...`);
        
        for (const song of songsNeedingBpm) {
          // Check timeout
          if (Date.now() - startTime > TIMEOUT_MARGIN_MS - 10000) {
            console.log('Approaching timeout, stopping BPM fetch');
            break;
          }

          try {
            await sleep(200); // Rate limiting
            const arrangementData = await fetchFromPCO(accessToken, `/services/v2/songs/${song.id}/arrangements?per_page=1`);
            const arrangements = arrangementData.data || [];
            
            if (arrangements.length > 0) {
              const bpm = arrangements[0].attributes?.bpm;
              if (bpm && typeof bpm === 'number' && bpm > 0) {
                await supabaseAdmin
                  .from('songs')
                  .update({ bpm })
                  .eq('pco_song_id', song.id);
                console.log(`Updated BPM for "${song.attributes.title}": ${bpm}`);
              }
            }
          } catch (err) {
            console.error(`Failed to fetch arrangement for song ${song.id}:`, err);
          }
        }
      }
    }

    // Collect all plans and songs data
    const allPlansToUpsert: any[] = [];
    const allSongsMap = new Map<string, any>(); // pco_song_id -> song data
    const planSongsData: { planPcoId: string; songs: any[] }[] = [];

    // Process only the requested ministries: Worship Nights, Weekend (campus services), Evident, Encounter, EON
    const campusNameTokens = (campuses || []).map(c => c.name.toLowerCase());

    const isAllowedServiceType = (serviceTypeName: string) => {
      const lower = serviceTypeName.toLowerCase();

      // Exclude Practice Songs plans
      if (lower.includes('practice song') || lower.includes('practice songs')) {
        return false;
      }

      // Weekend: any service type that includes a known campus name
      const isWeekend = campusNameTokens.some(token => token && lower.includes(token));

      const isWorshipNight = lower.includes('worship night') || lower.includes('worship nights');
      const isEncounter = lower.includes('encounter');
      const isEon = /\beon\b/.test(lower) || lower.includes('eon ');
      const isEvident = /\bevident\b/.test(lower) || /\ber\b/.test(lower);

      return isWeekend || isWorshipNight || isEncounter || isEon || isEvident;
    };

    const serviceTypesToProcess = serviceTypes.filter((st: any) => isAllowedServiceType(st.attributes?.name || ''));
    console.log(`Processing ${serviceTypesToProcess.length} service types after ministry filter`);

    // Update progress with total service types
    if (progressRecord) {
      const { error: progressTotalError } = await supabaseAdmin
        .from('sync_progress')
        .update({ total_service_types: serviceTypesToProcess.length })
        .eq('id', progressRecord.id);

      if (progressTotalError) {
        console.error('Failed updating sync_progress.total_service_types:', progressTotalError.message);
      }
    }

    // If the saved resume index is past the end of the (filtered) serviceTypes list,
    // restart this year from the beginning (this can happen if we change the allowed ministries).
    if (
      progressRecord &&
      resumeFromProgress &&
      serviceTypesToProcess.length > 0 &&
      resumeServiceTypeIndex >= serviceTypesToProcess.length
    ) {
      console.log(
        `Resume index ${resumeServiceTypeIndex} is >= ${serviceTypesToProcess.length}. Restarting sync from beginning.`
      );

      resumeServiceTypeIndex = 0;
      resumePlanIndex = 0;

      const { error: resetProgressError } = await supabaseAdmin
        .from('sync_progress')
        .update({
          current_service_type_index: 0,
          current_plan_index: 0,
          total_plans_processed: 0,
          total_songs_processed: 0,
          error_message: null,
          started_at: new Date().toISOString(),
          completed_at: null,
          status: 'in_progress',
        })
        .eq('id', progressRecord.id);

      if (resetProgressError) {
        console.error('Failed resetting sync_progress after ministry filter change:', resetProgressError.message);
      }
    }

    // If there are no service types after filtering, also complete immediately.
    if (progressRecord && serviceTypesToProcess.length === 0) {
      console.log('No service types matched ministry filter. Marking sync as completed.');

      const { error: markCompleteError } = await supabaseAdmin
        .from('sync_progress')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', progressRecord.id);

      if (markCompleteError) {
        console.error('Failed marking sync_progress as completed:', markCompleteError.message);
      }

      return new Response(
        JSON.stringify({ success: true, results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    for (let i = resumeServiceTypeIndex; i < serviceTypesToProcess.length; i++) {
      // Check for timeout before processing each service type
      if (Date.now() - startTime > TIMEOUT_MARGIN_MS) {
        console.log(`Approaching timeout limit. Saving progress at service type ${i}`);
        results.timed_out = true;
        results.resume_info = { service_type_index: i, plan_index: 0 };
        
        if (progressRecord) {
          await supabaseAdmin
            .from('sync_progress')
            .update({
              current_service_type_index: i,
              current_plan_index: 0,
              total_plans_processed: results.plans_synced,
              total_songs_processed: results.songs_synced,
            })
            .eq('id', progressRecord.id);
        }
        break;
      }

      const serviceType = serviceTypesToProcess[i];
      
      // Add small delay between requests to avoid rate limiting
      if (i > resumeServiceTypeIndex || resumePlanIndex > 0) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      const serviceTypeName = serviceType.attributes.name;
      const campusId = getCampusIdFromServiceType(serviceTypeName);
      console.log(`Fetching plans for: ${serviceTypeName} -> Campus: ${campuses?.find(c => c.id === campusId)?.name || 'Network-wide'}`);

      try {
        // Fetch all plans with higher per_page limit
        // Build URL with optional before filter for historical syncs
        let plansUrl: string;
        if (beforeDate) {
          // IMPORTANT: include "before" in the filter list, otherwise the API ignores the param
          plansUrl = `/services/v2/service_types/${serviceType.id}/plans?filter=after,before&after=${afterDate}&before=${beforeDate}&per_page=100`;
        } else {
          plansUrl = `/services/v2/service_types/${serviceType.id}/plans?filter=after&after=${afterDate}&per_page=100`;
        }
        const plans = await fetchAllPages(accessToken, plansUrl);
        
        console.log(`Found ${plans.length} plans for ${serviceTypeName}`);

        const startPlanIndex = (i === resumeServiceTypeIndex) ? resumePlanIndex : 0;

        for (let planIdx = startPlanIndex; planIdx < plans.length; planIdx++) {
          // Check for timeout before processing each plan
          if (Date.now() - startTime > TIMEOUT_MARGIN_MS) {
            console.log(`Approaching timeout limit. Saving progress at service type ${i}, plan ${planIdx}`);
            results.timed_out = true;
            results.resume_info = { service_type_index: i, plan_index: planIdx };
            
            if (progressRecord) {
              await supabaseAdmin
                .from('sync_progress')
                .update({
                  current_service_type_index: i,
                  current_plan_index: planIdx,
                  total_plans_processed: results.plans_synced,
                  total_songs_processed: results.songs_synced,
                })
                .eq('id', progressRecord.id);
            }
            break;
          }

          const plan = plans[planIdx];
          const planDate = plan.attributes.sort_date?.split('T')[0] || plan.attributes.dates;
          if (!planDate) continue;

          allPlansToUpsert.push({
            pco_plan_id: plan.id,
            campus_id: campusId,
            service_type_name: serviceTypeName,
            plan_date: planDate,
            plan_title: plan.attributes.title || `${serviceTypeName} - ${planDate}`,
            synced_at: new Date().toISOString(),
          });

          // Add pacing between plan item fetches to avoid rate limiting
          if (planIdx > 0 && planIdx % 10 === 0) {
            console.log(`Processed ${planIdx}/${plans.length} plans for ${serviceTypeName}...`);
          }
          await sleep(150); // 150ms between each plan = ~400 requests/minute max

          // Fetch plan items (songs) with include - with retry logic
          const maxItemRetries = 3;
          let itemSuccess = false;
          
          for (let itemAttempt = 1; itemAttempt <= maxItemRetries && !itemSuccess; itemAttempt++) {
            try {
              const itemsData = await fetchFromPCO(
                accessToken,
                `/services/v2/service_types/${serviceType.id}/plans/${plan.id}/items?include=song&per_page=100`
              );

              const includedSongs = itemsData.included?.filter((i: any) => i.type === 'Song') || [];
              const items = itemsData.data || [];
              
              const songItems = items.filter((item: any) => 
                item.attributes.item_type === 'song' && 
                item.relationships?.song?.data
              );

              const planSongsList: any[] = [];

              for (let sequence = 0; sequence < songItems.length; sequence++) {
                const item = songItems[sequence];
                const songRelation = item.relationships.song.data;
                const pcoSong = includedSongs.find((s: any) => s.id === songRelation.id);
                
                if (!pcoSong) continue;

                // Add to songs map (deduplicates automatically)
                if (!allSongsMap.has(pcoSong.id)) {
                  allSongsMap.set(pcoSong.id, {
                    pco_song_id: pcoSong.id,
                    title: pcoSong.attributes.title || 'Unknown Song',
                    author: pcoSong.attributes.author || null,
                    ccli_number: pcoSong.attributes.ccli_number?.toString() || null,
                  });
                }

                planSongsList.push({
                  pco_song_id: pcoSong.id,
                  sequence_order: sequence,
                  song_key: item.attributes.key_name || null,
                });
              }

              if (planSongsList.length > 0) {
                planSongsData.push({
                  planPcoId: plan.id,
                  songs: planSongsList,
                });
              }
              
              itemSuccess = true;
            } catch (itemError) {
              console.error(`Error fetching items for plan ${plan.id} (attempt ${itemAttempt}/${maxItemRetries}):`, itemError);
              if (itemAttempt < maxItemRetries) {
                const backoffMs = 1000 * Math.pow(2, itemAttempt - 1);
                console.log(`Retrying in ${backoffMs}ms...`);
                await sleep(backoffMs);
              } else {
                results.errors.push(`Failed to fetch songs for plan ${plan.id} after ${maxItemRetries} attempts`);
              }
            }
          }
        }

        // Break out of service types loop if timed out
        if (results.timed_out) break;

      } catch (serviceError) {
        console.error(`Error fetching plans for ${serviceTypeName}:`, serviceError);
        results.errors.push(`${serviceTypeName}: ${serviceError}`);
      }
    }

    console.log(`Collected ${allPlansToUpsert.length} plans, ${allSongsMap.size} unique songs`);

    // Batch upsert all plans
    if (allPlansToUpsert.length > 0) {
      const batchSize = 100;
      for (let i = 0; i < allPlansToUpsert.length; i += batchSize) {
        const batch = allPlansToUpsert.slice(i, i + batchSize);
        const { error: planError } = await supabaseAdmin
          .from('service_plans')
          .upsert(batch, { onConflict: 'pco_plan_id' });
        
        if (planError) {
          console.error('Error upserting plans batch:', planError.message);
          results.errors.push(`Plans batch ${i}: ${planError.message}`);
        } else {
          results.plans_synced += batch.length;
        }
      }
    }

    // Batch upsert all songs
    const allSongs = Array.from(allSongsMap.values());
    if (allSongs.length > 0) {
      const batchSize = 100;
      for (let i = 0; i < allSongs.length; i += batchSize) {
        const batch = allSongs.slice(i, i + batchSize);
        const { error: songError } = await supabaseAdmin
          .from('songs')
          .upsert(batch, { onConflict: 'pco_song_id' });
        
        if (songError) {
          console.error('Error upserting songs batch:', songError.message);
          results.errors.push(`Songs batch ${i}: ${songError.message}`);
        } else {
          results.songs_synced += batch.length;
        }
      }
    }

    // Now link songs to plans
    // First, get all plan IDs and song IDs from database
    const planPcoIds = allPlansToUpsert.map(p => p.pco_plan_id);
    const songPcoIds = Array.from(allSongsMap.keys());

    if (planPcoIds.length > 0 && songPcoIds.length > 0) {
      const { data: dbPlans } = await supabaseAdmin
        .from('service_plans')
        .select('id, pco_plan_id')
        .in('pco_plan_id', planPcoIds);

      const { data: dbSongs } = await supabaseAdmin
        .from('songs')
        .select('id, pco_song_id')
        .in('pco_song_id', songPcoIds);

      const planIdMap = new Map((dbPlans || []).map(p => [p.pco_plan_id, p.id]));
      const songIdMap = new Map((dbSongs || []).map(s => [s.pco_song_id, s.id]));

      // Delete existing plan_songs for these plans
      const planDbIds = Array.from(planIdMap.values());
      if (planDbIds.length > 0) {
        // Delete in batches to avoid query size limits
        const deleteBatchSize = 500;
        for (let i = 0; i < planDbIds.length; i += deleteBatchSize) {
          const batch = planDbIds.slice(i, i + deleteBatchSize);
          await supabaseAdmin
            .from('plan_songs')
            .delete()
            .in('plan_id', batch);
        }
      }

      // Build and insert all plan_songs
      const allPlanSongsToInsert: any[] = [];
      for (const { planPcoId, songs } of planSongsData) {
        const planId = planIdMap.get(planPcoId);
        if (!planId) continue;

        for (const song of songs) {
          const songId = songIdMap.get(song.pco_song_id);
          if (!songId) continue;

          allPlanSongsToInsert.push({
            plan_id: planId,
            song_id: songId,
            sequence_order: song.sequence_order,
            song_key: song.song_key,
          });
        }
      }

      // Batch insert plan_songs
      if (allPlanSongsToInsert.length > 0) {
        const batchSize = 200;
        for (let i = 0; i < allPlanSongsToInsert.length; i += batchSize) {
          const batch = allPlanSongsToInsert.slice(i, i + batchSize);
          const { error: linkError } = await supabaseAdmin
            .from('plan_songs')
            .insert(batch);
          
          if (linkError) {
            console.error('Error inserting plan_songs batch:', linkError.message);
          }
        }
      }
    }

    // Update progress record
    if (progressRecord) {
      if (results.timed_out) {
        // Keep as in_progress for resume
        await supabaseAdmin
          .from('sync_progress')
          .update({
            total_plans_processed: results.plans_synced,
            total_songs_processed: results.songs_synced,
          })
          .eq('id', progressRecord.id);
      } else {
        // Mark as completed
        await supabaseAdmin
          .from('sync_progress')
          .update({
            status: 'completed',
            total_plans_processed: results.plans_synced,
            total_songs_processed: results.songs_synced,
            completed_at: new Date().toISOString(),
          })
          .eq('id', progressRecord.id);
      }
    }

    // Update last sync time (only if not timed out mid-sync)
    if (!results.timed_out) {
      await supabaseAdmin
        .from('pco_connections')
        .update({ last_sync_at: new Date().toISOString() })
        .eq('id', connection.id);
    }

    console.log('Optimized plans sync complete:', JSON.stringify(results));

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Plans sync error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
