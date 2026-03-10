import { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { LogOut, Music2 } from "lucide-react";

interface ChartsLayoutProps {
  children: ReactNode;
}

export function ChartsLayout({ children }: ChartsLayoutProps) {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_top,_rgba(53,176,229,0.2),_transparent_35%),linear-gradient(180deg,rgba(39,116,157,0.18),transparent_35%)]" />
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link to="/setlists" className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-primary shadow-blue-glow">
              <Music2 className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Experience Music</p>
              <h1 className="text-2xl font-semibold text-foreground">Charts</h1>
            </div>
          </Link>

          <Button
            variant="outline"
            size="lg"
            className="h-12 gap-2 rounded-xl px-4 text-base"
            onClick={async () => {
              await signOut();
              navigate("/auth", { replace: true });
            }}
          >
            <LogOut className="h-5 w-5" />
            Sign out
          </Button>
        </div>
      </header>

      <main className="relative mx-auto flex w-full max-w-7xl flex-col px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
