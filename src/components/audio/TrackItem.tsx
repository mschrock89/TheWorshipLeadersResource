import { Play, Pause, Music, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TrackItemProps {
  title: string;
  artist: string | null;
  songKey?: string | null;
  isPlaying: boolean;
  isCurrentTrack: boolean;
  hasAudio: boolean;
  index: number;
  onPlay: () => void;
}

export function TrackItem({
  title,
  artist,
  songKey,
  isPlaying,
  isCurrentTrack,
  hasAudio,
  index,
  onPlay,
}: TrackItemProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg transition-all",
        isCurrentTrack
          ? "bg-primary/10 border border-primary/20"
          : "hover:bg-muted/50",
        !hasAudio && "opacity-50"
      )}
    >
      {/* Track Number / Play State */}
      <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
        {isCurrentTrack && isPlaying ? (
          <div className="flex items-center gap-0.5">
            <span className="w-1 h-4 bg-primary rounded-full animate-pulse" />
            <span className="w-1 h-3 bg-primary rounded-full animate-pulse delay-75" />
            <span className="w-1 h-5 bg-primary rounded-full animate-pulse delay-150" />
          </div>
        ) : (
          <span className="text-sm text-muted-foreground font-mono">
            {index + 1}
          </span>
        )}
      </div>

      {/* Track Info */}
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "font-semibold truncate",
            isCurrentTrack ? "text-primary" : "text-foreground"
          )}
        >
          {title}
        </p>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {artist && <span className="truncate">{artist}</span>}
          {songKey && (
            <>
              {artist && <span>•</span>}
              <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
                {songKey}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Audio Status / Play Button */}
      {hasAudio ? (
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-10 w-10 rounded-full",
            isCurrentTrack && "text-primary hover:text-primary"
          )}
          onClick={onPlay}
        >
          {isCurrentTrack && isPlaying ? (
            <Pause className="h-5 w-5" />
          ) : (
            <Play className="h-5 w-5 ml-0.5" />
          )}
        </Button>
      ) : (
        <div className="h-10 w-10 flex items-center justify-center">
          <Music className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
