import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { getRouterBasename } from "@/lib/resourceApps";
import Auth from "@/pages/Auth";
import NotFound from "@/pages/NotFound";
import { Loader2 } from "lucide-react";
import { HubLayout } from "./HubLayout";

const HubDashboard = lazy(() => import("./pages/HubDashboard"));
const HubDirectory = lazy(() => import("./pages/HubDirectory"));
const Toaster = lazy(() => import("@/components/ui/toaster").then((module) => ({ default: module.Toaster })));
const Sonner = lazy(() => import("@/components/ui/sonner").then((module) => ({ default: module.Toaster })));

const queryClient = new QueryClient();

export function HubApp() {
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
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route
                path="/"
                element={
                  <HubLayout>
                    <Suspense fallback={<Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />}>
                      <HubDashboard />
                    </Suspense>
                  </HubLayout>
                }
              />
              <Route
                path="/directory"
                element={
                  <HubLayout>
                    <Suspense fallback={<Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />}>
                      <HubDirectory />
                    </Suspense>
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
