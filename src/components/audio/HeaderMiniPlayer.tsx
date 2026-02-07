import { Play, Pause, Music } from "lucide-react";
import { useAudioPlayerSafe } from "@/hooks/useAudioPlayer";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

export function HeaderMiniPlayer() {
  const audioPlayer = useAudioPlayerSafe();
  
  // Don't show mini player if no track or if full player is expanded
  if (!audioPlayer?.currentTrack || audioPlayer.isExpanded) return null;
  
  const { currentTrack, isPlaying, togglePlay, setExpanded, audioLevel, duration, currentTime } = audioPlayer;
  
  // Calculate progress percentage
  const progress = duration ? (currentTime / duration) * 100 : 0;
  
  // Audio-reactive scale
  const pulseScale = 1 + (audioLevel * 0.1);

  const handleClick = () => {
    haptic('light');
    setExpanded(true);
  };

  const handlePlayPause = (e: React.MouseEvent) => {
    e.stopPropagation();
    haptic('medium');
    togglePlay();
  };

  return (
    <button
      onClick={handleClick}
      className="relative flex items-center gap-2 px-2 py-1 rounded-full bg-card border border-border hover:bg-muted transition-colors max-w-[180px] sm:max-w-[220px] overflow-hidden"
    >
      {/* Artwork thumbnail */}
      <div 
        className="flex-shrink-0 h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden"
        style={{
          transform: isPlaying ? `scale(${pulseScale})` : undefined,
          transition: 'transform 0.1s ease-out',
        }}
      >
        {currentTrack.artworkUrl ? (
          <img 
            src={currentTrack.artworkUrl} 
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <Music className="h-3.5 w-3.5 text-primary" />
        )}
      </div>
      
      {/* Track info */}
      <div className="flex-1 min-w-0 text-left">
        <p className="text-xs font-medium text-foreground truncate leading-tight">
          {currentTrack.title}
        </p>
        <p className="text-[10px] text-muted-foreground truncate leading-tight">
          {currentTrack.artist || "Unknown"}
        </p>
      </div>
      
      {/* Play/Pause button */}
      <button
        onClick={handlePlayPause}
        className={cn(
          "flex-shrink-0 h-6 w-6 rounded-full flex items-center justify-center transition-colors",
          isPlaying 
            ? "bg-primary text-primary-foreground" 
            : "bg-muted text-foreground"
        )}
      >
        {isPlaying ? (
          <Pause className="h-3 w-3" />
        ) : (
          <Play className="h-3 w-3 ml-0.5" />
        )}
      </button>
      
      {/* Progress bar at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary/20">
        <div 
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </button>
  );
}
