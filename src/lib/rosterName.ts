const NAME_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

function isVowel(char: string, index: number) {
  if ("aeiou".includes(char)) return true;
  return char === "y" && index > 0;
}

function firstSyllable(word: string): string {
  const hyphen = word.indexOf("-");
  if (hyphen > 0) return firstSyllable(word.slice(0, hyphen));

  const lower = word.toLowerCase();
  const groups: Array<{ start: number; end: number }> = [];
  for (let index = 0; index < lower.length; index += 1) {
    if (!isVowel(lower[index], index)) continue;
    const start = index;
    while (index + 1 < lower.length && isVowel(lower[index + 1], index + 1)) index += 1;
    groups.push({ start, end: index + 1 });
  }

  const lastGroup = groups[groups.length - 1];
  const silentE =
    !!lastGroup &&
    lastGroup.end - lastGroup.start === 1 &&
    lower[lastGroup.start] === "e" &&
    lastGroup.end >= lower.length - 1 &&
    /e(s)?$/i.test(word);
  const spoken = silentE ? groups.slice(0, -1) : groups;
  if (spoken.length <= 1) return word;

  const first = spoken[0];
  const consonantsBeforeNext = spoken[1].start - first.end;
  return word.slice(0, first.end + (consonantsBeforeNext > 0 ? 1 : 0));
}

export function shortRosterName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  while (parts.length > 1 && NAME_SUFFIXES.has(parts[parts.length - 1].replace(/\./g, "").toLowerCase())) {
    parts.pop();
  }
  if (parts.length <= 1) return fullName.trim();

  const last = parts[parts.length - 1];
  const shortLast = firstSyllable(last);
  return [...parts.slice(0, -1), shortLast].join(" ");
}
