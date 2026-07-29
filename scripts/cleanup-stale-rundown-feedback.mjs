#!/usr/bin/env node
/**
 * Remove stale weekend rundown feedback rows created by the date-switch draft
 * bug: rows referencing songs (or song/vocalist pairs) that were never part of
 * that weekend's set. Mirrors the logic in the migration
 * 20260728220000_cleanup_stale_weekend_rundown_feedback.sql.
 *
 * Usage:
 *   node scripts/cleanup-stale-rundown-feedback.mjs           # dry run (default)
 *   node scripts/cleanup-stale-rundown-feedback.mjs --apply   # actually delete
 */
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function loadEnv() {
  const path = join(ROOT, '.env');
  if (!existsSync(path)) return { ...process.env };
  const text = readFileSync(path, 'utf-8');
  const out = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*["']?([^"'\n]*)["']?\s*$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return { ...out, ...process.env };
}

const env = loadEnv();
const url = env.VITE_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const supabase = createClient(url, key, { auth: { persistSession: false } });

async function fetchAll(table, select, filter) {
  const PAGE = 1000;
  let offset = 0;
  const rows = [];
  while (true) {
    let query = supabase.from(table).select(select).range(offset, offset + PAGE - 1);
    if (filter) query = filter(query);
    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
    offset += PAGE;
  }
  return rows;
}

function previousDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

async function main() {
  const rundowns = await fetchAll(
    'weekend_rundowns',
    'id, campus_id, weekend_date, user_id, resource_app_key',
    (q) => q.eq('resource_app_key', 'worship'),
  );
  console.log(`Worship weekend rundowns: ${rundowns.length}`);

  const draftSets = await fetchAll(
    'draft_sets',
    'id, campus_id, ministry_type, plan_date',
    (q) => q.eq('ministry_type', 'weekend'),
  );
  const draftSetSongs = await fetchAll('draft_set_songs', 'id, draft_set_id, song_id, vocalist_id');
  const draftSetSongVocalists = await fetchAll('draft_set_song_vocalists', 'draft_set_song_id, vocalist_id');

  // campus_id:plan_date -> set of draft set ids
  const setsByCampusDate = new Map();
  for (const ds of draftSets) {
    if (!ds.campus_id) continue;
    const mapKey = `${ds.campus_id}:${ds.plan_date}`;
    if (!setsByCampusDate.has(mapKey)) setsByCampusDate.set(mapKey, []);
    setsByCampusDate.get(mapKey).push(ds.id);
  }

  const songsBySet = new Map();
  for (const dss of draftSetSongs) {
    if (!songsBySet.has(dss.draft_set_id)) songsBySet.set(dss.draft_set_id, []);
    songsBySet.get(dss.draft_set_id).push(dss);
  }

  const vocalistsBySetSong = new Map();
  for (const dsv of draftSetSongVocalists) {
    if (!vocalistsBySetSong.has(dsv.draft_set_song_id)) vocalistsBySetSong.set(dsv.draft_set_song_id, []);
    vocalistsBySetSong.get(dsv.draft_set_song_id).push(dsv.vocalist_id);
  }

  // For each rundown, collect the valid song ids and song:vocalist pairs from
  // any weekend draft set dated on the Sunday or the Saturday before.
  const validity = new Map(); // rundown_id -> { hasSet, songIds: Set, vocalPairs: Set }
  for (const rundown of rundowns) {
    const dates = [rundown.weekend_date, previousDay(rundown.weekend_date)];
    const setIds = dates.flatMap((date) => setsByCampusDate.get(`${rundown.campus_id}:${date}`) || []);
    const songIds = new Set();
    const vocalPairs = new Set();
    for (const setId of setIds) {
      for (const song of songsBySet.get(setId) || []) {
        songIds.add(song.song_id);
        const assigned = vocalistsBySetSong.get(song.id) || [];
        for (const vocalistId of assigned) vocalPairs.add(`${song.song_id}:${vocalistId}`);
        if (song.vocalist_id) vocalPairs.add(`${song.song_id}:${song.vocalist_id}`);
      }
    }
    validity.set(rundown.id, { hasSet: setIds.length > 0, songIds, vocalPairs });
  }

  const rundownById = new Map(rundowns.map((r) => [r.id, r]));
  const rundownIds = rundowns.map((r) => r.id);

  const vocalFeedback = (await fetchAll('weekend_rundown_vocal_feedback', 'id, rundown_id, song_id, vocalist_id, fit_label, notes'))
    .filter((row) => rundownById.has(row.rundown_id));
  const songFeedback = (await fetchAll('weekend_rundown_song_feedback', 'id, rundown_id, song_id, notes'))
    .filter((row) => rundownById.has(row.rundown_id));

  const staleVocal = vocalFeedback.filter((row) => {
    const v = validity.get(row.rundown_id);
    return v.hasSet && !v.vocalPairs.has(`${row.song_id}:${row.vocalist_id}`);
  });
  const staleSong = songFeedback.filter((row) => {
    const v = validity.get(row.rundown_id);
    return v.hasSet && !v.songIds.has(row.song_id);
  });

  console.log(`\nVocal feedback rows: ${vocalFeedback.length} total, ${staleVocal.length} stale`);
  console.log(`Song feedback rows:  ${songFeedback.length} total, ${staleSong.length} stale\n`);

  const preview = (rows) => {
    for (const row of rows) {
      const rundown = rundownById.get(row.rundown_id);
      const note = (row.notes || '').replace(/\s+/g, ' ').slice(0, 60);
      console.log(`  ${rundown.weekend_date}  song=${row.song_id}  ${row.vocalist_id ? `vocalist=${row.vocalist_id}  ` : ''}fit=${row.fit_label || '-'}  "${note}"`);
    }
  };
  if (staleVocal.length) {
    console.log('Stale vocal feedback:');
    preview(staleVocal);
  }
  if (staleSong.length) {
    console.log('Stale song feedback:');
    preview(staleSong);
  }

  if (!APPLY) {
    console.log('\nDry run only. Re-run with --apply to delete these rows.');
    return;
  }

  const deleteByIds = async (table, rows) => {
    for (let i = 0; i < rows.length; i += 100) {
      const ids = rows.slice(i, i + 100).map((row) => row.id);
      const { error } = await supabase.from(table).delete().in('id', ids);
      if (error) throw new Error(`delete ${table}: ${error.message}`);
    }
  };
  await deleteByIds('weekend_rundown_vocal_feedback', staleVocal);
  await deleteByIds('weekend_rundown_song_feedback', staleSong);
  console.log(`\nDeleted ${staleVocal.length} vocal feedback rows and ${staleSong.length} song feedback rows.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
