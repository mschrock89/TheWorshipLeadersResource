export type TrackMarkerSong = {
  id: string;
  title: string;
  sequenceOrder: number;
};

export type TrackMarkerDraft = {
  id: string;
  songId: string;
  title: string;
  minutes: string;
  seconds: string;
};

export function normalizeMarkerSongTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s*\(.*?\)\s*/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Songs that can receive a Tracks MP3 marker.
 * The service flow is included so a song added after the set was published
 * still gets a marker row. Draft-set songs that are not on the flow yet are kept too.
 */
export function songsForTrackMarkers(flowSongs: TrackMarkerSong[], draftSongs: TrackMarkerSong[]): TrackMarkerSong[] {
  const base = (flowSongs.length > 0 ? flowSongs : draftSongs)
    .slice()
    .sort((left, right) => left.sequenceOrder - right.sequenceOrder);
  const seenIds = new Set(base.map((song) => song.id).filter(Boolean));
  const seenTitles = new Set(base.map((song) => normalizeMarkerSongTitle(song.title)).filter(Boolean));
  const extras = draftSongs
    .slice()
    .sort((left, right) => left.sequenceOrder - right.sequenceOrder)
    .filter((song) => {
      const title = normalizeMarkerSongTitle(song.title);
      if ((song.id && seenIds.has(song.id)) || (title && seenTitles.has(title))) return false;
      if (song.id) seenIds.add(song.id);
      if (title) seenTitles.add(title);
      return true;
    });

  return [...base, ...extras].map((song, index) => ({ ...song, sequenceOrder: index }));
}

export function blankMarkerForSong(song: TrackMarkerSong): TrackMarkerDraft {
  return {
    id: crypto.randomUUID(),
    songId: song.id,
    title: song.title,
    minutes: "",
    seconds: "",
  };
}

export function markerRowsForSongs(songs: TrackMarkerSong[]): TrackMarkerDraft[] {
  return songs.map((song) => blankMarkerForSong(song));
}

/** Add an empty row for any service song that does not already have a marker. */
export function withMissingSongMarkers(markers: TrackMarkerDraft[], songs: TrackMarkerSong[]): TrackMarkerDraft[] {
  const usedIds = new Set(markers.map((marker) => marker.songId).filter(Boolean));
  const usedTitles = new Set(markers.map((marker) => normalizeMarkerSongTitle(marker.title)).filter(Boolean));
  const missing = songs.filter((song) => {
    const title = normalizeMarkerSongTitle(song.title);
    if ((song.id && usedIds.has(song.id)) || (title && usedTitles.has(title))) return false;
    if (song.id) usedIds.add(song.id);
    if (title) usedTitles.add(title);
    return true;
  });
  return [...markers, ...missing.map((song) => blankMarkerForSong(song))];
}

export function markerHasTime(marker: Pick<TrackMarkerDraft, "minutes" | "seconds">): boolean {
  return marker.minutes.trim() !== "" || marker.seconds.trim() !== "";
}
