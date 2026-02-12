#!/usr/bin/env node
/**
 * Import app data from scripts/data-export/*.json into your Supabase project.
 *
 * Prerequisites:
 *   - Run export-from-supabase.mjs first (against the SOURCE project)
 *   - TARGET uses .env VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or explicit env vars)
 *
 * Usage:
 *   node scripts/import-to-supabase.mjs
 *
 * Note: Auth users/profiles should be imported separately (e.g. import-users.mjs).
 * This script imports app tables only. Skip profiles if already imported.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
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

// Import order respecting FKs: parents before children
const IMPORT_ORDER = [
  'campuses',
  'albums',
  'songs',
  'album_tracks',
  'profiles', // update only if not from auth; skip if using import-users
  'user_roles',
  'user_campuses',
  'user_ministry_campuses',
  'user_campus_ministry_positions',
  'worship_teams',
  'rotation_periods',
  'team_schedule',
  'team_members',
  'team_period_locks',
  'events',
  'service_plans',
  'plan_songs',
  'draft_sets',
  'draft_set_songs',
  'draft_set_song_vocalists',
  'setlist_confirmations',
  'setlist_approvals',
  'setlist_playlists',
  'setlist_playlist_reference_tracks',
  'reference_track_markers',
  'song_keys',
  'swap_requests',
  'swap_request_dismissals',
  'break_requests',
  'chat_messages',
  'message_reactions',
  'message_read_status',
  'sync_progress',
  'push_subscriptions',
  'notification_read_status',
  'service_flow_templates',
  'service_flow_template_items',
  'service_flows',
  'service_flow_items',
  'service_flow_item_vocalists',
  'pco_connections',
];

async function main() {
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

  if (!existsSync(EXPORT_DIR)) {
    console.error('No data-export folder. Run export-from-supabase.mjs first.');
    process.exit(1);
  }

  console.log('Importing into', url, '\n');

  const skipProfiles = process.argv.includes('--skip-profiles');

  for (const table of IMPORT_ORDER) {
    const file = join(EXPORT_DIR, `${table}.json`);
    if (!existsSync(file)) continue;
    if (skipProfiles && table === 'profiles') {
      console.log('⊘ profiles: skipped (--skip-profiles)');
      continue;
    }

    const rows = JSON.parse(readFileSync(file, 'utf-8'));
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

  console.log('\n✅ Import complete.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
