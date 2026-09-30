import { cn } from "@/lib/cn";
import type { ServiceFlowItem } from "@/hooks/useServiceFlow";

type LiveServiceFlowPanelProps = {
  items: ServiceFlowItem[];
  clockTimes: Map<string, string>;
  currentItemId: string | null;
  isLoading: boolean;
  onSelect: (itemId: string | null) => void;
};

function itemTitle(item: ServiceFlowItem) {
  return item.song?.title || item.title;
}

export function LiveServiceFlowPanel({
  items,
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
            <li key={item.id} className="px-2 pt-3 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
              {item.title}
            </li>
          );
        }
        const isCurrent = item.id === currentItemId;
        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onSelect(isCurrent ? null : item.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left",
                isCurrent ? "border-primary bg-primary/10" : "border-transparent bg-muted/40",
              )}
            >
              <span className="w-16 shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                {clockTimes.get(item.id) || ""}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-semibold">{itemTitle(item)}</span>
                {item.notes ? (
                  <span className="block truncate text-xs text-muted-foreground">{item.notes}</span>
                ) : null}
              </span>
              {isCurrent ? (
                <span className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-primary">Now</span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export function findFlowCue(items: ServiceFlowItem[], currentItemId: string | null) {
  const playable = items.filter((item) => item.item_type !== "header");
  const currentIndex = playable.findIndex((item) => item.id === currentItemId);
  const current = currentIndex >= 0 ? playable[currentIndex] : null;
  const next = currentIndex >= 0 ? playable[currentIndex + 1] : null;
  return {
    currentTitle: current ? itemTitle(current) : null,
    nextTitle: next ? itemTitle(next) : null,
  };
}
