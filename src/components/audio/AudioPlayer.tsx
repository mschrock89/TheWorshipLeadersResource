import { useEffect, useRef, useState, useCallback } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Repeat,
  Repeat1,
  Shuffle,
  Volume2,
  VolumeX,
  ChevronDown,
  RotateCcw,
  RotateCw,
  Music,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

const SWIPE_THRESHOLD = 80; // pixels needed to trigger close

export function AudioPlayer() {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    isShuffled,
    repeatMode,
    togglePlay,
    nextTrack,
    previousTrack,
    skipForward,
    skipBackward,
    seekTo,
    setVolume,
    toggleShuffle,
    toggleRepeat,
    setExpanded,
    playlist,
  } = useAudioPlayer();

  const progressRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isSeekingRef = useRef(false);
  
  // Swipe-to-close state
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const touchStartY = useRef(0);
  const touchStartTime = useRef(0);

  const handleClose = useCallback(() => {
    haptic('light');
    setExpanded(false);
    setDragY(0);
    setIsDragging(false);
  }, [setExpanded]);

  // Handle touch/swipe gestures for closing (only on header grab area)
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchStartTime.current = Date.now();
    setIsDragging(true);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - touchStartY.current;
    // Only allow downward drag
    if (diff > 0) {
      setDragY(diff);
    }
  }, [isDragging]);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging) return;
    
    const velocity = dragY / (Date.now() - touchStartTime.current);
    
    // Close if dragged past threshold or with high velocity
    if (dragY > SWIPE_THRESHOLD || velocity > 0.5) {
      handleClose();
    } else {
      // Snap back
      setDragY(0);
    }
    setIsDragging(false);
  }, [isDragging, dragY, handleClose]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleClose]);

  const seekFromClientX = useCallback(
    (clientX: number) => {
      if (!progressRef.current || !duration) return;
      const rect = progressRef.current.getBoundingClientRect();
      const percent = (clientX - rect.left) / rect.width;
      const nextTime = Math.min(Math.max(percent, 0), 1) * duration;
      seekTo(nextTime);
    },
    [duration, seekTo]
  );

  const handleProgressPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Prevent swipe-to-close and avoid "click" being swallowed by drag logic.
      e.stopPropagation();
      isSeekingRef.current = true;
      haptic('selection'); // Haptic feedback when scrubbing starts
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      seekFromClientX(e.clientX);
    },
    [seekFromClientX]
  );

  const handleProgressPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isSeekingRef.current) return;
      e.stopPropagation();
      seekFromClientX(e.clientX);
    },
    [seekFromClientX]
  );

  const handleProgressPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isSeekingRef.current) return;
    e.stopPropagation();
    isSeekingRef.current = false;
    haptic('light'); // Haptic feedback when scrubbing ends
    try {
      (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    } catch {
      // no-op
    }
  }, []);

  if (!currentTrack) return null;

  const progress = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div 
      ref={containerRef}
      className={cn(
        "fixed inset-0 z-50 bg-background/95 backdrop-blur-xl flex flex-col",
        !isDragging && "animate-in slide-in-from-bottom duration-300"
      )}
      style={{
        transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
        transition: isDragging ? 'none' : 'transform 0.3s ease-out',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {/* Header with swipe indicator and prominent close button */}
      <div
        className="flex flex-col items-center border-b border-border/50"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Swipe indicator pill */}
        <div className="w-10 h-1 bg-muted-foreground/30 rounded-full mt-3 mb-2" />
        
        <div className="flex items-center justify-between w-full px-4 pb-3">
          {/* Close button - prominent and easy to tap on iOS */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            className="text-foreground hover:text-foreground h-11 w-11 -ml-1"
          >
            <ChevronDown className="h-8 w-8" />
          </Button>
          <div className="text-center flex-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              Now Playing
            </p>
          </div>
          {/* Additional close button on the right for iOS accessibility */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground h-11 w-11 -mr-1"
          >
            <X className="h-6 w-6" />
          </Button>
        </div>
      </div>

      {/* Album Art Area */}
      <div className="flex-1 flex items-center justify-center p-8 min-h-0">
        <div className="w-full max-w-sm aspect-square rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-accent/20 flex items-center justify-center shadow-2xl overflow-hidden">
          {currentTrack.artworkUrl ? (
            <img 
              src={currentTrack.artworkUrl} 
              alt={currentTrack.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <Music className="h-24 w-24 text-primary/50" />
          )}
        </div>
      </div>

      {/* Track Info */}
      <div className="px-8 pb-4 text-center">
        <h2 className="text-2xl font-bold text-foreground truncate">
          {currentTrack.title}
        </h2>
        <p className="text-lg text-muted-foreground truncate mt-1">
          {currentTrack.artist || "Unknown Artist"}
        </p>
        {currentTrack.songKey && (
          <span className="inline-block mt-2 text-sm bg-primary/10 text-primary px-3 py-1 rounded-full">
            Key: {currentTrack.songKey}
          </span>
        )}
      </div>

      {/* Progress Bar */}
      <div className="px-8 pb-4">
        <div
          ref={progressRef}
          className="relative h-2 bg-muted rounded-full cursor-pointer group touch-none"
          onPointerDown={handleProgressPointerDown}
          onPointerMove={handleProgressPointerMove}
          onPointerUp={handleProgressPointerUp}
          onPointerCancel={handleProgressPointerUp}
        >
          <div
            className="absolute left-0 top-0 h-full bg-primary rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-5 h-5 bg-primary rounded-full shadow-lg opacity-100 transition-opacity"
            style={{ left: `calc(${progress}% - 10px)` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-muted-foreground font-mono">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Main Controls */}
      <div className="px-8 pb-4">
        <div className="flex items-center justify-center gap-4 sm:gap-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleShuffle}
            className={cn(
              "h-10 w-10",
              isShuffled ? "text-primary" : "text-muted-foreground"
            )}
          >
            <Shuffle className="h-5 w-5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={previousTrack}
            className="h-12 w-12 text-foreground"
          >
            <SkipBack className="h-7 w-7" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => skipBackward(15)}
            className="h-10 w-10 text-muted-foreground"
          >
            <RotateCcw className="h-5 w-5" />
          </Button>

          <Button
            onClick={() => {
              haptic('medium');
              togglePlay();
            }}
            size="icon"
            className="h-16 w-16 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg"
          >
            {isPlaying ? (
              <Pause className="h-8 w-8" />
            ) : (
              <Play className="h-8 w-8 ml-1" />
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => skipForward(15)}
            className="h-10 w-10 text-muted-foreground"
          >
            <RotateCw className="h-5 w-5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={nextTrack}
            className="h-12 w-12 text-foreground"
          >
            <SkipForward className="h-7 w-7" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleRepeat}
            className={cn(
              "h-10 w-10",
              repeatMode !== "off" ? "text-primary" : "text-muted-foreground"
            )}
          >
            {repeatMode === "one" ? (
              <Repeat1 className="h-5 w-5" />
            ) : (
              <Repeat className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>

      {/* Volume Control */}
      <div className="px-8 pb-6">
        <div className="flex items-center gap-3 max-w-xs mx-auto">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setVolume(volume === 0 ? 1 : 0)}
            className="h-8 w-8 text-muted-foreground"
          >
            {volume === 0 ? (
              <VolumeX className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </Button>
          <Slider
            value={[volume * 100]}
            onValueChange={([v]) => setVolume(v / 100)}
            max={100}
            step={1}
            className="flex-1"
          />
        </div>
      </div>

      {/* Queue Info */}
      {playlist.length > 1 && (
        <div className="px-8 pb-4 text-center">
          <p className="text-sm text-muted-foreground">
            {playlist.findIndex(t => t.id === currentTrack.id) + 1} of{" "}
            {playlist.length} tracks
          </p>
        </div>
      )}
    </div>
  );
}
