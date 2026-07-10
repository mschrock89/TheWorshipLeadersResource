import { AppShell } from "@/app/AppShell";
import { bootstrapApp } from "@/app/bootstrap";
import NotFound from "@/pages/NotFound";
import { protectedRoutes, publicRoutes } from "./routes";

void bootstrapApp(
  <AppShell publicRoutes={publicRoutes} protectedRoutes={protectedRoutes} notFound={NotFound} />,
);
