import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import Auth from "@/pages/Auth";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";
import { ChartsLayout } from "@/charts/components/ChartsLayout";
import { ChartsSetlistsPage } from "@/charts/pages/ChartsSetlistsPage";
import { ChartsSetDetailPage } from "@/charts/pages/ChartsSetDetailPage";
import { ChartsViewerPage } from "@/charts/pages/ChartsViewerPage";

const queryClient = new QueryClient();
const chartsBasePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const chartsBasename = chartsBasePath === "" ? undefined : chartsBasePath;

function ChartsProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
}

export function ChartsApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <BrowserRouter basename={chartsBasename}>
            <Routes>
              <Route path="/" element={<Navigate to="/setlists" replace />} />
              <Route path="/auth" element={<Auth />} />
              <Route
                path="/setlists"
                element={
                  <ChartsProtectedRoute>
                    <ChartsLayout>
                      <ChartsSetlistsPage />
                    </ChartsLayout>
                  </ChartsProtectedRoute>
                }
              />
              <Route
                path="/setlists/:setlistId"
                element={
                  <ChartsProtectedRoute>
                    <ChartsLayout>
                      <ChartsSetDetailPage />
                    </ChartsLayout>
                  </ChartsProtectedRoute>
                }
              />
              <Route
                path="/setlists/:setlistId/songs/:songId"
                element={
                  <ChartsProtectedRoute>
                    <ChartsLayout>
                      <ChartsViewerPage />
                    </ChartsLayout>
                  </ChartsProtectedRoute>
                }
              />
              <Route path="*" element={<Navigate to="/setlists" replace />} />
            </Routes>
            <Toaster />
            <Sonner />
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
