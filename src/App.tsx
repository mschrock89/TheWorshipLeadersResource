import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
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
import Auth from "./pages/Auth";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import Team from "./pages/Team";
import Profile from "./pages/Profile";
import Chat from "./pages/Chat";
import Calendar from "./pages/Calendar";
import Schedule from "./pages/Schedule";
import PlanningCenter from "./pages/PlanningCenter";
import SwapRequests from "./pages/SwapRequests";
import Songs from "./pages/Songs";
import SetPlanner from "./pages/SetPlanner";
import AuditionSetPlanner from "./pages/AuditionSetPlanner";
import Auditions from "./pages/Auditions";
import ManageSets from "./pages/ManageSets";
import MySetlists from "./pages/MySetlists";
import TeamBuilder from "./pages/TeamBuilder";
import LifeGroups from "./pages/LifeGroups";
import Approvals from "./pages/Approvals";
import AdminTools from "./pages/AdminTools";
import Resources from "./pages/Resources";
import ServiceFlow from "./pages/ServiceFlow";
import DrumTech from "./pages/DrumTech";
import Bible from "./pages/Bible";
import Feed from "./pages/Feed";
import Attendance from "./pages/Attendance";
import Snake from "./pages/Snake";
import Pong from "./pages/Pong";
import Galaga from "./pages/Galaga";
import Games from "./pages/Games";
import WeekendRundown from "./pages/WeekendRundown";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import NotFound from "./pages/NotFound";
import { Loader2 } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { getRouterBasename } from "@/lib/constants";
import { isCurrentStudentResourceApp } from "@/lib/resourceApp";

const queryClient = new QueryClient();

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
  return <AnimatedPage>{children}</AnimatedPage>;
}

function ProtectedPage({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute>
      <ProtectedLayout>
        <AnimatedPage>{children}</AnimatedPage>
      </ProtectedLayout>
    </ProtectedRoute>
  );
}

function AnimatedPage({ children }: { children: React.ReactNode }) {
  return (
    <div className="animate-fade-in">
      {children}
    </div>
  );
}

// Wrapper component to conditionally apply padding based on route
function MainContent({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const isChat = location.pathname === '/chat';
  const isHome = location.pathname === '/';
  
  return (
    <div 
      className="flex flex-col"
      style={{ minHeight: '100dvh' }}
    >
      <div 
        className="flex-1"
        style={{ 
          paddingBottom: isChat || isHome
            ? '0px' 
            : 'calc(80px + env(safe-area-inset-bottom, 0px))' 
        }}
      >
        {children}
      </div>
    </div>
  );
}

type RouteDefinition = {
  path: string;
  component: ComponentType;
  hideInStudentApps?: boolean;
  studentAppOnly?: boolean;
  hideForStudentBaseRole?: boolean;
};

const publicRoutes: RouteDefinition[] = [
  { path: "/", component: Home },
  { path: "/auth", component: Auth },
  { path: "/privacy", component: Privacy },
  { path: "/terms", component: Terms },
];

const protectedRoutes: RouteDefinition[] = [
  { path: "/chat", component: Chat, hideForStudentBaseRole: true },
  { path: "/calendar", component: Calendar },
  { path: "/schedule", component: Schedule },
  { path: "/dashboard", component: Dashboard, hideForStudentBaseRole: true },
  { path: "/team", component: Team, hideForStudentBaseRole: true },
  { path: "/team/:id", component: Profile, hideForStudentBaseRole: true },
  { path: "/profile", component: Profile },
  { path: "/settings/planning-center", component: PlanningCenter, hideForStudentBaseRole: true },
  { path: "/swaps", component: SwapRequests, hideForStudentBaseRole: true },
  { path: "/songs", component: Songs, hideInStudentApps: true, hideForStudentBaseRole: true },
  { path: "/my-setlists", component: MySetlists },
  { path: "/set-planner", component: SetPlanner, hideForStudentBaseRole: true },
  { path: "/weekend-rundown", component: WeekendRundown, hideForStudentBaseRole: true },
  { path: "/auditions", component: Auditions, hideForStudentBaseRole: true },
  { path: "/set-planner/audition/:candidateId", component: AuditionSetPlanner, hideForStudentBaseRole: true },
  { path: "/manage-sets", component: ManageSets, hideForStudentBaseRole: true },
  { path: "/team-builder", component: TeamBuilder, hideForStudentBaseRole: true },
  { path: "/life-groups", component: LifeGroups, hideForStudentBaseRole: true },
  { path: "/approvals", component: Approvals, hideForStudentBaseRole: true },
  { path: "/admin-tools", component: AdminTools, hideForStudentBaseRole: true },
  { path: "/resources", component: Resources },
  { path: "/feed", component: Feed },
  { path: "/attendance", component: Attendance, studentAppOnly: true },
  { path: "/drum-tech", component: DrumTech, hideForStudentBaseRole: true },
  { path: "/bible", component: Bible },
  { path: "/service-flow", component: ServiceFlow, hideForStudentBaseRole: true },
  { path: "/snake", component: Snake, hideForStudentBaseRole: true },
  { path: "/pong", component: Pong, hideForStudentBaseRole: true },
  { path: "/galaga", component: Galaga, hideForStudentBaseRole: true },
  { path: "/games", component: Games, hideForStudentBaseRole: true },
];

function AppRoutes() {
  const isStudentApp = isCurrentStudentResourceApp();
  const availableProtectedRoutes = protectedRoutes.filter((route) => {
    if (isStudentApp && route.hideInStudentApps) return false;
    if (!isStudentApp && route.studentAppOnly) return false;
    return true;
  });

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
      {availableProtectedRoutes.map(({ path, component: Component }) => (
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
            <NotFound />
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

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter basename={getRouterBasename()}>
        <AuthProvider>
          <AttendanceTrackingProvider>
            <AudioPlayerProvider>
              <MainContent>
                <AppRoutes />
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

export default App;
