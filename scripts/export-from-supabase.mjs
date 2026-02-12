#!/usr/bin/env node
/**
 * Export all app data from a Supabase project (e.g. Lovable/cpqen) to JSON files.
 *
 * Prerequisites:
 *   - SOURCE_SUPABASE_URL and SOURCE_SERVICE_ROLE_KEY in .env, or pass as env vars
 *
 * Usage:
 *   node scripts/export-from-supabase.mjs
 *
 * Output:
 *   scripts/data-export/*.json
 */
import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function loadEnv() {
  const path = join(ROOT, '.env');
  if (!existsSync(path)) return {};
  const text = readFileSync(path, 'utf-8');
  const out = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*["']?([^"'\n]*)["']?\s*$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return { ...out, ...process.env };
}
const EXPORT_DIR = join(ROOT, 'scripts', 'data-export');

const TABLES = [
  'campuses', 'albums', 'songs', 'album_tracks',
  'profiles', 'user_roles', 'user_campuses',
  'user_ministry_campuses', 'user_campus_ministry_positions',
  'worship_teams', 'team_schedule', 'team_members',
  'rotation_periods', 'team_period_locks',
  'events', 'service_plans', 'plan_songs',
  'draft_sets', 'draft_set_songs', 'draft_set_song_vocalists',
  'setlist_confirmations', 'setlist_approvals', 'setlist_playlists',
  'setlist_playlist_reference_tracks', 'reference_track_markers',
  'song_keys', 'swap_requests', 'swap_request_dismissals',
  'break_requests', 'chat_messages', 'message_reactions',
  'message_read_status', 'sync_progress', 'push_subscriptions',
  'notification_read_status',
  'service_flow_templates', 'service_flow_template_items',
  'service_flows', 'service_flow_items', 'service_flow_item_vocalists',
  'pco_connections',
];

async function fetchAll(supabase, table) {
  const PAGE = 1000;
  let offset = 0;
  const rows = [];
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return rows;
}

async function main() {
  const env = loadEnv();
  const url = env.SOURCE_SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SOURCE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Need SOURCE_SUPABASE_URL and SOURCE_SERVICE_ROLE_KEY');
    console.error('Add to .env or pass as env vars. Use service_role key for the SOURCE project.');
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (!existsSync(EXPORT_DIR)) mkdirSync(EXPORT_DIR, { recursive: true });

  console.log('Exporting from', url, 'to', EXPORT_DIR, '\n');

  for (const table of TABLES) {
    try {
      const rows = await fetchAll(supabase, table);
      const out = join(EXPORT_DIR, `${table}.json`);
      writeFileSync(out, JSON.stringify(rows, null, 2), 'utf-8');
      console.log(`✓ ${table}: ${rows.length} rows`);
    } catch (e) {
      console.error(`✗ ${table}:`, e.message);
    }
  }

  console.log('\n✅ Export complete. Run import-to-supabase.mjs to load into your Supabase project.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
