import { useLayoutEffect, useRef, useState } from "react";
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

const HIDDEN_ROUTES = new Set(["/chat", "/privacy", "/terms"]);
const NAV_CONTENT_HEIGHT = 56; // h-14

function probeSafeAreaBottom(): number {
  if (typeof document === "undefined") return 0;
  const el = document.createElement("div");
  el.style.paddingBottom = "env(safe-area-inset-bottom, 0px)";
  el.style.position = "fixed";
  el.style.visibility = "hidden";
  el.style.pointerEvents = "none";
  document.body.appendChild(el);
  const value = Math.round(parseFloat(getComputedStyle(el).paddingBottom) || 0);
  el.remove();
  return value;
}

/**
 * Pin the nav so its bottom edge matches the visual viewport bottom.
 * Using `top` (not `bottom`/`transform`) avoids iOS cold-start cases where
 * fixed bottom:0 anchors above the visible screen and never catches up.
 */
function useVisualViewportBottomPin(active: boolean) {
  const ref = useRef<HTMLElement>(null);
  const [safeArea, setSafeArea] = useState(0);

  useLayoutEffect(() => {
    if (!active) return;

    let cancelled = false;
    let rafId = 0;
    const timeouts: number[] = [];

    const sync = () => {
      if (cancelled) return;
      const el = ref.current;
      if (!el) return;

      const safe = probeSafeAreaBottom();
      setSafeArea((prev) => (prev === safe ? prev : safe));

      const totalHeight = NAV_CONTENT_HEIGHT + safe;
      const viewport = window.visualViewport;
      const visualBottom = viewport
        ? viewport.offsetTop + viewport.height
        : window.innerHeight;

      // Place the nav so its bottom sits on the visual viewport bottom.
      const top = Math.round(visualBottom - totalHeight);
      el.style.top = `${Math.max(0, top)}px`;
      el.style.bottom = "auto";
      el.style.height = `${totalHeight}px`;
      el.style.paddingBottom = `${safe}px`;
      el.style.transform = "none";
    };

    const schedule = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(sync);
    };

    sync();

    // Cold-start settle: iOS often corrects visualViewport after first paint.
    let frames = 0;
    const tick = () => {
      if (cancelled) return;
      sync();
      frames += 1;
      if (frames < 60) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    for (const ms of [0, 16, 50, 100, 200, 400, 800, 1200, 2000]) {
      timeouts.push(window.setTimeout(sync, ms));
    }

    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    window.addEventListener("pageshow", schedule);
    window.addEventListener("orientationchange", schedule);
    document.addEventListener("visibilitychange", schedule);

    return () => {
      cancelled = true;
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("pageshow", schedule);
      window.removeEventListener("orientationchange", schedule);
      document.removeEventListener("visibilitychange", schedule);
      if (rafId) cancelAnimationFrame(rafId);
      timeouts.forEach((id) => window.clearTimeout(id));
    };
  }, [active]);

  return { ref, safeArea };
}

export function BottomNav() {
  const location = useLocation();
  const { user } = useAuth();
  const isStudentApp = isCurrentStudentResourceApp();
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

  const hidden = HIDDEN_ROUTES.has(location.pathname);
  const { ref, safeArea } = useVisualViewportBottomPin(!hidden);

  if (hidden) {
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
      ref={ref}
      aria-label="Primary navigation"
      className="app-bottom-nav bottom-nav fixed inset-x-0 bottom-0 z-50 bg-card"
      style={{ paddingBottom: safeArea }}
    >
      <div
        className={cn(
          "container grid h-14 items-center gap-1 border-t border-border px-2 sm:flex sm:items-center sm:justify-around",
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
    </nav>
  );

  if (typeof document === "undefined") {
    return nav;
  }

  return createPortal(nav, document.body);
}
