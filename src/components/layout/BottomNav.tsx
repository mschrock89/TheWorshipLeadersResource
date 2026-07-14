import { createPortal } from "react-dom";
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
  MapPinned,
  Tent,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { isAuditionCandidateRole, isStudentBaseRole } from "@/lib/access";
import { useIsApprover, usePendingApprovalCount } from "@/hooks/useSetlistApprovals";
import { cn } from "@/lib/cn";
import { isCurrentStudentResourceApp } from "@/lib/resourceApp";
import { useActiveCampMode } from "@/hooks/useCampMode";
import { useVisualViewportOffset } from "@/hooks/useKeyboardOffset";

const HIDDEN_ROUTES = new Set(["/chat", "/privacy", "/terms"]);

export function BottomNav() {
  const location = useLocation();
  const { user } = useAuth();
  const isStudentApp = isCurrentStudentResourceApp();
  const { isKeyboardOpen } = useVisualViewportOffset();
  const { data: roles = [] } = useUserRoles(user?.id);
  const { totalUnread } = useUnreadMessages();
  const { data: isApprover = false } = useIsApprover();
  const { data: pendingApprovalCount = 0 } = usePendingApprovalCount();
  const isAuditionCandidate = isAuditionCandidateRole(roles.map((r) => r.role));
  const isStudentBase = isStudentBaseRole(roles.map((r) => r.role));
  const { data: activeCamp } = useActiveCampMode();
  const campNavItem = isStudentApp && activeCamp
    ? [{ to: "/camp", icon: Tent, label: "Camp" }]
    : [];

  if (HIDDEN_ROUTES.has(location.pathname)) {
    return null;
  }

  const navItems = user
    ? isAuditionCandidate
      ? [
          { to: "/bible", icon: BookOpen, label: "Bible" },
          ...campNavItem,
          { to: "/feed", icon: Newspaper, label: "Feed" },
          ...(!isStudentApp ? [{ to: "/songs", icon: Music, label: "Songs" }] : []),
          { to: "/calendar", icon: Calendar, label: "Calendar", tourId: "nav-calendar" },
        ]
      : isStudentBase
      ? [
          { to: "/bible", icon: BookOpen, label: "Bible" },
          { to: "/feed", icon: Newspaper, label: "Feed" },
          ...(isStudentApp ? [{ to: "/attendance", icon: MapPinned, label: "Attendance" }] : []),
          { to: "/resources", icon: Music, label: "Audio" },
          { to: "/calendar", icon: Calendar, label: "Calendar", tourId: "nav-calendar" },
          {
            to: "/my-setlists",
            icon: ListMusic,
            label: isStudentApp ? "My Setlists" : "Setlists",
            tourId: "nav-setlists",
          },
        ]
      : [
        { to: "/bible", icon: BookOpen, label: "Bible" },
        ...campNavItem,
        { to: "/chat", icon: MessageCircle, label: "Chat", badge: totalUnread },
        { to: "/feed", icon: Newspaper, label: "Feed" },
        { to: "/calendar", icon: Calendar, label: "Calendar", tourId: "nav-calendar" },
        {
          to: "/my-setlists",
          icon: ListMusic,
          label: isStudentApp ? "My Setlists" : "Setlists",
          badge: isApprover ? pendingApprovalCount : undefined,
          tourId: "nav-setlists",
        },
      ]
    : [];

  if (!user && navItems.length === 0) {
    return null;
  }

  const nav = (
    <nav
      aria-label="Primary navigation"
      className={cn(
        "app-bottom-nav bottom-nav fixed inset-x-0 bottom-0 z-50 bg-card",
        isKeyboardOpen && "invisible"
      )}
    >
      <div className="border-t border-border bg-card/95 backdrop-blur-md">
        <div
          className={cn(
            "container grid h-14 items-center gap-1 px-2 sm:flex sm:items-center sm:justify-around",
            navItems.length >= 7
              ? "grid-cols-7"
              : navItems.length === 6
                ? "grid-cols-6"
                : navItems.length === 5
                  ? "grid-cols-5"
                  : "grid-cols-4"
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
      </div>
      {/*
        Deep skirt under the bar. On iOS cold start, 100dvh home can paint below
        where position:fixed anchors; this always covers that band with nav color.
      */}
      <div className="app-bottom-nav-skirt bg-card" aria-hidden />
    </nav>
  );

  // Portal to body so page transforms / overflow never create a containing block.
  if (typeof document === "undefined") {
    return nav;
  }

  return createPortal(nav, document.body);
}
