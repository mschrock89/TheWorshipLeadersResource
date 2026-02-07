import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LogIn, LayoutDashboard } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { NotificationBell } from "@/components/layout/NotificationBell";
import worshipImage from "@/assets/worship-night.jpg";
import emLogo from "@/assets/em-logo-transparent-new.png";

export default function Home() {
  const { user } = useAuth();

  return (
    <div className="flex flex-col bg-background overflow-hidden" style={{ height: '100dvh' }}>
      {/* Hero Section */}
      <section 
        className="relative h-[40vh] min-h-[280px] sm:h-[50vh] sm:min-h-[350px] lg:h-[60vh] lg:min-h-[500px] w-full overflow-hidden"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <img
          src={worshipImage}
          alt="Worship night with crowd raising hands"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-background" />
        <div className="relative z-10 flex h-full flex-col px-6 pt-8 sm:px-10 sm:pt-12">
          <div className="flex items-start justify-end gap-3">
            {user && <NotificationBell />}
            <Link to={user ? "/dashboard" : "/auth"}>
              {user ? (
                <Button size="icon" className="bg-white/15 backdrop-blur-md text-white shadow-lg border border-white/30 hover:bg-white/25 transition-all">
                  <LayoutDashboard className="h-5 w-5" />
                </Button>
              ) : (
              <Button className="gap-2 bg-white/15 backdrop-blur-md text-white font-semibold shadow-lg border border-white/30 hover:bg-white/25 transition-all px-6">
                  <LogIn className="h-4 w-4" />
                  Sign In
                </Button>
              )}
            </Link>
          </div>
          
          {/* Centered Logo */}
          <div className="flex flex-1 items-center justify-center">
            <div className="relative h-64 w-64 sm:h-80 sm:w-80 lg:h-96 lg:w-96">
              <img
                src={emLogo}
                alt="Experience Music Logo"
                className="h-full w-full object-contain"
                style={{ 
                  filter: "drop-shadow(0 10px 24px rgba(0,0,0,0.35))"
                }}
              />
              {/* Glassy shimmer overlay */}
              <div 
                className="absolute inset-0 animate-shimmer pointer-events-none"
                style={{
                  background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%)",
                  backgroundSize: "200% 100%",
                  mixBlendMode: "overlay",
                  WebkitMaskImage: `url(${emLogo})`,
                  maskImage: `url(${emLogo})`,
                  WebkitMaskSize: "contain",
                  maskSize: "contain",
                  WebkitMaskRepeat: "no-repeat",
                  maskRepeat: "no-repeat",
                  WebkitMaskPosition: "center",
                  maskPosition: "center"
                }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="flex-1 px-6 py-16">
        <div className="mx-auto max-w-4xl text-center">
          <p className="mb-3 text-sm font-medium uppercase tracking-widest text-muted-foreground">
            Experience Music
          </p>
          <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            <span className="text-gradient-blue">Worship Leader's</span>
            <br />
            <span className="text-foreground">Resource</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Your central hub for team schedules, resources, and collaboration.
          </p>
        </div>
      </section>
    </div>
  );
}
