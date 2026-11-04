export type DetectedSectionGroup = {
  title: string;
  sections: Array<{ offsetSeconds: number; label: string }>;
};

export type FlowSongForSections = {
  id: string;
  title: string;
};

export type SectionCueDraft = {
  serviceFlowItemId: string;
  offsetSeconds: number;
  body: string;
};

export type MatchedSectionCues = {
  itemIds: string[];
  cues: SectionCueDraft[];
};

export function normalizeSongMarkerTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s*\(.*?\)\s*/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function pickTracksMp3<T extends { sequenceOrder: number; markerCount: number }>(tracks: T[]): T | null {
  return (
    tracks
      .filter((track) => track.markerCount > 0)
      .sort((left, right) => right.markerCount - left.markerCount || left.sequenceOrder - right.sequenceOrder)[0] ??
    null
  );
}

export function matchSectionsToFlowSongs(
  songs: FlowSongForSections[],
  groups: DetectedSectionGroup[],
): MatchedSectionCues {
  const usable = groups.filter((group) => group.sections.length > 0 && normalizeSongMarkerTitle(group.title));
  const queues = new Map<string, DetectedSectionGroup[]>();
  for (const group of usable) {
    const key = normalizeSongMarkerTitle(group.title);
    const queue = queues.get(key) ?? [];
    queue.push(group);
    queues.set(key, queue);
  }

  const used = new Set<DetectedSectionGroup>();
  const byTitle = songs.map((song) => {
    const match = (queues.get(normalizeSongMarkerTitle(song.title)) ?? []).find((group) => !used.has(group));
    if (!match) return null;
    used.add(match);
    return match;
  });
  const chosen = byTitle.some(Boolean) ? byTitle : songs.map((_, index) => usable[index] ?? null);

  const itemIds: string[] = [];
  const cues: SectionCueDraft[] = [];
  songs.forEach((song, index) => {
    const group = chosen[index];
    if (!group) return;
    const drafts = group.sections.flatMap((section) => {
      const body = section.label.trim().slice(0, 280);
      if (!body) return [];
      return [
        {
          serviceFlowItemId: song.id,
          offsetSeconds: Math.max(0, Math.min(7200, Math.round(section.offsetSeconds))),
          body,
        },
      ];
    });
    if (drafts.length === 0) return;
    itemIds.push(song.id);
    cues.push(...drafts);
  });

  return { itemIds, cues };
}
