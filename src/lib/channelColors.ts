const COLOR_KEY = "wlr-live-channel-colors";

export const CHANNEL_TONES = [
  {
    id: "sky",
    label: "Blue",
    bubble: "border-sky-400/35 bg-sky-400/15",
    name: "text-sky-300",
    dot: "bg-sky-400",
    swatch: "bg-sky-400",
  },
  {
    id: "amber",
    label: "Amber",
    bubble: "border-amber-400/35 bg-amber-400/15",
    name: "text-amber-300",
    dot: "bg-amber-400",
    swatch: "bg-amber-400",
  },
  {
    id: "emerald",
    label: "Green",
    bubble: "border-emerald-400/35 bg-emerald-400/15",
    name: "text-emerald-300",
    dot: "bg-emerald-400",
    swatch: "bg-emerald-400",
  },
  {
    id: "violet",
    label: "Purple",
    bubble: "border-violet-400/35 bg-violet-400/15",
    name: "text-violet-300",
    dot: "bg-violet-400",
    swatch: "bg-violet-400",
  },
  {
    id: "rose",
    label: "Rose",
    bubble: "border-rose-400/35 bg-rose-400/15",
    name: "text-rose-300",
    dot: "bg-rose-400",
    swatch: "bg-rose-400",
  },
  {
    id: "cyan",
    label: "Cyan",
    bubble: "border-cyan-400/35 bg-cyan-400/15",
    name: "text-cyan-300",
    dot: "bg-cyan-400",
    swatch: "bg-cyan-400",
  },
  {
    id: "orange",
    label: "Orange",
    bubble: "border-orange-400/35 bg-orange-400/15",
    name: "text-orange-300",
    dot: "bg-orange-400",
    swatch: "bg-orange-400",
  },
  {
    id: "fuchsia",
    label: "Pink",
    bubble: "border-fuchsia-400/35 bg-fuchsia-400/15",
    name: "text-fuchsia-300",
    dot: "bg-fuchsia-400",
    swatch: "bg-fuchsia-400",
  },
] as const;

export type ChannelColorId = (typeof CHANNEL_TONES)[number]["id"];
export type ChannelTone = (typeof CHANNEL_TONES)[number];

export type ChannelColorStore = {
  byChannelId: Record<string, string>;
  bySlot: Record<string, string>;
};

export function emptyChannelColorStore(): ChannelColorStore {
  return { byChannelId: {}, bySlot: {} };
}

export function resolveChannelTone(
  store: ChannelColorStore,
  channelId: string,
  positionSlot: string | null | undefined,
  index: number,
): ChannelTone {
  const saved = store.byChannelId[channelId] || (positionSlot ? store.bySlot[positionSlot] : undefined);
  const match = CHANNEL_TONES.find((tone) => tone.id === saved);
  if (match) return match;
  const safeIndex = Number.isFinite(index) ? Math.abs(Math.floor(index)) : 0;
  return CHANNEL_TONES[safeIndex % CHANNEL_TONES.length];
}

export function assignChannelColor(
  store: ChannelColorStore,
  channelId: string,
  positionSlot: string | null | undefined,
  colorId: ChannelColorId,
): ChannelColorStore {
  const bySlot = { ...store.bySlot };
  if (positionSlot) bySlot[positionSlot] = colorId;
  return {
    byChannelId: { ...store.byChannelId, [channelId]: colorId },
    bySlot,
  };
}

export function readChannelColorStore(): ChannelColorStore {
  if (typeof window === "undefined") return emptyChannelColorStore();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(COLOR_KEY) || "") as Partial<ChannelColorStore>;
    return {
      byChannelId: parsed.byChannelId && typeof parsed.byChannelId === "object" ? parsed.byChannelId : {},
      bySlot: parsed.bySlot && typeof parsed.bySlot === "object" ? parsed.bySlot : {},
    };
  } catch {
    return emptyChannelColorStore();
  }
}

export function writeChannelColorStore(store: ChannelColorStore) {
  window.localStorage.setItem(COLOR_KEY, JSON.stringify(store));
}
