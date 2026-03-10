import { TouchEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Expand,
  Loader2,
  Minimize,
  Type,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useAssignedChartsSetlists } from "@/charts/hooks/useAssignedChartsSetlists";
import { useSongChartVersions } from "@/hooks/useSongs";
import { RenderedChordChart } from "@/components/songs/RenderedChordChart";
import { supabase } from "@/integrations/supabase/client";
import {
  detectKeyIndexFromChart,
  getSignedSemitoneDelta,
  KEY_LABELS_FLAT,
  KEY_LABELS_SHARP,
  paginateRenderedChordLines,
  renderChordChartText,
  transposeChordChartText,
} from "@/lib/chordChart";
import { useQueries, useQueryClient } from "@tanstack/react-query";

const FONT_SIZES = [
  { value: "compact", label: "Compact", className: "text-[15px] leading-[1.25] sm:text-[16px]", pageUnits: 22 },
  { value: "comfortable", label: "Comfortable", className: "text-[17px] leading-[1.32] sm:text-[18px]", pageUnits: 19 },
  { value: "large", label: "Large", className: "text-[20px] leading-[1.4] sm:text-[21px]", pageUnits: 16 },
];

async function fetchSongChartVersions(songId: string, draftSetSongId?: string | null) {
  const { data: baseVersions, error: baseError } = await supabase
    .from("song_versions")
    .select("id, song_id, version_name, lyrics, chord_chart_text, chord_sheet_file_path, is_primary, created_at, updated_at")
    .eq("song_id", songId)
    .order("is_primary", { ascending: false })
    .order("version_name", { ascending: true });

  if (baseError) throw baseError;

  const normalizedBase = (baseVersions || []).map((version) => ({
    ...version,
    chart_scope: "library" as const,
    draft_set_song_id: null,
    source_song_version_id: null,
  }));

  if (!draftSetSongId) return normalizedBase;

  const { data: overrideRows, error: overrideError } = await supabase
    .from("draft_set_song_charts")
    .select("id, draft_set_song_id, source_song_version_id, version_name, chord_chart_text, created_at, updated_at")
    .eq("draft_set_song_id", draftSetSongId)
    .maybeSingle();

  if (overrideError) throw overrideError;
  if (!overrideRows) return normalizedBase;

  return [{
    id: overrideRows.id,
    song_id: songId,
    version_name: overrideRows.version_name,
    lyrics: null,
    chord_chart_text: overrideRows.chord_chart_text,
    chord_sheet_file_path: null,
    is_primary: true,
    created_at: overrideRows.created_at,
    updated_at: overrideRows.updated_at,
    chart_scope: "setlist" as const,
    draft_set_song_id: overrideRows.draft_set_song_id,
    source_song_version_id: overrideRows.source_song_version_id,
  }, ...normalizedBase];
}

export function ChartsViewerPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setlistId, songId: draftSetSongId } = useParams<{ setlistId: string; songId: string }>();
  const { data: setlists = [], isLoading: loadingSetlists } = useAssignedChartsSetlists();
  const setlist = setlists.find((entry) => entry.id === setlistId);
  const songIndex = setlist?.songs.findIndex((song) => song.id === draftSetSongId) ?? -1;
  const activeSong = songIndex >= 0 ? setlist?.songs[songIndex] : null;
  const { data: versions = [], isLoading: loadingVersions } = useSongChartVersions(
    activeSong?.song_id ?? null,
    activeSong?.id,
    !!activeSong,
  );
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [accidentalPreference, setAccidentalPreference] = useState<"flats" | "sharps">("flats");
  const [originalKeyIndex, setOriginalKeyIndex] = useState(0);
  const [targetKeyIndex, setTargetKeyIndex] = useState(0);
  const [fontSize, setFontSize] = useState("comfortable");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    if (!setlist) return;
    void Promise.all(
      setlist.songs.map((song) =>
        queryClient.prefetchQuery({
          queryKey: ["song-versions", song.song_id, song.id],
          queryFn: () => fetchSongChartVersions(song.song_id, song.id),
          staleTime: 5 * 60 * 1000,
        }),
      ),
    );
  }, [queryClient, setlist]);

  useQueries({
    queries: (setlist?.songs || []).map((song) => ({
      queryKey: ["song-versions", song.song_id, song.id],
      queryFn: () => fetchSongChartVersions(song.song_id, song.id),
      staleTime: 5 * 60 * 1000,
      enabled: !!setlist,
    })),
  });

  useEffect(() => {
    if (!versions.length) return;
    if (!versions.some((version) => version.id === selectedVersionId)) {
      setSelectedVersionId(versions[0].id);
    }
  }, [versions, selectedVersionId]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const selectedVersion = versions.find((version) => version.id === selectedVersionId) ?? versions[0] ?? null;
  const chartText = selectedVersion?.chord_chart_text?.trim() || "";
  const lyricsText = selectedVersion?.lyrics?.trim() || "";
  const keyLabels = accidentalPreference === "flats" ? KEY_LABELS_FLAT : KEY_LABELS_SHARP;

  useEffect(() => {
    if (!chartText) return;
    const detected = detectKeyIndexFromChart(chartText);
    setOriginalKeyIndex(detected);
    setTargetKeyIndex(detected);
  }, [chartText, selectedVersion?.id]);

  const transposeSemitones = useMemo(
    () => getSignedSemitoneDelta(originalKeyIndex, targetKeyIndex),
    [originalKeyIndex, targetKeyIndex],
  );
  const transposedChartText = useMemo(
    () => transposeChordChartText(chartText, transposeSemitones, accidentalPreference),
    [chartText, transposeSemitones, accidentalPreference],
  );
  const fontConfig = FONT_SIZES.find((entry) => entry.value === fontSize) || FONT_SIZES[1];
  const fontSizeClassName = fontConfig.className;
  const pagedLines = useMemo(() => paginateRenderedChordLines(renderChordChartText(transposedChartText), fontConfig.pageUnits), [fontConfig.pageUnits, transposedChartText]);
  const totalPages = transposedChartText ? Math.max(1, pagedLines.length) : 1;

  useEffect(() => {
    setPageIndex(0);
  }, [activeSong?.id, selectedVersion?.id, fontSize]);

  useEffect(() => {
    if (pageIndex > totalPages - 1) {
      setPageIndex(Math.max(0, totalPages - 1));
    }
  }, [pageIndex, totalPages]);

  if (loadingSetlists || (activeSong && loadingVersions)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Loading chart...</span>
      </div>
    );
  }

  if (!setlist || !activeSong) {
    return <Navigate to="/setlists" replace />;
  }

  const previousSong = songIndex > 0 ? setlist.songs[songIndex - 1] : null;
  const nextSong = songIndex < setlist.songs.length - 1 ? setlist.songs[songIndex + 1] : null;
  const goToSong = (songId: string, nextPageIndex = 0) => {
    setPageIndex(nextPageIndex);
    navigate(`/setlists/${setlist.id}/songs/${songId}`);
  };
  const goBackward = () => {
    if (pageIndex > 0) {
      setPageIndex((current) => current - 1);
      return;
    }
    if (previousSong) {
      goToSong(previousSong.id, 0);
    }
  };
  const goForward = () => {
    if (pageIndex < totalPages - 1) {
      setPageIndex((current) => current + 1);
      return;
    }
    if (nextSong) {
      goToSong(nextSong.id, 0);
    }
  };
  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  };
  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    if (touchStartX.current === null) return;
    const delta = (event.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < 48) return;
    if (delta < 0) {
      goForward();
      return;
    }
    goBackward();
  };

  return (
    <div className="space-y-5 overflow-hidden">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="lg" className="h-11 rounded-xl px-3">
          <Link to={`/setlists/${setlist.id}`}>
            <ArrowLeft className="mr-2 h-5 w-5" />
            Back to set
          </Link>
        </Button>

        <Badge variant="secondary" className="h-9 rounded-full px-4 text-sm">
          {songIndex + 1} of {setlist.songs.length}
        </Badge>
        <Badge variant="outline" className="h-9 rounded-full px-4 text-sm">
          Page {pageIndex + 1} of {totalPages}
        </Badge>
      </div>

      <section className="rounded-3xl border border-border bg-card/90 p-4 shadow-ecc">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-3xl font-semibold">{activeSong.song?.title || "Untitled Song"}</h2>
            <p className="text-base text-muted-foreground">{activeSong.song?.author || "Unknown author"}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Select value={selectedVersion?.id || ""} onValueChange={setSelectedVersionId}>
              <SelectTrigger className="h-12 rounded-xl text-base">
                <SelectValue placeholder="Version" />
              </SelectTrigger>
              <SelectContent>
                {versions.map((version) => (
                  <SelectItem key={version.id} value={version.id}>
                    {version.version_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={String(targetKeyIndex)} onValueChange={(value) => setTargetKeyIndex(Number(value))}>
              <SelectTrigger className="h-12 rounded-xl text-base">
                <SelectValue placeholder="Key" />
              </SelectTrigger>
              <SelectContent>
                {keyLabels.map((label, index) => (
                  <SelectItem key={label} value={String(index)}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={accidentalPreference} onValueChange={(value: "flats" | "sharps") => setAccidentalPreference(value)}>
              <SelectTrigger className="h-12 rounded-xl text-base">
                <SelectValue placeholder="Accidentals" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="flats">Flats</SelectItem>
                <SelectItem value="sharps">Sharps</SelectItem>
              </SelectContent>
            </Select>

            <Select value={fontSize} onValueChange={setFontSize}>
              <SelectTrigger className="h-12 rounded-xl text-base">
                <Type className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Size" />
              </SelectTrigger>
              <SelectContent>
                {FONT_SIZES.map((entry) => (
                  <SelectItem key={entry.value} value={entry.value}>
                    {entry.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              type="button"
              variant="outline"
              className="h-12 rounded-xl text-base"
              onClick={async () => {
                if (!document.fullscreenElement) {
                  await document.documentElement.requestFullscreen();
                } else {
                  await document.exitFullscreen();
                }
              }}
            >
              {isFullscreen ? <Minimize className="mr-2 h-5 w-5" /> : <Expand className="mr-2 h-5 w-5" />}
              {isFullscreen ? "Exit" : "Full Screen"}
            </Button>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[150px_minmax(0,1fr)_150px]">
        <div className="order-2 flex gap-3 lg:order-1 lg:flex-col">
          {pageIndex > 0 || previousSong ? (
            <Button type="button" variant="outline" size="lg" className="h-auto min-h-24 flex-1 rounded-2xl px-4 py-4 text-left lg:w-full" onClick={goBackward}>
              <div className="flex flex-col items-start gap-2">
                <ChevronLeft className="h-5 w-5" />
                <span className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                  {pageIndex > 0 ? "Previous Page" : "Previous Song"}
                </span>
                <span className="text-base font-medium">
                  {pageIndex > 0 ? activeSong.song?.title || "Untitled Song" : previousSong?.song?.title || "Untitled Song"}
                </span>
              </div>
            </Button>
          ) : (
            <div className="hidden lg:block" />
          )}
        </div>

        <div className="order-1 lg:order-2" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          {transposedChartText ? (
            <RenderedChordChart
              title={activeSong.song?.title || "Chord Chart"}
              author={activeSong.song?.author || null}
              chordChartText={transposedChartText}
              className="min-h-[62vh] rounded-[28px] p-5 shadow-ecc"
              scaleClassName={fontSizeClassName}
              pageIndex={pageIndex}
              pageSize={fontConfig.pageUnits}
            />
          ) : lyricsText ? (
            <div className="min-h-[62vh] rounded-[28px] border bg-background p-6 shadow-ecc overflow-hidden">
              <pre className={`whitespace-pre-wrap break-words ${fontSizeClassName}`}>{lyricsText}</pre>
            </div>
          ) : (
            <div className="flex min-h-[62vh] items-center justify-center rounded-[28px] border border-dashed bg-muted/10 p-8 text-center text-muted-foreground shadow-ecc">
              No chart or lyrics are available for this song yet.
            </div>
          )}
        </div>

        <div className="order-3 flex gap-3 lg:flex-col">
          {pageIndex < totalPages - 1 || nextSong ? (
            <Button type="button" size="lg" className="h-auto min-h-24 flex-1 rounded-2xl px-4 py-4 text-left lg:w-full" onClick={goForward}>
              <div className="flex flex-col items-start gap-2">
                <ChevronRight className="h-5 w-5" />
                <span className="text-xs uppercase tracking-[0.22em] text-primary-foreground/80">
                  {pageIndex < totalPages - 1 ? "Next Page" : "Next Song"}
                </span>
                <span className="text-base font-medium">
                  {pageIndex < totalPages - 1 ? activeSong.song?.title || "Untitled Song" : nextSong?.song?.title || "Untitled Song"}
                </span>
              </div>
            </Button>
          ) : (
            <div className="hidden lg:block" />
          )}
        </div>
      </div>
    </div>
  );
}
