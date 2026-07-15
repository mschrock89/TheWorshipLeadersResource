import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { BottomNav, BOTTOM_NAV_HIDDEN_ROUTES } from "@/components/layout/BottomNav";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { AppOnboardingTour } from "@/components/onboarding/AppOnboardingTour";
import { AudioPlayerProvider, useAudioPlayerSafe } from "@/hooks/useAudioPlayer";
import { AttendanceTrackingProvider } from "@/components/attendance/AttendanceTrackingProvider";
import {
  canAuditionCandidateAccessPath,
  canStudentBaseRoleAccessPath,
  isAuditionCandidateRole,
  isStudentBaseRole,
} from "@/lib/access";
import { MiniPlayer } from "@/components/audio/MiniPlayer";
import { AudioPlayer } from "@/components/audio/AudioPlayer";
import { Loader2 } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { lazy, Suspense, useEffect } from "react";
import { getRouterBasename } from "@/lib/resourceApps";

/**
 * iOS standalone PWAs paint the first frame with a layout viewport shorter than
 * the screen, so the `fixed bottom-0` nav floats above the true bottom over a
 * dark band (the native manifest background). The viewport height corrects itself
 * within a second or two, but the fixed nav is not re-laid-out against the new
 * height until *something* forces a reflow — which on the home screen doesn't
 * happen until the user navigates (that's why going to another page snaps the nav
 * down). Fixed elements anchor to iOS's layout viewport, and that viewport only
 * re-syncs on a REAL scroll or a navigation — a composited transform or a passive
 * reflow won't move it. So mimic the scroll: briefly make the document scrollable,
 * commit a real scroll, then restore. Run it a few times over the first ~1.5s (the
 * viewport can take a few hundred ms to settle) and again on bfcache restore, then
 * stop so nothing here touches scrolling during normal use. Guarded to only fire at
 * scroll-top with no input focused. Standalone-only; a no-op on Safari/desktop.
 */
function useStandaloneColdStartSettle() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches === true ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!isStandalone) return;

    let stopped = false;
    let running = false;
    const settle = () => {
      if (stopped || running) return;
      // Don't disturb a user who is already scrolling or typing.
      if (window.scrollY > 0) return;
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
      // Fixed elements anchor to iOS's layout viewport, which stays short after a
      // standalone cold launch until a REAL scroll (or a navigation) syncs it. A
      // composited transform or a passive reflow won't do it. So make the document
      // genuinely scrollable, commit a real scroll, then restore.
      running = true;
      const html = document.documentElement;
      const prevMinHeight = html.style.minHeight;
      html.style.minHeight = `${window.innerHeight + 400}px`;
      window.scrollTo(0, 60);
      window.setTimeout(() => {
        window.scrollTo(0, 0);
        html.style.minHeight = prevMinHeight;
        running = false;
      }, 40);
    };

    const timers = [120, 450, 900, 1500].map((delay) => window.setTimeout(settle, delay));
    window.addEventListener("pageshow", settle);

    const stopTimer = window.setTimeout(() => {
      stopped = true;
      window.removeEventListener("pageshow", settle);
    }, 4000);

    return () => {
      stopped = true;
      timers.forEach((id) => window.clearTimeout(id));
      window.clearTimeout(stopTimer);
      window.removeEventListener("pageshow", settle);
    };
  }, []);
}

export type RouteDefinition = {
  path: string;
  component: ComponentType;
};

const queryClient = new QueryClient();
const Toaster = lazy(() => import("@/components/ui/toaster").then((module) => ({ default: module.Toaster })));
const Sonner = lazy(() => import("@/components/ui/sonner").then((module) => ({ default: module.Toaster })));

function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

// Register service worker for push notifications
if ("serviceWorker" in navigator) {
  if (import.meta.env.PROD) {
    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((registration) => registration.update())
      .catch((error) => {
        console.error("Service worker registration failed:", error);
      });
  }
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  const { data: roles = [], isLoading: rolesLoading } = useUserRoles(user?.id);
  const roleNames = roles.map((r) => r.role);
  const isAuditionCandidate = isAuditionCandidateRole(roleNames);
  const isStudentBase = isStudentBaseRole(roleNames);

  if (isLoading || (user && rolesLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (isAuditionCandidate && !canAuditionCandidateAccessPath(location.pathname)) {
    return <Navigate to="/calendar" replace />;
  }

  if (isStudentBase && !isAuditionCandidate && !canStudentBaseRoleAccessPath(location.pathname)) {
    return <Navigate to="/feed" replace />;
  }

  return <>{children}</>;
}

function PublicPage({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<RouteFallback />}>
      <AnimatedPage>{children}</AnimatedPage>
    </Suspense>
  );
}

function ProtectedPage({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute>
      <ProtectedLayout>
        <Suspense fallback={<RouteFallback />}>
          <AnimatedPage>{children}</AnimatedPage>
        </Suspense>
      </ProtectedLayout>
    </ProtectedRoute>
  );
}

function AnimatedPage({ children }: { children: React.ReactNode }) {
  return <div className="animate-fade-in h-full min-h-full">{children}</div>;
}

// Natural document flow with a full-height content column; the bottom nav is a
// fixed sibling (see AppShell) that pins to the visible bottom via pb-safe.
function MainContent({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const hideNav = BOTTOM_NAV_HIDDEN_ROUTES.has(location.pathname);
  // Home fills the viewport itself (its own hero/flex layout) and hides nothing
  // behind the fixed nav, so it must not reserve the nav's bottom band — doing so
  // leaves a dead strip above the tab bar.
  const isHome = location.pathname === "/";

  return (
    <div className="flex flex-col" style={{ minHeight: "100dvh" }}>
      <div
        className="flex-1"
        style={{
          paddingBottom:
            hideNav || isHome ? "0px" : "calc(80px + env(safe-area-inset-bottom, 0px))",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function AppRoutes({
  publicRoutes,
  protectedRoutes,
  notFound: NotFoundComponent,
}: {
  publicRoutes: RouteDefinition[];
  protectedRoutes: RouteDefinition[];
  notFound: ComponentType;
}) {
  return (
    <Routes>
      {publicRoutes.map(({ path, component: Component }) => (
        <Route
          key={path}
          path={path}
          element={
            <PublicPage>
              <Component />
            </PublicPage>
          }
        />
      ))}
      <Route path="/planning-center" element={<Navigate to="/settings/planning-center" replace />} />
      {protectedRoutes.map(({ path, component: Component }) => (
        <Route
          key={path}
          path={path}
          element={
            <ProtectedPage>
              <Component />
            </ProtectedPage>
          }
        />
      ))}
      <Route
        path="*"
        element={
          <PublicPage>
            <NotFoundComponent />
          </PublicPage>
        }
      />
    </Routes>
  );
}

function AudioPlayerWrapper() {
  const context = useAudioPlayerSafe();

  if (!context || !context.currentTrack) return null;

  return (
    <>
      {context.isExpanded ? <AudioPlayer /> : <MiniPlayer />}
    </>
  );
}

export function AppShell({
  publicRoutes,
  protectedRoutes,
  notFound,
}: {
  publicRoutes: RouteDefinition[];
  protectedRoutes: RouteDefinition[];
  notFound: ComponentType;
}) {
  useStandaloneColdStartSettle();

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Suspense fallback={null}>
          <Toaster />
          <Sonner />
        </Suspense>
        <BrowserRouter
          basename={getRouterBasename()}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <AuthProvider>
            <AttendanceTrackingProvider>
              <AudioPlayerProvider>
                <MainContent>
                  <AppRoutes
                    publicRoutes={publicRoutes}
                    protectedRoutes={protectedRoutes}
                    notFound={notFound}
                  />
                </MainContent>
                <AudioPlayerWrapper />
                <BottomNav />
                <AppOnboardingTour />
              </AudioPlayerProvider>
            </AttendanceTrackingProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
