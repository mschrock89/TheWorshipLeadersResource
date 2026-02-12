import React, { useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Home as HomeIcon,
  MessageCircle,
  Calendar,
  ListMusic,
  Play,
  Pause,
  Music,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { useAudioPlayerSafe } from "@/hooks/useAudioPlayer";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import { isAuditionCandidateRole } from "@/lib/access";

// Separate component to handle the music button with audio visualization
function MusicButton({ 
  isPlaying, 
  hasTrack, 
  audioLevel, 
  onClick,
  onLongPress,
}: { 
  isPlaying: boolean; 
  hasTrack: boolean; 
  audioLevel: number;
  onClick: () => void;
  onLongPress?: () => void;
}) {
  // Scale the rings based on audio level (0.8 to 1.4 scale range)
  const ringScale = 1 + (audioLevel * 0.5);
  const ringOpacity = 0.2 + (audioLevel * 0.4);

  // Long press and double-tap handling
  const longPressTimerRef = useRef<number | null>(null);
  const isLongPressRef = useRef(false);
  const lastTapRef = useRef<number>(0);

  const handlePointerDown = () => {
    isLongPressRef.current = false;
    longPressTimerRef.current = window.setTimeout(() => {
      isLongPressRef.current = true;
      onLongPress?.();
    }, 500); // 500ms for long press
  };

  const handlePointerUp = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    
    // Don't trigger click if it was a long press
    if (isLongPressRef.current) {
      isLongPressRef.current = false;
      return;
    }
    
    // Double-tap detection
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      // Double tap - open full player
      onLongPress?.();
      lastTapRef.current = 0;
    } else {
      // Single tap - toggle play/pause
      onClick();
      lastTapRef.current = now;
    }
    
    isLongPressRef.current = false;
  };

  const handlePointerLeave = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    isLongPressRef.current = false;
  };

  return (
    <div className="flex-1 flex justify-center">
      <Button
        variant="ghost"
        size="icon"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onPointerCancel={handlePointerLeave}
        className={cn(
          "relative h-12 w-12 rounded-full transition-all duration-150 select-none",
          isPlaying 
            ? "bg-primary text-primary-foreground hover:bg-primary/90" 
            : hasTrack
              ? "bg-primary/20 text-primary hover:bg-primary/30"
              : "hover:bg-muted"
        )}
      >
        {/* Audio-reactive rings when playing */}
        {isPlaying && (
          <>
            <span 
              className="absolute inset-0 rounded-full bg-primary transition-transform duration-75"
              style={{ 
                transform: `scale(${ringScale})`,
                opacity: ringOpacity * 0.5,
              }}
            />
            <span 
              className="absolute inset-0 rounded-full bg-primary transition-transform duration-100"
              style={{ 
                transform: `scale(${1 + ringScale * 0.3})`,
                opacity: ringOpacity * 0.3,
              }}
            />
            <span 
              className="absolute inset-0 rounded-full bg-primary transition-transform duration-150"
              style={{ 
                transform: `scale(${1 + ringScale * 0.5})`,
                opacity: ringOpacity * 0.15,
              }}
            />
          </>
        )}
        
        <div className="relative z-10">
          {isPlaying ? (
            <Pause className="h-6 w-6" />
          ) : (
            <Play className="h-6 w-6 ml-0.5" />
          )}
        </div>
      </Button>
    </div>
  );
}

export function BottomNav() {
  const location = useLocation();
  const { user } = useAuth();
  const { data: roles = [] } = useUserRoles(user?.id);
  const { totalUnread } = useUnreadMessages();
  const audioPlayer = useAudioPlayerSafe();
  const isAuditionCandidate = isAuditionCandidateRole(roles.map((r) => r.role));

  const isPlaying = audioPlayer?.isPlaying ?? false;
  const hasTrack = !!audioPlayer?.currentTrack;

  // Hide bottom nav on chat page for better iOS experience
  if (location.pathname === '/chat') {
    return null;
  }

  const handleMusicClick = () => {
    haptic('medium');
    if (hasTrack) {
      // If a track is loaded, toggle play/pause
      audioPlayer?.togglePlay();
    } else {
      // Otherwise navigate to resources/music library
      window.location.href = '/resources';
    }
  };

  const handleMusicLongPress = () => {
    if (hasTrack) {
      haptic('medium');
      audioPlayer?.setExpanded(true);
    }
  };

  // Show different nav items based on auth state
  const leftNavItems = user
    ? isAuditionCandidate
      ? [
          { to: "/songs", icon: Music, label: "Songs" },
        ]
      : [
        { to: "/", icon: HomeIcon, label: "Home" },
        { to: "/chat", icon: MessageCircle, label: "Chat", badge: totalUnread },
      ]
    : [
        { to: "/", icon: HomeIcon, label: "Home" },
      ];

  const rightNavItems = user
    ? [
        { to: "/calendar", icon: Calendar, label: "Calendar" },
        { to: "/my-setlists", icon: ListMusic, label: "Setlists" },
      ]
    : [];

  return (
    <nav 
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-md pb-safe"
    >
      <div className="container flex items-center justify-around gap-1 px-2 h-14">
        {/* Left nav items */}
        {leftNavItems.map(({ to, icon: Icon, label, badge }) => {
          const isActive = location.pathname === to;
          
          return (
            <Link key={to} to={to} className="flex-1">
              <Button
                variant={isActive ? "secondary" : "ghost"}
                className="w-full gap-2 relative"
              >
                <div className="relative">
                  <Icon className="h-5 w-5" />
                  {badge !== undefined && badge > 0 && (
                    <Badge
                      variant="destructive"
                      className="absolute -top-2 -right-2 h-4 min-w-4 px-1 text-[10px] flex items-center justify-center animate-pulse"
                    >
                      {badge > 99 ? "99+" : badge}
                    </Badge>
                  )}
                </div>
                <span className="hidden sm:inline">{label}</span>
              </Button>
            </Link>
          );
        })}

        {/* Center Music/Play button */}
        {user && (
          <MusicButton 
            isPlaying={isPlaying}
            hasTrack={hasTrack}
            audioLevel={audioPlayer?.audioLevel ?? 0}
            onClick={handleMusicClick}
            onLongPress={handleMusicLongPress}
          />
        )}

        {/* Right nav items */}
        {rightNavItems.map(({ to, icon: Icon, label }) => {
          const isActive = location.pathname === to;
          
          return (
            <Link key={to} to={to} className="flex-1">
              <Button
                variant={isActive ? "secondary" : "ghost"}
                className="w-full gap-2"
              >
                <Icon className="h-5 w-5" />
                <span className="hidden sm:inline">{label}</span>
              </Button>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
