import { useSyncExternalStore } from "react";
import { toCompactLabel } from "@/lib/compactLabel";

const COMPACT_QUERY = "(max-width: 767px)";

function subscribeToCompactLabels(onStoreChange: () => void) {
  const media = window.matchMedia(COMPACT_QUERY);
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
}

function readCompactLabels() {
  return window.matchMedia(COMPACT_QUERY).matches;
}

/** Phones and narrow layouts use first-letter dropdown labels. */
export function usePreferCompactLabels() {
  return useSyncExternalStore(subscribeToCompactLabels, readCompactLabels, () => false);
}

/**
 * Closed-state label for a campus or ministry select.
 * Below the md breakpoint, multi-word names collapse to initials (WW, MC).
 * The open menu still lists the full name.
 */
export function CompactSelectValue({
  label,
  placeholder,
}: {
  label?: string | null;
  placeholder?: string;
}) {
  const compact = usePreferCompactLabels();
  const full = label?.trim() ?? "";

  if (!full) {
    return (
      <span className="!block min-w-0 flex-1 truncate text-left text-muted-foreground">
        {placeholder}
      </span>
    );
  }

  const short = toCompactLabel(full);
  const shown = compact && short !== full ? short : full;

  return (
    <span className="!block min-w-0 flex-1 truncate text-left" title={shown === full ? undefined : full}>
      {shown}
      {shown !== full ? <span className="sr-only"> {full}</span> : null}
    </span>
  );
}
