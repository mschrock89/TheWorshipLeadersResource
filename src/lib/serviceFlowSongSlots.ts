export type FlowSongRow = {
  id: string;
  item_type: string;
  title: string;
  sequence_order: number;
  song_id: string | null;
  song_key: string | null;
};

export type PostedFlowSong = {
  id: string;
  title: string;
  key?: string | null;
};

export type SongSlotUpdate = {
  id: string;
  song_id: string;
  title: string;
  song_key: string | null;
  /** Previous song's marker length should be cleared so the replacement can take its own. */
  clearDuration: boolean;
};

export type SongSlotInsert = {
  title: string;
  song_id: string;
  song_key: string | null;
  sequence_order: number;
};

export type SongSlotShift = {
  id: string;
  sequence_order: number;
};

function normalizedSlotTitle(value?: string | null) {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A flow row that is still waiting for a setlist title: "Song", "Song 1",
 * or the template default "Song Placeholder". A renamed line is a real item.
 */
export function isOpenSongSlot(item: { item_type?: string | null; title?: string | null }): boolean {
  if (item.item_type === "song" || item.item_type === "header") return false;
  if (item.item_type === "song_placeholder") return true;
  const title = normalizedSlotTitle(item.title);
  if (
    title === "song" ||
    title === "song placeholder" ||
    title === "song place holder" ||
    /^song placeholder\s+\d+$/.test(title) ||
    /^song place holder\s+\d+$/.test(title)
  ) {
    return true;
  }
  return /^song\s*\d+\b/i.test((item.title || "").trim());
}

function isCustomSongTitle(title: string) {
  const trimmed = title.trim();
  if (!trimmed) return false;
  return !isOpenSongSlot({ item_type: "item", title: trimmed });
}

/**
 * Place posted setlist songs onto an existing flow.
 * Real song rows match by song id first, then unused song rows in order.
 * Open "Song Placeholder" rows take the songs that did not land in a song row,
 * in flow order, before any extra songs are appended.
 */
export function planServiceFlowSongPlacement(
  flowItems: FlowSongRow[],
  songs: PostedFlowSong[],
): { updates: SongSlotUpdate[]; inserts: SongSlotInsert[]; shifts: SongSlotShift[] } {
  const empty = { updates: [], inserts: [], shifts: [] };
  if (songs.length === 0) return empty;

  const ordered = [...flowItems].sort((a, b) => a.sequence_order - b.sequence_order);
  const songRows = ordered.filter((item) => item.item_type === "song");
  const openSlots = ordered.filter((item) => isOpenSongSlot(item));
  if (songRows.length === 0 && openSlots.length === 0) return empty;

  const drafts = songs.map((song, index) => ({
    pairId: `draft-${index}-${song.id}`,
    song_id: song.id,
    title: song.title,
    song_key: song.key || null,
  }));

  const usedFlowIds = new Set<string>();
  const pairs: Array<{ draft: (typeof drafts)[number]; flow: FlowSongRow }> = [];
  for (const draft of drafts) {
    const bySongId = songRows.find(
      (item) => !!item.song_id && item.song_id === draft.song_id && !usedFlowIds.has(item.id),
    );
    if (bySongId) {
      usedFlowIds.add(bySongId.id);
      pairs.push({ draft, flow: bySongId });
      continue;
    }
    const nextByOrder = songRows.find((item) => !usedFlowIds.has(item.id));
    if (nextByOrder) {
      usedFlowIds.add(nextByOrder.id);
      pairs.push({ draft, flow: nextByOrder });
    }
  }

  const updates: SongSlotUpdate[] = [];
  const pairedDraftIds = new Set<string>();

  for (const { draft, flow } of pairs) {
    pairedDraftIds.add(draft.pairId);
    const songChanged = (flow.song_id ?? null) !== draft.song_id;
    const titleChanged = (flow.title || "") !== (draft.title || "");
    const keyChanged = (flow.song_key ?? null) !== draft.song_key;
    const keepCustomTitle = !songChanged && titleChanged && isCustomSongTitle(flow.title || "");
    if (!songChanged && (!titleChanged || keepCustomTitle) && !keyChanged) continue;
    updates.push({
      id: flow.id,
      song_id: draft.song_id,
      title: keepCustomTitle ? flow.title : draft.title,
      song_key: draft.song_key,
      clearDuration: songChanged,
    });
  }

  let unpaired = drafts.filter((song) => !pairedDraftIds.has(song.pairId));
  const slotsToFill = openSlots.slice(0, unpaired.length);
  slotsToFill.forEach((slot, index) => {
    const draft = unpaired[index];
    pairedDraftIds.add(draft.pairId);
    updates.push({
      id: slot.id,
      song_id: draft.song_id,
      title: draft.title,
      song_key: draft.song_key,
      clearDuration: false,
    });
  });
  unpaired = unpaired.slice(slotsToFill.length);

  const inserts: SongSlotInsert[] = [];
  const shifts: SongSlotShift[] = [];
  if (unpaired.length > 0) {
    const anchors = [...songRows, ...slotsToFill];
    const lastSongOrder = Math.max(...anchors.map((item) => item.sequence_order));
    const shiftBy = unpaired.length;
    for (const item of ordered
      .filter((row) => row.sequence_order > lastSongOrder)
      .sort((a, b) => b.sequence_order - a.sequence_order)) {
      shifts.push({ id: item.id, sequence_order: item.sequence_order + shiftBy });
    }
    unpaired.forEach((song, index) => {
      inserts.push({
        title: song.title,
        song_id: song.song_id,
        song_key: song.song_key,
        sequence_order: lastSongOrder + 1 + index,
      });
    });
  }

  return { updates, inserts, shifts };
}
