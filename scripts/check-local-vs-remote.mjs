#!/usr/bin/env node
/**
 * Compares local project state vs Supabase (and reports what to check on Vercel).
 * Run from repo root: node scripts/check-local-vs-remote.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Tables that should exist (from migrations)
const EXPECTED_TABLES = [
  'profiles', 'user_roles', 'campuses', 'user_campuses',
  'chat_messages', 'message_reactions', 'message_read_status',
  'events', 'pco_connections', 'worship_teams', 'team_schedule', 'team_members',
  'rotation_periods', 'team_period_locks', 'songs', 'service_plans', 'plan_songs',
  'song_keys', 'swap_requests', 'swap_request_dismissals', 'break_requests',
  'draft_sets', 'draft_set_songs', 'setlist_confirmations', 'setlist_approvals',
  'sync_progress', 'push_subscriptions', 'notification_read_status',
  'user_ministry_campuses', 'user_campus_ministry_positions',
  'setlist_playlists', 'setlist_playlist_reference_tracks', 'reference_track_markers',
  'albums', 'album_tracks', 'draft_set_song_vocalists',
  'service_flow_templates', 'service_flow_template_items', 'service_flows', 'service_flow_items', 'service_flow_item_vocalists',
];

function loadEnv() {
  const path = join(ROOT, '.env');
  if (!existsSync(path)) return {};
  const text = readFileSync(path, 'utf-8');
  const out = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*["']?([^"'\n]*)["']?\s*$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

function localMigrations() {
  const dir = join(ROOT, 'supabase', 'migrations');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
}

function localFunctions() {
  const dir = join(ROOT, 'supabase', 'functions');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => {
      const p = join(dir, f);
      return readdirSync(p, { withFileTypes: true }).some((d) => d.name === 'index.ts');
    })
    .filter((f) => f !== '_shared')
    .sort();
}

async function main() {
  const env = loadEnv();
  const url = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;

  console.log('=== LOCAL (repo) ===\n');
  const migrations = localMigrations();
  const functions = localFunctions();
  console.log('Migrations:', migrations.length, 'files');
  console.log('Edge functions:', functions.length, '→', functions.join(', '));
  console.log('.env present:', existsSync(join(ROOT, '.env')));
  console.log('Expected env:', url ? 'VITE_SUPABASE_URL set' : 'VITE_SUPABASE_URL missing', anonKey ? 'VITE_SUPABASE_ANON_KEY set' : 'VITE_SUPABASE_ANON_KEY missing');

  console.log('\n=== SUPABASE (remote) ===\n');
  if (!url || !anonKey) {
    console.log('Skipping Supabase check: missing URL or anon key in .env');
    printVercelChecklist();
    return;
  }

  const supabase = createClient(url, anonKey);
  const tableResults = [];

  for (const table of EXPECTED_TABLES) {
    try {
      const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
      if (error) {
        tableResults.push({ table, status: 'error', detail: error.message });
      } else {
        tableResults.push({ table, status: 'ok', count: count ?? 0 });
      }
    } catch (e) {
      tableResults.push({ table, status: 'error', detail: String(e.message) });
    }
  }

  const ok = tableResults.filter((r) => r.status === 'ok');
  const empty = ok.filter((r) => r.count === 0);
  const withData = ok.filter((r) => r.count > 0);
  const err = tableResults.filter((r) => r.status === 'error');

  console.log('Tables that exist and have data:', withData.length);
  withData.forEach((r) => console.log('  ', r.table + ':', r.count));
  console.log('\nTables that exist but are EMPTY:', empty.length);
  empty.forEach((r) => console.log('  ', r.table));
  if (err.length) {
    console.log('\nTables that failed (missing or RLS):', err.length);
    err.forEach((r) => console.log('  ', r.table + ':', r.detail?.slice(0, 60)));
  }

  console.log('\n--- Summary ---');
  console.log('Data tables you likely care about:');
  const keyTables = ['songs', 'albums', 'album_tracks', 'draft_sets', 'draft_set_songs', 'profiles', 'campuses', 'user_campuses', 'user_roles'];
  for (const t of keyTables) {
    const r = tableResults.find((x) => x.table === t);
    if (r?.status === 'ok') console.log('  ', t + ':', r.count, 'rows');
    else console.log('  ', t + ':', r?.detail ?? 'not checked');
  }

  printVercelChecklist();
}

function printVercelChecklist() {
  console.log('\n=== VERCEL (manual check) ===');
  console.log('In Vercel Dashboard → your project → Settings:');
  console.log('  • Environment variables: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY');
  console.log('  • Build: npm run build, output: dist');
  console.log('  • Domains: your custom URL if any');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
