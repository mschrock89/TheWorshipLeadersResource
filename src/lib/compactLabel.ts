/**
 * Short label for cramped mobile dropdowns.
 * Multi-word names become the first letter of each word:
 * "Weekend Worship" → "WW", "Murfreesboro Central" → "MC".
 * Single-word names stay as written so "Production" and "Video" remain distinct.
 */
export function toCompactLabel(label: string | null | undefined): string {
  const trimmed = (label ?? "").trim().replace(/\s+/g, " ");
  if (!trimmed) return "";

  const words = trimmed
    .replace(/['’]/g, "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);

  if (words.length <= 1) return trimmed;
  return words.map((word) => word[0]!.toUpperCase()).join("");
}
