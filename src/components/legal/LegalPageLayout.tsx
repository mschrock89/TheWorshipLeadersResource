import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import emLogo from "@/assets/em-logo-transparent-new.png";

interface LegalPageLayoutProps {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}

export function LegalPageLayout({ title, lastUpdated, children }: LegalPageLayoutProps) {
  useEffect(() => {
    document.title = title;
  }, [title]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-background to-background" />
        <div className="relative mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-6">
          <Link to="/" className="flex items-center gap-3">
            <img src={emLogo} alt="Experience Music" className="h-12 w-12 object-contain" />
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.3em] text-muted-foreground">
                Experience Music
              </p>
              <p className="text-lg font-semibold">Worship Leader&apos;s Resource</p>
            </div>
          </Link>

          <Button asChild variant="outline">
            <Link to="/">Back to Home</Link>
          </Button>
        </div>
      </div>

      <main className="mx-auto max-w-4xl px-6 py-10 sm:py-14">
        <header className="mb-10 space-y-3">
          <p className="text-sm font-medium uppercase tracking-[0.3em] text-primary">Legal</p>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{title}</h1>
          <p className="text-sm text-muted-foreground">Last updated: {lastUpdated}</p>
        </header>

        <div className="space-y-8 text-base leading-7 text-muted-foreground">
          {children}
        </div>
      </main>
    </div>
  );
}
