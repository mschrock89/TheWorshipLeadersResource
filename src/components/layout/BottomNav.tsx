import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Home as HomeIcon,
  MessageCircle,
  Calendar,
  ListMusic,
  Play,
  Music,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { useAudioPlayerSafe } from "@/hooks/useAudioPlayer";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import { isAuditionCandidateRole } from "@/lib/access";
import { useIsApprover, usePendingApprovalCount } from "@/hooks/useSetlistApprovals";

// Separate component to handle the music button with audio visualization
function MusicButton({ 
  isPlaying, 
  hasTrack, 
  audioLevel, 
  onClick,
}: { 
  isPlaying: boolean; 
  hasTrack: boolean; 
  audioLevel: number;
  onClick: () => void;
}) {
  const pulseScale = 1 + (audioLevel * 0.35);
  const glowScale = 1.1 + (audioLevel * 0.55);
  const outerScale = 1.2 + (audioLevel * 0.7);
  const pulseOpacity = 0.18 + (audioLevel * 0.28);

  return (
    <div className="flex-1 flex justify-center">
      <Button
        variant="ghost"
        size="icon"
        onClick={onClick}
        className={cn(
          "relative h-12 w-12 rounded-full transition-all duration-150 select-none overflow-visible",
          isPlaying 
            ? "bg-transparent text-primary hover:bg-transparent" 
            : hasTrack
              ? "bg-primary/20 text-primary hover:bg-primary/30"
              : "hover:bg-muted"
        )}
      >
        {isPlaying && (
          <>
            <span 
              className="absolute inset-[-4px] rounded-full bg-sky-400/20 blur-sm transition-all duration-150"
              style={{ 
                transform: `scale(${outerScale})`,
                opacity: pulseOpacity * 0.9,
              }}
            />
            <span 
              className="absolute inset-[-1px] rounded-full bg-sky-400/25 blur-[1px] transition-all duration-100"
              style={{ 
                transform: `scale(${glowScale})`,
                opacity: pulseOpacity,
              }}
            />
            <span 
              className="absolute inset-[4px] rounded-full border border-sky-300/60 bg-[radial-gradient(circle_at_30%_30%,rgba(125,211,252,0.95),rgba(14,116,144,0.82))] shadow-[0_0_24px_rgba(56,189,248,0.45)] transition-all duration-75"
              style={{ 
                transform: `scale(${pulseScale})`,
                opacity: 0.72 + (audioLevel * 0.18),
              }}
            />
          </>
        )}
        
        <div className="relative z-10">
          {isPlaying ? (
            <span
              aria-hidden="true"
              className="block h-3 w-3 rounded-full bg-sky-100/85 shadow-[0_0_14px_rgba(186,230,253,0.85)] transition-transform duration-75"
              style={{ transform: `scale(${0.9 + audioLevel * 0.3})` }}
            />
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
  const { data: isApprover = false } = useIsApprover();
  const { data: pendingApprovalCount = 0 } = usePendingApprovalCount();
  const audioPlayer = useAudioPlayerSafe();
  const isAuditionCandidate = isAuditionCandidateRole(roles.map((r) => r.role));

  const isPlaying = audioPlayer?.isPlaying ?? false;
  const hasTrack = !!audioPlayer?.currentTrack;

  const hiddenRoutes = new Set(["/chat", "/privacy", "/terms"]);

  if (hiddenRoutes.has(location.pathname)) {
    return null;
  }

  const handleMusicClick = () => {
    haptic('medium');
    if (hasTrack) {
      // Single tap opens full player on mobile/desktop.
      audioPlayer?.setExpanded(true);
    } else {
      // Otherwise navigate to resources/music library
      window.location.href = '/resources';
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
    ? isAuditionCandidate
      ? [
          { to: "/calendar", icon: Calendar, label: "Calendar" },
        ]
      : [
          { to: "/calendar", icon: Calendar, label: "Calendar" },
          { to: "/my-setlists", icon: ListMusic, label: "Setlists", badge: isApprover ? pendingApprovalCount : undefined },
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
          />
        )}

        {/* Right nav items */}
        {rightNavItems.map(({ to, icon: Icon, label, badge }) => {
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
      </div>
    </nav>
  );
}
