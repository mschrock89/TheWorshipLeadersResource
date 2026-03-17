const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "www.youtu.be",
]);

export function normalizeYouTubeUrl(rawUrl: string | null | undefined): string | null {
  const trimmed = rawUrl?.trim();
  if (!trimmed) return null;

  const withProtocol =
    trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? trimmed
      : `https://${trimmed}`;

  try {
    const parsed = new URL(withProtocol);
    if (!YOUTUBE_HOSTS.has(parsed.hostname.toLowerCase())) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function isMissingYoutubeUrlColumnError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  const message = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  return (
    (code === "42703" && message.includes("youtube_url")) ||
    ((code === "PGRST204" || code === "PGRST205") &&
      message.includes("youtube_url") &&
      message.includes("draft_set_songs"))
  );
}
