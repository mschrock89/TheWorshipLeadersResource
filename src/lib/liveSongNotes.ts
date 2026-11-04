export type SongNotesLine = {
  id: string;
  item_type: string;
};

/**
 * Songs listed together in the flow. The group opens when Live is on one of
 * them, which is when a song MIDI cue has moved the service into that set.
 * A header or any other line starts a new group.
 */
export function contiguousSongIds(items: SongNotesLine[], currentItemId: string | null): string[] | null {
  if (!currentItemId) return null;
  const index = items.findIndex((item) => item.id === currentItemId);
  if (index < 0 || items[index]?.item_type !== "song") return null;
  let start = index;
  let end = index;
  while (start > 0 && items[start - 1]?.item_type === "song") start -= 1;
  while (end + 1 < items.length && items[end + 1]?.item_type === "song") end += 1;
  return items.slice(start, end + 1).map((item) => item.id);
}

export type ReadableSongNote = {
  serviceFlowItemId: string;
  kind: string;
  body: string;
};

/** Mix and free notes for the song run. Section markers stay on the timeline. */
export function readableSongNotes<T extends ReadableSongNote>(songIds: string[], cues: T[]): T[] {
  const ids = new Set(songIds);
  return cues.filter(
    (cue) => ids.has(cue.serviceFlowItemId) && cue.kind !== "section" && cue.body.trim().length > 0,
  );
}
