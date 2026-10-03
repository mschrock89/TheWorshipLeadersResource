import { useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { Check, Youtube } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SetlistPlaylistCard } from "@/components/audio/SetlistPlaylistCard";
import { useConfirmSetlists, usePublishedSetlists, type PublishedSetlist } from "@/hooks/useSetlistConfirmations";
import { useMySetlistPlaylists } from "@/hooks/useSetlistPlaylists";
import { setlistMatchesMinistryFilter } from "@/lib/constants";
import { getWeekendPairDate } from "@/lib/utils";

function toDateKey(date: Date | string | null | undefined) {
  if (!date) return null;
  if (typeof date === "string") return date.slice(0, 10);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function useRosteredSetlistsForDate(
  date: Date | string | null | undefined,
  campusId?: string | null,
  ministryFilter?: string | null,
  customServiceId?: string | null,
  customServiceIds?: string[],
) {
  const dateKey = toDateKey(date);
  const campusFilter = campusId || undefined;
  const { data: setlists = [], isLoading } = usePublishedSetlists(campusFilter, undefined, true);
  const customServiceIdKey = customServiceIds?.join(",") ?? "";

  const rostered = useMemo(() => {
    if (!dateKey) return [] as PublishedSetlist[];
    const pairDate = getWeekendPairDate(dateKey);
    const dates = new Set([dateKey, pairDate].filter((value): value is string => Boolean(value)));
    const serviceIds = new Set(customServiceIds ?? []);

    return setlists.filter((setlist) => {
      if (!setlist.amIOnRoster) return false;
      if (!dates.has(setlist.plan_date)) return false;
      if (campusId && setlist.campus_id && setlist.campus_id !== campusId) return false;
      if (customServiceId) return setlist.custom_service_id === customServiceId;
      if (serviceIds.size > 0) {
        return Boolean(setlist.custom_service_id && serviceIds.has(setlist.custom_service_id));
      }
      return setlistMatchesMinistryFilter(setlist.ministry_type, ministryFilter);
    });
  }, [campusId, customServiceId, customServiceIdKey, customServiceIds, dateKey, ministryFilter, setlists]);

  return { setlists: rostered, isLoading };
}

export function AssignedSetlistPrep({
  date,
  campusId,
  ministryFilter,
  customServiceId = null,
  customServiceIds,
}: {
  date: Date | string;
  campusId?: string | null;
  ministryFilter?: string | null;
  customServiceId?: string | null;
  customServiceIds?: string[];
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const confirmSetlists = useConfirmSetlists();
  const autoConfirmAttemptedRef = useRef(false);
  const { setlists, isLoading } = useRosteredSetlistsForDate(
    date,
    campusId,
    ministryFilter,
    customServiceId,
    customServiceIds,
  );
  const { data: playlists = [], isLoading: playlistsLoading } = useMySetlistPlaylists();

  const setlistIds = useMemo(() => new Set(setlists.map((setlist) => setlist.id)), [setlists]);
  const matchingPlaylists = playlists.filter((playlist) => setlistIds.has(playlist.draft_set_id));
  const unconfirmedIds = setlists.filter((setlist) => !setlist.myConfirmation).map((setlist) => setlist.id);
  const latestConfirmedAt = setlists
    .map((setlist) => setlist.myConfirmation?.confirmed_at)
    .filter((value): value is string => Boolean(value))
    .sort()
    .pop();
  const youtubeLinks = setlists.flatMap((setlist) =>
    setlist.songs
      .filter((song) => song.youtube_url)
      .map((song) => ({
        id: song.id,
        title: song.song?.title || "Song",
        href: song.youtube_url as string,
      })),
  );
  const notes = setlists.map((setlist) => setlist.notes).filter((note): note is string => Boolean(note));

  const highlightSetId = searchParams.get("setId");
  const shouldConfirmFromLink = searchParams.get("confirm") === "1";

  useEffect(() => {
    if (!shouldConfirmFromLink || !highlightSetId || isLoading || autoConfirmAttemptedRef.current) return;
    if (!setlists.some((setlist) => setlist.id === highlightSetId)) return;

    const clearConfirmParam = () => {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("confirm");
      setSearchParams(nextParams, { replace: true });
    };

    if (unconfirmedIds.length === 0) {
      clearConfirmParam();
      return;
    }

    autoConfirmAttemptedRef.current = true;
    confirmSetlists.mutate(unconfirmedIds, { onSettled: clearConfirmParam });
  }, [
    confirmSetlists,
    highlightSetId,
    isLoading,
    searchParams,
    setSearchParams,
    setlists,
    shouldConfirmFromLink,
    unconfirmedIds,
  ]);

  if (isLoading || setlists.length === 0) return null;

  return (
    <div className="space-y-3 border-t border-border/60 pt-3">
      {unconfirmedIds.length > 0 ? (
        <Button
          onClick={() => confirmSetlists.mutate(unconfirmedIds)}
          disabled={confirmSetlists.isPending}
          className="w-full bg-green-600 text-white hover:bg-green-700"
        >
          <Check className="mr-2 h-4 w-4" />
          Confirm I've Reviewed This Setlist
        </Button>
      ) : latestConfirmedAt ? (
        <p className="text-center text-xs text-muted-foreground">
          Confirmed on {format(parseISO(latestConfirmedAt), "MMM d 'at' h:mm a")}
        </p>
      ) : null}

      {youtubeLinks.length > 0 ? (
        <div className="space-y-2 rounded-lg border border-ecc-blue/40 bg-card/50 p-3">
          <div className="flex items-center gap-2">
            <Youtube className="h-4 w-4 text-ecc-blue" />
            <span className="text-sm font-medium text-foreground">YouTube Links</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {youtubeLinks.map((link) => (
              <div key={link.id} className="flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-2 py-1">
                <span className="max-w-[140px] truncate text-xs text-muted-foreground sm:max-w-[220px]">
                  {link.title}
                </span>
                <Button
                  asChild
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 gap-1 rounded-full border-red-500/50 bg-red-500/10 px-2 text-[11px] font-medium text-red-400 hover:bg-red-500/20 hover:text-red-300"
                >
                  <a href={link.href} target="_blank" rel="noopener noreferrer">
                    <Youtube className="h-3 w-3" />
                    YouTube
                  </a>
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {notes.map((note) => (
        <div key={note} className="border-t border-border/40 pt-3 text-sm">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Notes</p>
          <p>{note}</p>
        </div>
      ))}

      {playlistsLoading ? (
        <p className="text-xs text-muted-foreground">Loading Practice Hub…</p>
      ) : matchingPlaylists.length > 0 ? (
        <div className="space-y-2">
          {matchingPlaylists.map((playlist) => (
            <SetlistPlaylistCard key={playlist.id} playlist={playlist} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
