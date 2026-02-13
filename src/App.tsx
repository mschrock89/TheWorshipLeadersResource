import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { BottomNav } from "@/components/layout/BottomNav";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
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
import ManageSets from "./pages/ManageSets";
import MySetlists from "./pages/MySetlists";
import TeamBuilder from "./pages/TeamBuilder";
import Approvals from "./pages/Approvals";
import AdminTools from "./pages/AdminTools";
import Resources from "./pages/Resources";
import ServiceFlow from "./pages/ServiceFlow";
import NotFound from "./pages/NotFound";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

// Register service worker for push notifications
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch((error) => {
    console.error("Service worker registration failed:", error);
  });
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

function AppRoutes() {
  return (
    <Routes>
      {/* Public routes - no header */}
      <Route path="/" element={<AnimatedPage><Home /></AnimatedPage>} />
      <Route path="/auth" element={<AnimatedPage><Auth /></AnimatedPage>} />
      
      {/* Protected routes with MainHeader */}
      <Route
        path="/chat"
        element={
          <ProtectedRoute>
            <ProtectedLayout>
              <AnimatedPage><Chat /></AnimatedPage>
            </ProtectedLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/calendar"
        element={
          <ProtectedRoute>
            <ProtectedLayout>
              <AnimatedPage><Calendar /></AnimatedPage>
            </ProtectedLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/schedule"
        element={
          <ProtectedRoute>
            <ProtectedLayout>
              <AnimatedPage><Schedule /></AnimatedPage>
            </ProtectedLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <ProtectedLayout>
              <AnimatedPage><Dashboard /></AnimatedPage>
            </ProtectedLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/team"
        element={
          <ProtectedRoute>
            <ProtectedLayout>
              <AnimatedPage><Team /></AnimatedPage>
            </ProtectedLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/team/:id"
        element={
          <ProtectedRoute>
            <ProtectedLayout>
              <AnimatedPage><Profile /></AnimatedPage>
            </ProtectedLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <ProtectedLayout>
              <AnimatedPage><Profile /></AnimatedPage>
            </ProtectedLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/planning-center"
        element={
          <ProtectedRoute>
            <ProtectedLayout>
              <AnimatedPage><PlanningCenter /></AnimatedPage>
            </ProtectedLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/swaps"
        element={
          <ProtectedRoute>
            <ProtectedLayout>
              <AnimatedPage><SwapRequests /></AnimatedPage>
            </ProtectedLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/songs"
        element={
          <ProtectedRoute>
            <ProtectedLayout>
              <AnimatedPage><Songs /></AnimatedPage>
            </ProtectedLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/my-setlists"
        element={
          <ProtectedRoute>
            <ProtectedLayout>
              <AnimatedPage><MySetlists /></AnimatedPage>
            </ProtectedLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/set-planner"
        element={
          <ProtectedRoute>
            <ProtectedLayout>
              <AnimatedPage><SetPlanner /></AnimatedPage>
            </ProtectedLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/set-planner/audition/:candidateId"
        element={
          <ProtectedRoute>
            <ProtectedLayout>
              <AnimatedPage><AuditionSetPlanner /></AnimatedPage>
            </ProtectedLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/manage-sets"
        element={
          <ProtectedRoute>
            <ProtectedLayout>
              <AnimatedPage><ManageSets /></AnimatedPage>
            </ProtectedLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/team-builder"
        element={
          <ProtectedRoute>
            <ProtectedLayout>
              <AnimatedPage><TeamBuilder /></AnimatedPage>
            </ProtectedLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/approvals"
        element={
          <ProtectedRoute>
            <ProtectedLayout>
              <AnimatedPage><Approvals /></AnimatedPage>
            </ProtectedLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin-tools"
        element={
          <ProtectedRoute>
            <ProtectedLayout>
              <AnimatedPage><AdminTools /></AnimatedPage>
            </ProtectedLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/resources"
        element={
          <ProtectedRoute>
            <ProtectedLayout>
              <AnimatedPage><Resources /></AnimatedPage>
            </ProtectedLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/service-flow"
        element={
          <ProtectedRoute>
            <ProtectedLayout>
              <AnimatedPage><ServiceFlow /></AnimatedPage>
            </ProtectedLayout>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<AnimatedPage><NotFound /></AnimatedPage>} />
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
          </AudioPlayerProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
