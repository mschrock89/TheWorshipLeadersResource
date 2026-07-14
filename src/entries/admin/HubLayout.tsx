import { NavLink, useNavigate } from "react-router-dom";
import { Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { canAccessHub } from "@/lib/hubAccess";
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

function HubNavLink({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
          isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
        }`
      }
    >
      {label}
    </NavLink>
  );
}

export function HubLayout({ children }: { children: ReactNode }) {
  const { user, isLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const { data: roles = [], isLoading: rolesLoading } = useUserRoles(user?.id);
  const roleNames = roles.map((r) => r.role);

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

  if (!canAccessHub(roleNames)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <h1 className="text-xl font-semibold">My Church Resource</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          The hub is available to organization admins and ministry leaders. If you think you should
          have access, ask your admin to update your role.
        </p>
        <Button
          variant="outline"
          onClick={async () => {
            await signOut();
            navigate("/auth");
          }}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-3 sm:gap-4">
          <div className="flex min-w-0 items-center gap-2 sm:gap-6">
            <span className="hidden text-sm font-bold tracking-wide sm:inline">My Church Resource</span>
            <nav className="flex items-center gap-1">
              <HubNavLink to="/" label="Dashboard" />
              <HubNavLink to="/directory" label="Directory" />
            </nav>
          </div>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Sign out"
            onClick={async () => {
              await signOut();
              navigate("/auth");
            }}
          >
            <LogOut className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
