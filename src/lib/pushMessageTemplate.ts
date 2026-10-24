const TOKEN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export interface PushFiller {
  key: string;
  label: string;
  sample: string;
  detail: string;
}

const FILLERS: Record<string, Omit<PushFiller, "key">> = {
  name: { label: "Name", sample: "Alex", detail: "the person's name" },
  requester: { label: "Requester", sample: "Jordan", detail: "who asked" },
  accepter: { label: "Accepter", sample: "Sam", detail: "who accepted" },
  sender: { label: "Sender", sample: "Taylor", detail: "who sent it" },
  author: { label: "Author", sample: "Morgan", detail: "who posted" },
  date: { label: "Date", sample: "Jul 12", detail: "the date" },
  dates: { label: "Dates", sample: "Jul 12, Jul 19", detail: "the dates they serve" },
  date_range: { label: "Date range", sample: "July 12-13", detail: "the weekend or date range" },
  day_word: { label: "today / tomorrow", sample: "today", detail: "today or tomorrow" },
  day_word_title: { label: "Today / Tomorrow", sample: "Today", detail: "Today or Tomorrow" },
  post_day: { label: "Post day", sample: "Sunday", detail: "the day a post goes live" },
  post_time: { label: "Post time", sample: "6:00 AM", detail: "the time a post goes live" },
  time: { label: "Time", sample: " at 7:00 PM", detail: "the start time, when there is one" },
  campus: { label: "Campus", sample: "Frisco", detail: "the campus" },
  positions: { label: "Positions", sample: "Electric Guitar", detail: "what they're scheduled to do" },
  position: { label: "Position", sample: "Drums", detail: "the role" },
  teams: { label: "Teams", sample: "Team A", detail: "their team" },
  team: { label: "Team", sample: "Team A", detail: "the team name" },
  ministry: { label: "Ministry", sample: "Video", detail: "Production, Video, or similar" },
  song_count: { label: "Song count", sample: "4", detail: "how many songs" },
  track_title: { label: "Track", sample: "Praise", detail: "the track name" },
  chapter: { label: "Chapter", sample: "Psalm 23", detail: "the scripture" },
  series_title: { label: "Series", sample: "DEVO", detail: "the series name" },
  title: { label: "Title", sample: "Team Night", detail: "the title" },
  title_preview: { label: "Post title", sample: "Practice notes", detail: "the post title" },
  preview: { label: "Preview", sample: "Can someone cover Saturday?", detail: "a short preview" },
  message: { label: "Message", sample: "Don't forget call time", detail: "the message they wrote" },
  chat_label: { label: "Chat", sample: "Frisco Worship", detail: "which chat" },
  request_label: { label: "Request type", sample: "Cover Request", detail: "cover or swap" },
  request_phrase: { label: "Request", sample: "needs a break", detail: "what they asked for" },
  period: { label: "Period", sample: "Fall Trimester", detail: "the rotation period" },
  count: { label: "Count", sample: "12", detail: "how many" },
  original_title: { label: "Original title", sample: "Setlist Posted", detail: "the notification being withdrawn" },
  set_id: { label: "Set link", sample: "the setlist", detail: "used in the link, not the sentence" },
  original_url: { label: "Original link", sample: "/calendar", detail: "where the original notification opened" },
};

export function fillerFor(key: string): PushFiller {
  const known = FILLERS[key];
  if (known) return { key, ...known };
  const label = key.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  return {
    key,
    label,
    sample: label,
    detail: label.toLowerCase(),
  };
}

export function extractTemplateKeys(template: string): string[] {
  return [...template.matchAll(TOKEN)].map((match) => match[1]);
}

export function missingFillers(templates: string[], required: string[]): string[] {
  const present = new Set(templates.flatMap(extractTemplateKeys));
  return required.filter((key) => key !== "set_id" && key !== "original_url" && !present.has(key));
}

export type TemplatePart =
  | { type: "text"; value: string }
  | { type: "filler"; key: string };

export function splitPushTemplate(template: string): TemplatePart[] {
  const parts: TemplatePart[] = [];
  let cursor = 0;
  for (const match of template.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push({ type: "text", value: template.slice(cursor, index) });
    parts.push({ type: "filler", key: match[1] });
    cursor = index + match[0].length;
  }
  if (cursor < template.length) parts.push({ type: "text", value: template.slice(cursor) });
  return parts;
}

export function describeWhen(key: string, trigger: string | null | undefined): string {
  const raw = (trigger || "").trim();
  if (key === "schedule-reminder" && /cron/i.test(raw)) return "Saturday morning at 8:00 AM";
  if (key === "video-schedule-reminder" && /cron/i.test(raw)) {
    return "Every day at 9:00 AM, 10 days before they serve";
  }
  if (!raw) return "When this notification is triggered";
  return raw
    .replace(/^Cron:\s*/i, "")
    .replace(/\s*America\/Chicago/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function uniqueKeys(keys: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const key of keys) {
    const trimmed = key.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}
