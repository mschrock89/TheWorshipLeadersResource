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
import { NavViewportDebug } from "@/components/debug/NavViewportDebug";
import { Loader2 } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { lazy, Suspense, useEffect, useState } from "react";
import { getRouterBasename } from "@/lib/resourceApps";

function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * iOS standalone cold-launch reports a viewport ~62px short and only expands to
 * the full screen once a navigation re-lays-out the page (verified on-device:
 * innerHeight 894→956, one resize fires, and the nav then sits flush). Meta/
 * scroll nudges don't trigger it. So mimic navigation's DOM teardown: once, if
 * we launched into the short viewport, bump a key that remounts the routed page.
 * Fires at most once and only in the short-viewport standalone case, so it never
 * touches desktop, Safari, or a correctly-sized launch — and it's done long
 * before any chat/keyboard use.
 */
function useStandaloneViewportRemount(): number {
  const [key, setKey] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined" || !isStandaloneDisplay()) return;
    const screenH = window.screen?.height ?? 0;
    if (!screenH || window.innerHeight >= screenH - 4) return; // already full-size
    const t = window.setTimeout(() => setKey((k) => k + 1), 350);
    return () => window.clearTimeout(t);
  }, []);
  return key;
}

/**
 * iOS standalone cold-launch reports a viewport ~62px shorter than the screen
 * on the first route and only expands to full once a navigation makes it
 * recompute — leaving the fixed nav above the real bottom over a dark band
 * (verified on-device: innerHeight/visualViewport 894→956 after navigating).
 * Re-assert the viewport <meta> a few times over the first second: toggling
 * viewport-fit forces the same recompute a navigation triggers, so the viewport
 * fills the screen without the user having to navigate. Standalone-only, and
 * finished long before any chat/keyboard interaction so it can't affect them.
 */
function useStandaloneViewportFit() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches === true ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!standalone) return;

    const meta = document.querySelector('meta[name="viewport"]');
    if (!meta) return;
    const cover = meta.getAttribute("content") || "";
    if (!cover.includes("viewport-fit=cover")) return;
    const relaxed = cover.replace("viewport-fit=cover", "viewport-fit=auto");

    const reassert = () => {
      meta.setAttribute("content", relaxed);
      requestAnimationFrame(() => meta.setAttribute("content", cover));
    };

    const timers = [50, 200, 500, 900, 1400].map((d) => window.setTimeout(reassert, d));
    window.addEventListener("pageshow", reassert);
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      window.removeEventListener("pageshow", reassert);
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
  const remountKey = useStandaloneViewportRemount();

  return (
    <div className="flex flex-col" style={{ minHeight: "100dvh" }}>
      <div
        key={remountKey}
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
  useStandaloneViewportFit();

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
                <NavViewportDebug />
                <AppOnboardingTour />
              </AudioPlayerProvider>
            </AttendanceTrackingProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
