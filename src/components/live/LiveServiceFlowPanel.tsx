import { cn } from "@/lib/cn";
import type { ServiceFlowItem } from "@/hooks/useServiceFlow";
import { formatDuration } from "@/components/service-flow/DurationInput";

type LiveServiceFlowPanelProps = {
  items: ServiceFlowItem[];
  titles?: Map<string, string>;
  clockTimes: Map<string, string>;
  currentItemId: string | null;
  isLoading: boolean;
  onSelect: (itemId: string | null) => void;
};

function itemTitle(item: ServiceFlowItem, titles?: Map<string, string>) {
  return titles?.get(item.id) || item.song?.title || item.title;
}

function vocalistNames(item: ServiceFlowItem) {
  if (item.vocalists && item.vocalists.length > 0) {
    return item.vocalists
      .map((vocalist) => vocalist.full_name || "")
      .filter(Boolean)
      .join(", ");
  }
  return item.vocalist?.full_name || "";
}

function itemDuration(item: ServiceFlowItem) {
  if (!item.duration_seconds || item.duration_seconds <= 0) return "";
  return formatDuration(item.duration_seconds);
}

export function LiveServiceFlowPanel({
  items,
  titles,
  clockTimes,
  currentItemId,
  isLoading,
  onSelect,
}: LiveServiceFlowPanelProps) {
  if (isLoading) {
    return <p className="px-4 py-6 text-sm text-muted-foreground">Loading the service flow…</p>;
  }
  if (items.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-muted-foreground">
        No service flow for this service yet.
      </p>
    );
  }

  return (
    <ol className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-3">
      {items.map((item) => {
        if (item.item_type === "header") {
          return (
            <li key={item.id} className="px-2 pt-3">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
                {item.title}
              </p>
              {item.notes?.trim() ? (
                <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{item.notes.trim()}</p>
              ) : null}
            </li>
          );
        }
        const isCurrent = item.id === currentItemId;
        const isSong = item.item_type === "song";
        const duration = itemDuration(item);
        const clockTime = clockTimes.get(item.id) || "";
        const singers = isSong ? vocalistNames(item) : "";
        const title = itemTitle(item, titles);
        const notes = item.notes?.trim() || "";
        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onSelect(isCurrent ? null : item.id)}
              className={cn(
                "flex w-full flex-col gap-1.5 rounded-xl border px-3 py-2.5 text-left",
                isCurrent ? "border-primary bg-primary/10" : "border-transparent bg-muted/40",
              )}
            >
              <span className="flex items-center gap-2">
                {duration ? (
                  <span className="shrink-0 rounded-md bg-background px-1.5 py-0.5 text-xs font-semibold tabular-nums text-foreground">
                    {duration}
                  </span>
                ) : null}
                {clockTime ? (
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">
                    {clockTime}
                  </span>
                ) : null}
                <span className="min-w-0 flex-1 truncate text-base font-semibold">{title}</span>
                {isCurrent ? (
                  <span className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-primary">Now</span>
                ) : null}
              </span>
              {isSong && (item.song?.bpm || item.song_key || singers) ? (
                <span className="flex flex-wrap items-center gap-1.5">
                  {item.song?.bpm ? (
                    <span className="rounded-md bg-primary px-2 py-0.5 text-sm font-bold tabular-nums text-primary-foreground">
                      {item.song.bpm} BPM
                    </span>
                  ) : null}
                  {item.song_key ? (
                    <span className="rounded-md border border-foreground/30 bg-background px-2 py-0.5 text-sm font-semibold">
                      {item.song_key}
                    </span>
                  ) : null}
                  {singers ? (
                    <span className="min-w-0 text-sm font-medium">{singers}</span>
                  ) : null}
                </span>
              ) : null}
              {notes ? (
                <span className="whitespace-pre-wrap text-xs text-muted-foreground">{notes}</span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export function findFlowCue(
  items: ServiceFlowItem[],
  currentItemId: string | null,
  titles?: Map<string, string>,
) {
  const playable = items.filter((item) => item.item_type !== "header");
  const currentIndex = playable.findIndex((item) => item.id === currentItemId);
  const current = currentIndex >= 0 ? playable[currentIndex] : null;
  const next = currentIndex >= 0 ? playable[currentIndex + 1] : null;
  return {
    currentTitle: current ? itemTitle(current, titles) : null,
    nextTitle: next ? itemTitle(next, titles) : null,
  };
}
