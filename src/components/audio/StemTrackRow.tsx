import { useCallback } from "react";
import { Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/cn";
import { StemType, STEM_LABELS, STEM_COLORS, STEM_ROUTING, STEM_IS_STEREO, Stem } from "@/hooks/useSetlistStems";
import { useStemPlayer } from "@/hooks/useStemPlayer";
import { StemWaveform } from "./StemWaveform";

interface StemTrackRowProps {
  stemType: StemType;
  stem: Stem | undefined;
  canManage: boolean;
  onUploadClick: (stemType: StemType) => void;
  onDeleteStem?: (stem: Stem) => void;
}

export function StemTrackRow({
  stemType,
  stem,
  canManage,
  onUploadClick,
  onDeleteStem,
}: StemTrackRowProps) {
  const color = STEM_COLORS[stemType];
  const label = STEM_LABELS[stemType];
  const routing = STEM_ROUTING[stemType];
  const isStereo = STEM_IS_STEREO[stemType];
  const { setVolume, setMute, toggleSolo, seekTo, volumes, mutes, soloedStem, loadStates } = useStemPlayer();

  const volume = volumes[stemType] ?? (stem?.volume ?? 1);
  const isMuted = mutes[stemType] ?? (stem?.is_muted ?? false);
  const isSoloed = soloedStem === stemType;
  const isOtherSoloed = soloedStem !== null && soloedStem !== stemType;
  const loadState = loadStates[stemType];
  const isLoading = loadState === "loading";
  const isError = loadState === "error";
  const isReady = loadState === "ready";
  const isEmpty = !stem;

  const handleVolumeChange = useCallback(
    (value: number[]) => {
      setVolume(stemType, value[0]);
    },
    [stemType, setVolume]
  );

  const handleMute = useCallback(() => {
    setMute(stemType, !isMuted);
  }, [stemType, isMuted, setMute]);

  const handleSolo = useCallback(() => {
    toggleSolo(stemType);
  }, [stemType, toggleSolo]);

  return (
    <div
      className={cn(
        "flex items-stretch border-b border-border/30 transition-opacity",
        isOtherSoloed && "opacity-40"
      )}
      style={{ minHeight: 56 }}
    >
      {/* Color indicator */}
      <div
        className="w-1 flex-shrink-0 rounded-sm my-1 ml-1"
        style={{ backgroundColor: color }}
      />

      {/* Track header */}
      <div className="flex flex-col justify-center px-3 gap-1 w-[160px] flex-shrink-0 border-r border-border/30">
        <div className="flex items-center gap-2">
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-xs font-semibold text-foreground tracking-wide leading-tight">
              {label}
            </span>
            <div className="flex items-center gap-1 mt-0.5">
              {/* Channel routing badge */}
              <span
                className="text-[9px] font-mono font-bold leading-none px-1 py-0.5 rounded"
                style={{ backgroundColor: `${color}22`, color }}
              >
                {isStereo ? "ST" : "MO"}
              </span>
              <span className="text-[9px] font-mono text-muted-foreground/60 leading-none">
                Ch {routing}
              </span>
            </div>
          </div>
          {/* Mute */}
          <button
            onClick={handleMute}
            disabled={isEmpty}
            className={cn(
              "w-6 h-6 rounded text-[10px] font-bold transition-all flex items-center justify-center border",
              isMuted
                ? "bg-yellow-500/20 border-yellow-500/60 text-yellow-400"
                : "border-border/50 text-muted-foreground hover:border-yellow-400/50 hover:text-yellow-400",
              "disabled:opacity-30 disabled:cursor-not-allowed"
            )}
            title="Mute"
          >
            M
          </button>
          {/* Solo */}
          <button
            onClick={handleSolo}
            disabled={isEmpty}
            className={cn(
              "w-6 h-6 rounded text-[10px] font-bold transition-all flex items-center justify-center border",
              isSoloed
                ? "border-primary/60 text-primary"
                : "border-border/50 text-muted-foreground hover:border-primary/50 hover:text-primary",
              "disabled:opacity-30 disabled:cursor-not-allowed"
            )}
            title="Solo"
          >
            S
          </button>
        </div>

        {/* Volume slider */}
        <div className="flex items-center gap-1.5">
          <Slider
            min={0}
            max={1}
            step={0.01}
            value={[volume]}
            onValueChange={handleVolumeChange}
            disabled={isEmpty || isMuted}
            className="flex-1"
            style={{ "--slider-color": color } as React.CSSProperties}
          />
          <span className="text-[10px] text-muted-foreground w-6 text-right tabular-nums">
            {Math.round(volume * 100)}
          </span>
        </div>
      </div>

      {/* Waveform lane */}
      <div className="flex-1 relative flex items-center bg-black/20 overflow-hidden">
        {isEmpty ? (
          /* Empty slot */
          <div className="flex-1 flex items-center justify-center gap-2 h-full">
            {canManage ? (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-xs text-muted-foreground hover:text-foreground h-8"
                onClick={() => onUploadClick(stemType)}
              >
                <Upload className="h-3.5 w-3.5" />
                Upload {label}
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground/40">No {label} stem</span>
            )}
          </div>
        ) : isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex items-center gap-1.5">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="w-0.5 rounded-full animate-pulse"
                  style={{
                    backgroundColor: color,
                    height: `${8 + Math.random() * 24}px`,
                    animationDelay: `${i * 0.1}s`,
                  }}
                />
              ))}
            </div>
          </div>
        ) : isError ? (
          <div className="flex-1 flex items-center justify-center">
            <span className="text-xs text-destructive">Failed to load</span>
          </div>
        ) : isReady ? (
          <div className="absolute inset-0 px-1">
            <StemWaveform stemType={stemType} color={color} onSeek={seekTo} />
          </div>
        ) : (
          /* stem exists but not yet loaded into player */
          <div className="flex-1 flex items-center px-4">
            <div className="flex-1 h-px" style={{ backgroundColor: `${color}30` }} />
          </div>
        )}

        {/* Action buttons — top-right corner */}
        {stem && canManage && (
          <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground bg-background/80"
              onClick={() => onUploadClick(stemType)}
              title={`Replace ${label}`}
            >
              <Upload className="h-3 w-3" />
            </Button>
            {onDeleteStem && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-destructive bg-background/80"
                onClick={() => onDeleteStem(stem)}
                title={`Remove ${label}`}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
