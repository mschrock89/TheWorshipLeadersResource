import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
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

function isIOS(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const standaloneNavigator = navigator as Navigator & { standalone?: boolean };
  return (
    standaloneNavigator.standalone === true ||
    window.matchMedia?.("(display-mode: standalone)").matches === true
  );
}

function getLayoutViewportHeight(): number {
  return Math.max(
    window.innerHeight || 0,
    document.documentElement?.clientHeight || 0,
  );
}

/** Extra pixels the layout viewport sits above the physical/visual bottom. */
function measureBottomPinGap(): number {
  if (typeof window === "undefined") return 0;

  const layoutHeight = getLayoutViewportHeight();
  const viewport = window.visualViewport;
  const visualBottom = viewport
    ? viewport.offsetTop + viewport.height
    : layoutHeight;
  const visualGap = Math.max(0, Math.round(visualBottom - layoutHeight));

  if (isStandaloneDisplay() && typeof window.screen?.height === "number") {
    const layoutBottom = Math.max(layoutHeight, visualBottom);
    const screenGap = Math.max(0, Math.round(window.screen.height - layoutBottom));
    return Math.max(visualGap, screenGap);
  }

  return visualGap;
}

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
  const isIOSDevice = useMemo(() => isIOS(), []);
  const navRef = useRef<HTMLElement>(null);
  const [pinGap, setPinGap] = useState(0);
  const [safeFill, setSafeFill] = useState(0);
  const rafId = useRef(0);

  useLayoutEffect(() => {
    if (!isIOSDevice) return;

    let cancelled = false;
    const timeouts: number[] = [];

    const update = () => {
      if (cancelled) return;

      let nextPin = measureBottomPinGap();
      const probedSafe = probeSafeAreaBottom();

      // Ground-truth: if the icon row still sits above the visible bottom after
      // cold-start metrics settle, extend the bar through that gap.
      const nav = navRef.current;
      const iconRow = nav?.firstElementChild as HTMLElement | null | undefined;
      if (nav && iconRow && !nav.classList.contains("invisible")) {
        const previousBottom = nav.style.bottom;
        const previousSafeHeight = (nav.lastElementChild as HTMLElement | null)?.style.height;
        nav.style.bottom = "0px";
        const safeEl = nav.lastElementChild as HTMLElement | null;
        if (safeEl) safeEl.style.height = "0px";

        const iconBottom = iconRow.getBoundingClientRect().bottom;
        const viewport = window.visualViewport;
        const visualBottom = viewport
          ? viewport.offsetTop + viewport.height
          : getLayoutViewportHeight();
        let targetBottom = visualBottom;
        if (isStandaloneDisplay() && typeof window.screen?.height === "number") {
          targetBottom = Math.max(targetBottom, window.screen.height);
        }
        nextPin = Math.max(nextPin, Math.max(0, Math.round(targetBottom - iconBottom)));

        nav.style.bottom = previousBottom;
        if (safeEl) {
          safeEl.style.height = previousSafeHeight ?? "";
        }
      }

      setPinGap((prev) => (prev === nextPin ? prev : nextPin));
      const nextSafe = Math.max(probedSafe, nextPin);
      setSafeFill((prev) => (prev === nextSafe ? prev : nextSafe));
    };

    const schedule = () => {
      if (rafId.current) cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(update);
    };

    // iOS standalone often reports wrong viewport metrics on the first paint of
    // the non-scrolling home screen; keep measuring until it settles. Navigation
    // also re-runs this effect so a cold-start miss self-corrects.
    update();
    let frames = 0;
    const tick = () => {
      if (cancelled) return;
      update();
      frames += 1;
      if (frames < 45) {
        rafId.current = requestAnimationFrame(tick);
      }
    };
    rafId.current = requestAnimationFrame(tick);

    for (const ms of [0, 50, 100, 200, 400, 800, 1600]) {
      timeouts.push(window.setTimeout(update, ms));
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
      if (rafId.current) cancelAnimationFrame(rafId.current);
      timeouts.forEach((id) => window.clearTimeout(id));
    };
  }, [isIOSDevice, location.pathname]);

  if (HIDDEN_ROUTES.has(location.pathname)) {
    return null;
  }

  // Show different nav items based on auth state
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

  return (
    <nav
      ref={navRef}
      aria-label="Primary navigation"
      className={cn(
        "app-bottom-nav bottom-nav fixed inset-x-0 z-50",
        isKeyboardOpen && "invisible"
      )}
      style={{
        // Negative bottom extends into the home-indicator gap when the layout
        // viewport stops short of the physical screen.
        bottom: pinGap > 0 ? -pinGap : 0,
      }}
    >
      {/*
        Keep blur on the icon row only. iOS often fails to paint backdrop-filter
        through safe-area padding, which reads as a floating bar with a black gap.
      */}
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
      <div
        className="app-bottom-nav-safe bg-card"
        style={{
          height: safeFill > 0 ? safeFill : undefined,
        }}
        aria-hidden
      />
    </nav>
  );
}
