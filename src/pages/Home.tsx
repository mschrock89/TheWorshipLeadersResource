import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  ClipboardList,
  FileCheck,
  FolderOpen,
  Gamepad2,
  LayoutDashboard,
  Link2,
  LogIn,
  LogOut,
  Music,
  Newspaper,
  Settings,
  Users,
  Wrench,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { NotificationBell } from "@/components/layout/NotificationBell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useProfile } from "@/hooks/useProfiles";
import { useUserRoles } from "@/hooks/useUserRoles";
import { Badge } from "@/components/ui/badge";
import { useIsApprover, usePendingApprovalCount } from "@/hooks/useSetlistApprovals";
import { isAuditionCandidateRole } from "@/lib/access";
import { canAccessWeekendRundown } from "@/lib/weekendRundown";
import worshipImage from "@/assets/worship-night.jpg";
import emLogo from "@/assets/em-logo-transparent-new.png";
import { CovenantCard } from "@/components/dashboard/CovenantCard";

export default function Home() {
  const { user, signOut } = useAuth();
  const { data: profile } = useProfile(user?.id);
  const { data: roles = [] } = useUserRoles(user?.id);
  const { data: isApprover } = useIsApprover();
  const { data: pendingApprovalCount } = usePendingApprovalCount();
  const isAuditionCandidate = isAuditionCandidateRole(roles.map((role) => role.role));
  const canOpenWeekendRundown = canAccessWeekendRundown(roles.map((role) => role.role));

  const getInitials = () => {
    if (profile?.full_name) {
      const nameParts = profile.full_name.trim().split(/\s+/);
      if (nameParts.length >= 2) {
        return (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
      }

      return nameParts[0].substring(0, 2).toUpperCase();
    }

    return user?.email?.substring(0, 2).toUpperCase() || "?";
  };

  const initials = getInitials();

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
            {user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                  <button
                    data-tour="home-profile-badge"
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/30 bg-white/15 text-sm font-bold text-white shadow-lg backdrop-blur-md transition-all hover:bg-white/25"
                  >
                    {initials}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 bg-popover">
                  {!isAuditionCandidate && (
                    <DropdownMenuItem asChild>
                      <Link to="/dashboard" className="flex items-center gap-2">
                        <LayoutDashboard className="h-4 w-4" />
                        Dashboard
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {!isAuditionCandidate && (
                    <DropdownMenuItem asChild>
                      <Link to="/team" className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Team Directory
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {!isAuditionCandidate && (
                    <DropdownMenuItem asChild>
                      <Link to="/schedule" className="flex items-center gap-2">
                        <ClipboardList className="h-4 w-4" />
                        My Schedule
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem asChild>
                    <Link to="/feed" className="flex items-center gap-2">
                      <Newspaper className="h-4 w-4" />
                      The Feed
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/songs" className="flex items-center gap-2">
                      <FolderOpen className="h-4 w-4" />
                      Song Library
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/resources" className="flex items-center gap-2">
                      <Music className="h-4 w-4" />
                      Audio Library
                    </Link>
                  </DropdownMenuItem>
                  {!isAuditionCandidate && (
                    <DropdownMenuItem asChild>
                      <Link to="/drum-tech" className="flex items-center gap-2">
                        <Wrench className="h-4 w-4" />
                        Drum Tech
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {!isAuditionCandidate && canOpenWeekendRundown && (
                    <DropdownMenuItem asChild>
                      <Link to="/weekend-rundown" className="flex items-center gap-2">
                        <ClipboardList className="h-4 w-4" />
                        Weekend Rundown
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {!isAuditionCandidate && (
                    <DropdownMenuItem asChild>
                      <Link to="/games" className="flex items-center gap-2">
                        <Gamepad2 className="h-4 w-4" />
                        Games
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {!isAuditionCandidate && isApprover && (
                    <DropdownMenuItem asChild>
                      <Link to="/approvals" className="flex items-center gap-2">
                        <FileCheck className="h-4 w-4" />
                        Approvals
                        {(pendingApprovalCount ?? 0) > 0 && (
                          <Badge variant="destructive" className="ml-auto h-5 min-w-5 px-1.5 text-xs">
                            {pendingApprovalCount}
                          </Badge>
                        )}
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {!isAuditionCandidate && (
                    <DropdownMenuItem asChild>
                      <Link to="/settings/planning-center" className="flex items-center gap-2">
                        <Link2 className="h-4 w-4" />
                        Integrations
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {!isAuditionCandidate && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link to="/profile" className="flex items-center gap-2">
                          <Settings className="h-4 w-4" />
                          My Profile
                        </Link>
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={signOut} className="text-destructive">
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link to="/auth">
              <Button className="gap-2 bg-white/15 backdrop-blur-md text-white font-semibold shadow-lg border border-white/30 hover:bg-white/25 transition-all px-6">
                <LogIn className="h-4 w-4" />
                Sign In
              </Button>
              </Link>
            )}
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
          {user ? (
            <div className="mb-10 text-left">
              <CovenantCard />
            </div>
          ) : null}

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

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground/70">
            <Link to="/privacy" className="transition-colors hover:text-muted-foreground">
              Privacy Policy
            </Link>
            <Link to="/terms" className="transition-colors hover:text-muted-foreground">
              Terms of Service
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
