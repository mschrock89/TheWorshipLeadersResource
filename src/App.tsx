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
import { canAuditionCandidateAccessPath, isAuditionCandidateRole } from "@/lib/access";
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
import Approvals from "./pages/Approvals";
import AdminTools from "./pages/AdminTools";
import Resources from "./pages/Resources";
import ServiceFlow from "./pages/ServiceFlow";
import DrumTech from "./pages/DrumTech";
import Bible from "./pages/Bible";
import Feed from "./pages/Feed";
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

const queryClient = new QueryClient();

// Register service worker for push notifications
if ("serviceWorker" in navigator) {
  if (import.meta.env.PROD) {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
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
  
  return (
    <div 
      className="flex flex-col"
      style={{ minHeight: '100dvh' }}
    >
      <div 
        className="flex-1"
        style={{ 
          paddingBottom: isChat 
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
};

const publicRoutes: RouteDefinition[] = [
  { path: "/", component: Home },
  { path: "/auth", component: Auth },
  { path: "/privacy", component: Privacy },
  { path: "/terms", component: Terms },
];

const protectedRoutes: RouteDefinition[] = [
  { path: "/chat", component: Chat },
  { path: "/calendar", component: Calendar },
  { path: "/schedule", component: Schedule },
  { path: "/dashboard", component: Dashboard },
  { path: "/team", component: Team },
  { path: "/team/:id", component: Profile },
  { path: "/profile", component: Profile },
  { path: "/settings/planning-center", component: PlanningCenter },
  { path: "/swaps", component: SwapRequests },
  { path: "/songs", component: Songs },
  { path: "/my-setlists", component: MySetlists },
  { path: "/set-planner", component: SetPlanner },
  { path: "/weekend-rundown", component: WeekendRundown },
  { path: "/auditions", component: Auditions },
  { path: "/set-planner/audition/:candidateId", component: AuditionSetPlanner },
  { path: "/manage-sets", component: ManageSets },
  { path: "/team-builder", component: TeamBuilder },
  { path: "/approvals", component: Approvals },
  { path: "/admin-tools", component: AdminTools },
  { path: "/resources", component: Resources },
  { path: "/feed", component: Feed },
  { path: "/drum-tech", component: DrumTech },
  { path: "/bible", component: Bible },
  { path: "/service-flow", component: ServiceFlow },
  { path: "/snake", component: Snake },
  { path: "/pong", component: Pong },
  { path: "/galaga", component: Galaga },
  { path: "/games", component: Games },
];

function AppRoutes() {
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
      <BrowserRouter>
        <AuthProvider>
          <AudioPlayerProvider>
            <MainContent>
              <AppRoutes />
            </MainContent>
            <AudioPlayerWrapper />
            <BottomNav />
            <AppOnboardingTour />
          </AudioPlayerProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
