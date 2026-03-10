import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
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
import {
  detectKeyIndexFromChart,
  getSignedSemitoneDelta,
  KEY_LABELS_FLAT,
  KEY_LABELS_SHARP,
  transposeChordChartText,
} from "@/lib/chordChart";

const FONT_SIZES = [
  { value: "compact", label: "Compact", className: "text-[18px] leading-[1.35] sm:text-[20px]" },
  { value: "comfortable", label: "Comfortable", className: "text-[20px] leading-[1.45] sm:text-[22px]" },
  { value: "large", label: "Large", className: "text-[24px] leading-[1.55] sm:text-[28px]" },
];

export function ChartsViewerPage() {
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
  const fontSizeClassName = FONT_SIZES.find((entry) => entry.value === fontSize)?.className || FONT_SIZES[1].className;

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

  return (
    <div className="space-y-5">
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

      <div className="grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)_180px]">
        <div className="order-2 flex gap-3 lg:order-1 lg:flex-col">
          {previousSong ? (
            <Button asChild variant="outline" size="lg" className="h-auto min-h-24 flex-1 rounded-2xl px-4 py-4 text-left lg:w-full">
              <Link to={`/setlists/${setlist.id}/songs/${previousSong.id}`}>
                <div className="flex flex-col items-start gap-2">
                  <ChevronLeft className="h-5 w-5" />
                  <span className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Previous</span>
                  <span className="text-base font-medium">{previousSong.song?.title || "Untitled Song"}</span>
                </div>
              </Link>
            </Button>
          ) : null}
        </div>

        <div className="order-1 lg:order-2">
          {transposedChartText ? (
            <RenderedChordChart
              title={activeSong.song?.title || "Chord Chart"}
              author={activeSong.song?.author || null}
              chordChartText={transposedChartText}
              className="min-h-[70vh] rounded-[28px] p-6 shadow-ecc"
              scaleClassName={fontSizeClassName}
            />
          ) : lyricsText ? (
            <div className="min-h-[70vh] rounded-[28px] border bg-background p-6 shadow-ecc">
              <pre className={`whitespace-pre-wrap break-words ${fontSizeClassName}`}>{lyricsText}</pre>
            </div>
          ) : (
            <div className="flex min-h-[70vh] items-center justify-center rounded-[28px] border border-dashed bg-muted/10 p-8 text-center text-muted-foreground shadow-ecc">
              No chart or lyrics are available for this song yet.
            </div>
          )}
        </div>

        <div className="order-3 flex gap-3 lg:flex-col">
          {nextSong ? (
            <Button asChild size="lg" className="h-auto min-h-24 flex-1 rounded-2xl px-4 py-4 text-left lg:w-full">
              <Link to={`/setlists/${setlist.id}/songs/${nextSong.id}`}>
                <div className="flex flex-col items-start gap-2">
                  <ChevronRight className="h-5 w-5" />
                  <span className="text-xs uppercase tracking-[0.22em] text-primary-foreground/80">Next</span>
                  <span className="text-base font-medium">{nextSong.song?.title || "Untitled Song"}</span>
                </div>
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
