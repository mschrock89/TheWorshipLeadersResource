import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  MessageCircle,
  Calendar,
  ListMusic,
  Music,
  BookOpen,
  Newspaper,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { isAuditionCandidateRole } from "@/lib/access";
import { useIsApprover, usePendingApprovalCount } from "@/hooks/useSetlistApprovals";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const location = useLocation();
  const { user } = useAuth();
  const { data: roles = [] } = useUserRoles(user?.id);
  const { totalUnread } = useUnreadMessages();
  const { data: isApprover = false } = useIsApprover();
  const { data: pendingApprovalCount = 0 } = usePendingApprovalCount();
  const isAuditionCandidate = isAuditionCandidateRole(roles.map((r) => r.role));

  const hiddenRoutes = new Set(["/chat", "/privacy", "/terms"]);

  if (hiddenRoutes.has(location.pathname)) {
    return null;
  }

  // Show different nav items based on auth state
  const navItems = user
    ? isAuditionCandidate
      ? [
          { to: "/bible", icon: BookOpen, label: "Bible" },
          { to: "/feed", icon: Newspaper, label: "Feed" },
          { to: "/songs", icon: Music, label: "Songs" },
          { to: "/calendar", icon: Calendar, label: "Calendar", tourId: "nav-calendar" },
        ]
      : [
        { to: "/bible", icon: BookOpen, label: "Bible" },
        { to: "/chat", icon: MessageCircle, label: "Chat", badge: totalUnread },
        { to: "/feed", icon: Newspaper, label: "Feed" },
        { to: "/calendar", icon: Calendar, label: "Calendar", tourId: "nav-calendar" },
        {
          to: "/my-setlists",
          icon: ListMusic,
          label: "Setlists",
          badge: isApprover ? pendingApprovalCount : undefined,
          tourId: "nav-setlists",
        },
      ]
    : [];

  if (!user && navItems.length === 0) {
    return null;
  }

  return (
    <nav 
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-md pb-safe"
    >
      <div
        className={cn(
          "container grid h-14 items-center gap-1 px-2 sm:flex sm:items-center sm:justify-around",
          navItems.length === 5 ? "grid-cols-5" : "grid-cols-4"
        )}
      >
        {navItems.map(({ to, icon: Icon, label, badge, tourId }) => {
          const isActive = location.pathname === to;
          
          return (
            <Link key={to} to={to} className="flex-1" data-tour={tourId}>
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
