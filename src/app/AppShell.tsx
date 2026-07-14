import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { BottomNav } from "@/components/layout/BottomNav";
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
import { lazy, Suspense, useLayoutEffect, useRef } from "react";
import { getRouterBasename } from "@/lib/resourceApps";

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

function AppFrame({ children }: { children: React.ReactNode }) {
  const frameRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;

    let cancelled = false;
    let rafId = 0;

    // Match the visible viewport exactly — never screen.height (clips the nav)
    // and never a short layout viewport (leaves a gap under the nav).
    const sync = () => {
      if (cancelled) return;
      const vv = window.visualViewport;
      if (vv) {
        el.style.top = `${Math.round(vv.offsetTop)}px`;
        el.style.height = `${Math.round(vv.height)}px`;
        el.style.bottom = "auto";
      } else {
        el.style.top = "0px";
        el.style.height = `${window.innerHeight}px`;
        el.style.bottom = "auto";
      }
    };

    const schedule = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(sync);
    };

    sync();
    schedule();

    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    window.addEventListener("pageshow", schedule);
    window.addEventListener("orientationchange", schedule);

    return () => {
      cancelled = true;
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("pageshow", schedule);
      window.removeEventListener("orientationchange", schedule);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div ref={frameRef} className="app-frame">
      <div className="app-frame-content">{children}</div>
      <BottomNav />
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
                <AppFrame>
                  <AppRoutes
                    publicRoutes={publicRoutes}
                    protectedRoutes={protectedRoutes}
                    notFound={notFound}
                  />
                </AppFrame>
                <AudioPlayerWrapper />
                <AppOnboardingTour />
              </AudioPlayerProvider>
            </AttendanceTrackingProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
