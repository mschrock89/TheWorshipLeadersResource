export function normalizeCampusKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Score a teaching-sheet header against a campus name. 0 means no match. */
export function scoreCampusColumnMatch(header: string, campusName: string): number {
  const headerKey = normalizeCampusKey(header);
  const campusKey = normalizeCampusKey(campusName);
  if (!headerKey || !campusKey) return 0;
  if (headerKey === campusKey) return 100;

  const isNorthCampus = /north/.test(campusKey);
  const isCentralCampus = /central/.test(campusKey) || (/murfreesboro/.test(campusKey) && !isNorthCampus);
  const isCannonCampus = /cannon/.test(campusKey);
  const isShelbyvilleCampus = /shelbyville/.test(campusKey);
  const isTullahomaCampus = /tullahoma/.test(campusKey);
  const isMcMinnvilleCampus = /mcminnville/.test(campusKey);

  if (isNorthCampus) {
    if (/boronorth|murfreesboronorth/.test(headerKey)) return 95;
    if (headerKey === "north") return 80;
    if (headerKey === "murfreesboro") return 0;
  }

  if (isCentralCampus) {
    if (headerKey === "murfreesboro" || headerKey === "central" || headerKey === "boro") return 95;
    if (/north/.test(headerKey)) return 0;
  }

  if (isCannonCampus && /cannon/.test(headerKey)) return 95;
  if (isShelbyvilleCampus && /shelbyville/.test(headerKey)) return 95;
  if (isTullahomaCampus && /tullahoma/.test(headerKey)) return 95;
  if (isMcMinnvilleCampus && /mcminnville/.test(headerKey)) return 95;

  if (campusKey.includes(headerKey) || headerKey.includes(campusKey)) return 70;
  return 0;
}

export function findCampusColumnIndex(headerRow: string[], campusName: string): number {
  let bestIndex = -1;
  let bestScore = 0;
  headerRow.forEach((header, index) => {
    const score = scoreCampusColumnMatch(header, campusName);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestScore >= 70 ? bestIndex : -1;
}
