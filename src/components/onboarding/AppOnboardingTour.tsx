import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useCompleteOnboarding, useOnboardingStatus } from "@/hooks/useProfiles";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useUserRoles } from "@/hooks/useUserRoles";
import { isAuditionCandidateRole } from "@/lib/access";

type TourStep = {
  id: string;
  route: string;
  title: string;
  description: string;
  target?: string;
};

type Rect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function AppOnboardingTour() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: roles = [] } = useUserRoles(user?.id);
  const { data: hasCompletedOnboarding, isLoading } = useOnboardingStatus(user?.id);
  const completeOnboarding = useCompleteOnboarding();
  const { isSupported, isSubscribed } = usePushNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const startedForUserId = useRef<string | null>(null);
  const isAuditionCandidate = isAuditionCandidateRole(roles.map((role) => role.role));

  const steps = useMemo<TourStep[]>(() => {
    const baseSteps: TourStep[] = [
      {
        id: "welcome",
        route: "/",
        title: "Welcome to Worship Leader's Resource",
        description:
          "This quick tour shows the parts of the app you'll use most often so new volunteers can get oriented fast.",
      },
      {
        id: "profile-menu",
        route: "/",
        target: '[data-tour="home-profile-badge"]',
        title: "Your profile menu",
        description:
          "Tap your initials anytime to get to your profile, schedule, library links, and sign out.",
      },
      {
        id: "calendar-nav",
        route: "/",
        target: '[data-tour="nav-calendar"]',
        title: "Calendar is your schedule hub",
        description:
          "Use Calendar to see when you're serving, open a date for details, and manage swap activity.",
      },
      {
        id: "calendar-grid",
        route: "/calendar",
        target: '[data-tour="calendar-grid"]',
        title: "Open any service date",
        description:
          "Tap a highlighted date to open that day's details, see your team assignment, and view the set for that service.",
      },
      {
        id: "swap-help",
        route: "/calendar",
        target: '[data-tour="calendar-page"]',
        title: "How to request a swap",
        description:
          "From Calendar, open one of your scheduled dates and tap Swap in the service card. That starts a request so someone else can cover or trade with you.",
      },
    ];

    if (!isAuditionCandidate) {
      baseSteps.splice(2, 0, {
        id: "setlists-nav",
        route: "/",
        target: '[data-tour="nav-setlists"]',
        title: "Setlists live here",
        description:
          "Setlists is where you review upcoming songs, charts, notes, and rehearsal details for services you've been assigned to.",
      });
    }

    if (isSupported && !isSubscribed) {
      baseSteps.splice(2, 0, {
        id: "push-notifications",
        route: "/dashboard",
        target: '[data-tour="push-notifications-banner"]',
        title: "Turn on push notifications",
        description:
          "Enable push notifications so you get alerted about swap requests, new setlists, and schedule changes even when the app is closed.",
      });
    }

    return baseSteps;
  }, [isAuditionCandidate, isSubscribed, isSupported]);

  useEffect(() => {
    if (user) {
      return;
    }

    startedForUserId.current = null;
    setIsOpen(false);
  }, [user]);

  useEffect(() => {
    if (!user || isLoading || hasCompletedOnboarding !== false) {
      return;
    }

    if (location.pathname === "/auth" || location.pathname === "/privacy" || location.pathname === "/terms") {
      return;
    }

    if (startedForUserId.current === user.id) {
      return;
    }

    startedForUserId.current = user.id;
    setActiveStepIndex(0);
    setIsOpen(true);
  }, [hasCompletedOnboarding, isLoading, location.pathname, user]);

  const step = steps[activeStepIndex];

  useEffect(() => {
    if (!isOpen || !step || location.pathname === step.route) {
      return;
    }

    navigate(step.route, { replace: true });
  }, [isOpen, location.pathname, navigate, step]);

  useEffect(() => {
    if (!isOpen || !step) {
      setTargetRect(null);
      return;
    }

    let frameId = 0;

    const updateTargetRect = () => {
      if (!step.target) {
        setTargetRect(null);
        return;
      }

      const target = document.querySelector(step.target) as HTMLElement | null;
      if (!target) {
        setTargetRect(null);
        return;
      }

      const rect = target.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        setTargetRect(null);
        return;
      }

      setTargetRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });
    };

    const refresh = () => {
      cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(updateTargetRect);
    };

    refresh();
    window.addEventListener("resize", refresh);
    window.addEventListener("scroll", refresh, true);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", refresh);
      window.removeEventListener("scroll", refresh, true);
    };
  }, [isOpen, step]);

  if (!user || !isOpen || !step) {
    return null;
  }

  const dismissTour = async () => {
    try {
      await completeOnboarding.mutateAsync(user.id);
      setIsOpen(false);
    } catch {
      // The mutation hook surfaces the failure via toast.
    }
  };

  const handleNext = () => {
    if (activeStepIndex >= steps.length - 1) {
      void dismissTour();
      return;
    }

    setActiveStepIndex((current) => current + 1);
  };

  const handleBack = () => {
    setActiveStepIndex((current) => Math.max(0, current - 1));
  };

  const highlightPadding = 10;
  const highlightRect = targetRect
    ? {
        top: targetRect.top - highlightPadding,
        left: targetRect.left - highlightPadding,
        width: targetRect.width + highlightPadding * 2,
        height: targetRect.height + highlightPadding * 2,
      }
    : null;

  const cardWidth = Math.min(360, window.innerWidth - 24);
  const prefersTopPlacement = !!highlightRect && highlightRect.top > window.innerHeight * 0.5;
  const cardTop = highlightRect
    ? clamp(
        prefersTopPlacement ? highlightRect.top - 220 : highlightRect.top + highlightRect.height + 16,
        12,
        window.innerHeight - 220,
      )
    : Math.max(24, Math.round(window.innerHeight / 2 - 120));
  const cardLeft = highlightRect
    ? clamp(highlightRect.left + highlightRect.width / 2 - cardWidth / 2, 12, window.innerWidth - cardWidth - 12)
    : clamp(window.innerWidth / 2 - cardWidth / 2, 12, window.innerWidth - cardWidth - 12);

  return createPortal(
    <div className="fixed inset-0 z-[120]">
      <div className="absolute inset-0 bg-black/65" />
      {highlightRect && (
        <div
          className="pointer-events-none absolute rounded-2xl border border-sky-300/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.65)] transition-all duration-200"
          style={{
            top: highlightRect.top,
            left: highlightRect.left,
            width: highlightRect.width,
            height: highlightRect.height,
          }}
        />
      )}

      <div
        className={cn(
          "absolute rounded-2xl border border-white/10 bg-slate-950/95 p-4 text-white shadow-2xl backdrop-blur",
          "w-[min(360px,calc(100vw-24px))]",
        )}
        style={{ top: cardTop, left: cardLeft }}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sky-300">
              <Sparkles className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-[0.16em]">
                Quick Tour
              </span>
            </div>
            <h2 className="text-lg font-semibold leading-tight">{step.title}</h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void dismissTour()}
            className="h-8 w-8 shrink-0 text-white/70 hover:bg-white/10 hover:text-white"
          >
            {completeOnboarding.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
          </Button>
        </div>

        <p className="text-sm leading-6 text-white/80">{step.description}</p>

        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-xs text-white/50">
            {activeStepIndex + 1} of {steps.length}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              disabled={activeStepIndex === 0 || completeOnboarding.isPending}
              className="text-white/80 hover:bg-white/10 hover:text-white"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void dismissTour()}
              disabled={completeOnboarding.isPending}
              className="text-white/80 hover:bg-white/10 hover:text-white"
            >
              Skip
            </Button>
            <Button
              size="sm"
              onClick={handleNext}
              disabled={completeOnboarding.isPending}
              className="bg-sky-500 text-slate-950 hover:bg-sky-400"
            >
              {activeStepIndex === steps.length - 1 ? "Finish" : "Next"}
              {activeStepIndex < steps.length - 1 && <ChevronRight className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
