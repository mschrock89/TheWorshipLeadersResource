const NAME_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

export function shortRosterName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  while (parts.length > 1 && NAME_SUFFIXES.has(parts[parts.length - 1].replace(/\./g, "").toLowerCase())) {
    parts.pop();
  }
  if (parts.length <= 1) return fullName.trim();

  const last = parts[parts.length - 1].replace(/^[^\p{L}]+/u, "");
  const initial = [...last][0];
  if (!initial) return fullName.trim();
  return [...parts.slice(0, -1), initial.toLocaleUpperCase()].join(" ");
}
