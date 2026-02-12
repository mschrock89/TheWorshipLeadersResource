#!/usr/bin/env node
/**
 * Import app data from a single JSON file into your Supabase project.
 *
 * Expected JSON format: { "tableName": [rows], "other_table": [...], ... }
 * (e.g. from Lovable export or Supabase backup)
 *
 * Prerequisites:
 *   - VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env
 *
 * Usage:
 *   node scripts/import-from-json.mjs path/to/your-data.json
 *   node scripts/import-from-json.mjs path/to/your-data.json --skip-profiles
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
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

// Import order respecting FKs
const IMPORT_ORDER = [
  'campuses', 'albums', 'songs', 'album_tracks',
  'profiles', 'user_roles', 'user_campuses',
  'user_ministry_campuses', 'user_campus_ministry_positions',
  'worship_teams', 'rotation_periods', 'team_schedule', 'team_members', 'team_period_locks',
  'events', 'service_plans', 'plan_songs',
  'draft_sets', 'draft_set_songs', 'draft_set_song_vocalists',
  'setlist_confirmations', 'setlist_approvals', 'setlist_playlists',
  'setlist_playlist_reference_tracks', 'reference_track_markers',
  'song_keys', 'swap_requests', 'swap_request_dismissals', 'break_requests',
  'chat_messages', 'message_reactions', 'message_read_status',
  'sync_progress', 'push_subscriptions', 'notification_read_status',
  'service_flow_templates', 'service_flow_template_items',
  'service_flows', 'service_flow_items', 'service_flow_item_vocalists',
  'pco_connections',
];

// Keys to ignore (metadata, not tables)
const SKIP_KEYS = new Set(['exported_at', 'exportedAt', 'version', 'meta']);

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const filePath = args[0];
  if (!filePath) {
    console.error('Usage: node scripts/import-from-json.mjs <path-to-data.json> [--skip-profiles]');
    process.exit(1);
  }

  const resolved = resolve(process.cwd(), filePath);
  if (!existsSync(resolved)) {
    console.error('File not found:', resolved);
    process.exit(1);
  }

  const env = loadEnv();
  const url = env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Need VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
  }

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const raw = JSON.parse(readFileSync(resolved, 'utf-8'));
  const data = raw?.data ?? raw;
  const tables = typeof data === 'object' && !Array.isArray(data) ? data : { data };

  const skipProfiles = process.argv.includes('--skip-profiles');

  console.log('Importing from', resolved, 'into', url, '\n');

  for (const table of IMPORT_ORDER) {
    let rows = tables[table];
    if (!rows || !Array.isArray(rows)) continue;
    if (skipProfiles && table === 'profiles') {
      console.log('⊘ profiles: skipped (--skip-profiles)');
      continue;
    }
    if (rows.length === 0) {
      console.log(`⊘ ${table}: 0 rows, skip`);
      continue;
    }

    const { error } = await admin.from(table).upsert(rows, {
      onConflict: 'id',
      ignoreDuplicates: false,
    });
    if (error) {
      console.error(`✗ ${table}:`, error.message);
    } else {
      console.log(`✓ ${table}: ${rows.length} rows`);
    }
  }

  // Also try any other top-level arrays we didn't list
  for (const key of Object.keys(tables)) {
    if (SKIP_KEYS.has(key) || IMPORT_ORDER.includes(key)) continue;
    const rows = tables[key];
    if (!Array.isArray(rows) || rows.length === 0) continue;
    try {
      const { error } = await admin.from(key).upsert(rows, {
        onConflict: 'id',
        ignoreDuplicates: false,
      });
      if (error) console.error(`✗ ${key}:`, error.message);
      else console.log(`✓ ${key}: ${rows.length} rows`);
    } catch (e) {
      console.error(`✗ ${key}:`, e.message);
    }
  }

  console.log('\n✅ Import complete.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
