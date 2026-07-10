import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { getRouterBasename } from "@/lib/constants";
import Auth from "@/pages/Auth";
import NotFound from "@/pages/NotFound";
import { HubLayout } from "./HubLayout";
import HubDashboard from "./pages/HubDashboard";
import HubDirectory from "./pages/HubDirectory";

const queryClient = new QueryClient();

export function HubApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter basename={getRouterBasename()}>
          <AuthProvider>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route
                path="/"
                element={
                  <HubLayout>
                    <HubDashboard />
                  </HubLayout>
                }
              />
              <Route
                path="/directory"
                element={
                  <HubLayout>
                    <HubDirectory />
                  </HubLayout>
                }
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
