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

    if (nextUrl) await sleep(120);
  }

  return allData;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('=== PCO Auto-Sync Started ===');

  try {
    // Parse request body for lookback_days (default 14)
    let lookbackDays = 14;
    try {
      const body = await req.json();
      if (body?.lookback_days && typeof body.lookback_days === 'number') {
        lookbackDays = body.lookback_days;
      }
    } catch {
      // No body or invalid JSON, use default
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch all active PCO connections
    const { data: connections, error: connError } = await supabaseAdmin
      .from('pco_connections')
      .select('*');

    if (connError) {
      throw new Error(`Failed to fetch connections: ${connError.message}`);
    }

    if (!connections || connections.length === 0) {
      console.log('No PCO connections found. Nothing to sync.');
      return new Response(
        JSON.stringify({ success: true, message: 'No connections to sync', results: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${connections.length} PCO connection(s) to sync`);

    // Fetch all campuses for mapping
    const { data: campuses } = await supabaseAdmin.from('campuses').select('id, name');

    const getCampusIdFromServiceType = (serviceTypeName: string, connectionCampusId: string | null): string | null => {
      if (!campuses || campuses.length === 0) return connectionCampusId;
      
      const lowerName = serviceTypeName.toLowerCase();
      
      for (const campus of campuses) {
        const campusLower = campus.name.toLowerCase();
        if (lowerName.includes(campusLower)) {
          return campus.id;
        }
      }
      
      if (lowerName.includes('worship night') || lowerName.includes('all team') || lowerName.includes('prayer night')) {
        return null;
      }
      
      return connectionCampusId;
    };

    const campusNameTokens = (campuses || []).map(c => c.name.toLowerCase());

    const isAllowedServiceType = (serviceTypeName: string) => {
      const lower = serviceTypeName.toLowerCase();
      const isWeekend = campusNameTokens.some(token => token && lower.includes(token));
      const isWorshipNight = lower.includes('worship night') || lower.includes('worship nights');
      const isEncounter = lower.includes('encounter');
      const isEon = /\beon\b/.test(lower) || lower.includes('eon ');
      const isEvident = /\bevident\b/.test(lower) || /\ber\b/.test(lower);
      return isWeekend || isWorshipNight || isEncounter || isEon || isEvident;
    };

    // Calculate date range: last N days
    const today = new Date();
    const lookbackDate = new Date(today.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
    const afterDate = lookbackDate.toISOString().split('T')[0];
    console.log(`Syncing plans from ${afterDate} to today (${lookbackDays} day lookback)`);

    const allResults: any[] = [];

    // Process each connection
    for (const connection of connections) {
      console.log(`\n--- Processing connection ${connection.id} (org: ${connection.pco_organization_name || 'unknown'}) ---`);
      
      const connectionResult = {
        connection_id: connection.id,
        organization: connection.pco_organization_name,
        plans_synced: 0,
        songs_synced: 0,
        errors: [] as string[],
      };

      try {
        const accessToken = await refreshTokenIfNeededEncrypted(supabaseAdmin, connection);

        // Fetch service types
        const serviceTypesData = await fetchFromPCO(accessToken, '/services/v2/service_types');
        const serviceTypes = serviceTypesData.data || [];
        
        const serviceTypesToProcess = serviceTypes.filter((st: any) => isAllowedServiceType(st.attributes?.name || ''));
        console.log(`Processing ${serviceTypesToProcess.length} service types (of ${serviceTypes.length} total)`);

        const allPlansToUpsert: any[] = [];
        const allSongsMap = new Map<string, any>();
        const planSongsData: { planPcoId: string; songs: any[] }[] = [];

        for (const serviceType of serviceTypesToProcess) {
          const serviceTypeName = serviceType.attributes.name;
          const campusId = getCampusIdFromServiceType(serviceTypeName, connection.campus_id);
          
          try {
            const plansUrl = `/services/v2/service_types/${serviceType.id}/plans?filter=after&after=${afterDate}&per_page=100`;
            const plans = await fetchAllPages(accessToken, plansUrl, 10); // Limit pages for auto-sync
            
            console.log(`Found ${plans.length} plans for ${serviceTypeName}`);

            for (const plan of plans) {
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

              await sleep(100);

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
              } catch (itemError) {
                console.error(`Error fetching items for plan ${plan.id}:`, itemError);
                connectionResult.errors.push(`Plan ${plan.id}: ${itemError}`);
              }
            }
          } catch (serviceError) {
            console.error(`Error fetching plans for ${serviceTypeName}:`, serviceError);
            connectionResult.errors.push(`${serviceTypeName}: ${serviceError}`);
          }
        }

        console.log(`Collected ${allPlansToUpsert.length} plans, ${allSongsMap.size} unique songs`);

        // Batch upsert plans
        if (allPlansToUpsert.length > 0) {
          const batchSize = 100;
          for (let i = 0; i < allPlansToUpsert.length; i += batchSize) {
            const batch = allPlansToUpsert.slice(i, i + batchSize);
            const { error: planError } = await supabaseAdmin
              .from('service_plans')
              .upsert(batch, { onConflict: 'pco_plan_id' });
            
            if (planError) {
              console.error('Error upserting plans batch:', planError.message);
              connectionResult.errors.push(`Plans batch: ${planError.message}`);
            } else {
              connectionResult.plans_synced += batch.length;
            }
          }
        }

        // Batch upsert songs
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
              connectionResult.errors.push(`Songs batch: ${songError.message}`);
            } else {
              connectionResult.songs_synced += batch.length;
            }
          }
        }

        // Link songs to plans
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
            const deleteBatchSize = 500;
            for (let i = 0; i < planDbIds.length; i += deleteBatchSize) {
              const batch = planDbIds.slice(i, i + deleteBatchSize);
              await supabaseAdmin
                .from('plan_songs')
                .delete()
                .in('plan_id', batch);
            }
          }

          // Build and insert plan_songs
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

        // Update last_sync_at
        await supabaseAdmin
          .from('pco_connections')
          .update({ last_sync_at: new Date().toISOString() })
          .eq('id', connection.id);

        console.log(`Connection ${connection.id} sync complete: ${connectionResult.plans_synced} plans, ${connectionResult.songs_synced} songs`);

      } catch (connectionError) {
        console.error(`Error processing connection ${connection.id}:`, connectionError);
        connectionResult.errors.push(`Connection error: ${connectionError}`);
      }

      allResults.push(connectionResult);
    }

    const duration = Date.now() - startTime;
    console.log(`\n=== PCO Auto-Sync Complete in ${duration}ms ===`);
    console.log(`Processed ${allResults.length} connection(s)`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        duration_ms: duration,
        lookback_days: lookbackDays,
        results: allResults 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Auto-sync error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
