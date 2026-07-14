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
  Settings,
  Users,
  Wrench,
  ArrowLeftRight,
  BookOpen,
  ListMusic,
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
import { useDrumTechAccess } from "@/hooks/useDrumTech";
import { usePendingSwapRequestsCount } from "@/hooks/useSwapRequests";
import { isAuditionCandidateRole, isStudentBaseRole } from "@/lib/access";
import {
  getResourceAppForLocation,
  STUDENT_RESOURCE_APP_KEYS,
  type ResourceAppKey,
} from "@/lib/resourceApps";
import { isStudentResourceAppKey } from "@/lib/resourceApp";
import worshipImage from "@/assets/worship-night.jpg";
import emLogo from "@/assets/em-logo-transparent-new.png";
import studentHomeImage from "@/assets/experience-students-home.jpg";

type HomePageConfig = {
  eyebrow?: string;
  titleLines: string[];
  description: string;
  titleClassName: string;
  titleAccentClassName: string;
  descriptionClassName: string;
  heroImage?: string;
  heroAlt?: string;
  heroBackground: string;
  heroOverlay?: string;
  mobileObjectPosition?: string;
  logo?: {
    src: string;
    alt: string;
    className: string;
  };
};

const homePageConfigs: Record<"worship" | "students", HomePageConfig> = {
  worship: {
    eyebrow: "Experience Music",
    titleLines: ["Church Resource"],
    description: "Your central hub for team schedules, resources, and collaboration.",
    titleClassName: "text-4xl sm:text-5xl lg:text-6xl",
    titleAccentClassName: "text-gradient-blue",
    descriptionClassName: "text-lg",
    heroImage: worshipImage,
    heroAlt: "Worship night with crowd raising hands",
    heroBackground: "bg-background",
    heroOverlay: "bg-gradient-to-b from-black/40 via-black/20 to-background",
    mobileObjectPosition: "object-center",
    logo: {
      src: emLogo,
      alt: "Experience Music Logo",
      className: "h-64 w-64 sm:h-80 sm:w-80 lg:h-96 lg:w-96",
    },
  },
  students: {
    titleLines: ["Experience Students", "Resource"],
    description: "Your central hub for student ministry follow-up, next steps, and connection.",
    titleClassName: "text-4xl sm:text-5xl lg:text-6xl",
    titleAccentClassName: "text-gradient-blue",
    descriptionClassName: "text-lg",
    heroImage: studentHomeImage,
    heroAlt: "Experience Students",
    heroBackground: "",
    mobileObjectPosition: "object-[center_29%]",
  },
};

function getHomePageVariant(resourceAppKey: ResourceAppKey) {
  return STUDENT_RESOURCE_APP_KEYS.includes(resourceAppKey) ? "students" : "worship";
}

const studentsHomeBackgroundStyle = {
  background:
    "radial-gradient(ellipse at 74% 2%, rgba(255, 190, 45, 0.98) 0%, rgba(255, 154, 35, 0.74) 36%, transparent 62%), linear-gradient(115deg, #ff2532 0%, #fa4b2d 28%, #f97931 56%, #ffac28 100%)",
};

export default function Home() {
  const { user, signOut } = useAuth();
  const { data: profile } = useProfile(user?.id);
  const { data: roles = [] } = useUserRoles(user?.id);
  const { data: isApprover } = useIsApprover();
  const { data: pendingApprovalCount } = usePendingApprovalCount();
  const { data: pendingSwaps = 0 } = usePendingSwapRequestsCount();
  const drumTechAccess = useDrumTechAccess();
  const roleNames = roles.map((role) => role.role);
  const isAuditionCandidate = isAuditionCandidateRole(roleNames);
  const isStudentBase = isStudentBaseRole(roleNames);

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
  const activeResourceApp = getResourceAppForLocation();
  const homeVariant = getHomePageVariant(activeResourceApp.key);
  const homeConfig = homePageConfigs[homeVariant];
  const isStudentsHome = homeVariant === "students";
  const isStudentApp = isStudentResourceAppKey(activeResourceApp.key);
  const hasHeroImage = Boolean(homeConfig.heroImage);

  return (
    <div
      className="app-home-screen relative flex flex-col overflow-hidden bg-background"
      style={isStudentsHome ? studentsHomeBackgroundStyle : undefined}
    >
      {isStudentsHome && homeConfig.heroImage && (
        <img
          src={homeConfig.heroImage}
          alt={homeConfig.heroAlt}
          className={`absolute left-1/2 top-0 z-0 h-full w-full max-w-none -translate-x-1/2 object-cover sm:w-auto sm:object-contain sm:[-webkit-mask-image:linear-gradient(to_right,transparent,black_18%,black_82%,transparent)] sm:[mask-image:linear-gradient(to_right,transparent,black_18%,black_82%,transparent)] ${homeConfig.mobileObjectPosition ?? ""}`}
        />
      )}
      <section
        className={`relative z-10 w-full overflow-hidden ${homeConfig.heroBackground} ${
          isStudentsHome
            ? "h-[54vh] min-h-[430px] sm:h-[56vh] sm:min-h-[470px] lg:h-[64vh] lg:min-h-[560px]"
            : hasHeroImage
            ? "h-[40vh] min-h-[280px] sm:h-[50vh] sm:min-h-[350px] lg:h-[60vh] lg:min-h-[500px]"
            : "min-h-20"
        }`}
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        {homeConfig.heroImage && !isStudentsHome && (
          <img
            src={homeConfig.heroImage}
            alt={homeConfig.heroAlt}
            className={`absolute inset-0 h-full w-full object-cover ${homeConfig.mobileObjectPosition ?? ""}`}
          />
        )}
        {homeConfig.heroOverlay && <div className={`absolute inset-0 ${homeConfig.heroOverlay}`} />}
        <div className="relative z-10 flex h-full flex-col px-6 pt-8 sm:px-10 sm:pt-12">
          <div className="flex items-start justify-end gap-3">
            {user && !isStudentBase && <NotificationBell />}
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
                  {!isAuditionCandidate && !isStudentBase && (
                    <DropdownMenuItem asChild>
                      <Link to="/dashboard" className="flex items-center gap-2">
                        <LayoutDashboard className="h-4 w-4" />
                        Dashboard
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {!isAuditionCandidate && !isStudentBase && (
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
                  {!isAuditionCandidate && !isStudentBase && (
                    <DropdownMenuItem asChild>
                      <Link to="/swaps" className="flex items-center gap-2">
                        <ArrowLeftRight className="h-4 w-4" />
                        Swaps
                        {pendingSwaps > 0 && (
                          <Badge variant="destructive" className="ml-auto h-5 min-w-5 px-1.5 text-xs">
                            {pendingSwaps > 99 ? "99+" : pendingSwaps}
                          </Badge>
                        )}
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {isStudentBase && (
                    <DropdownMenuItem asChild>
                      <Link to="/bible" className="flex items-center gap-2">
                        <BookOpen className="h-4 w-4" />
                        Bible
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {!isStudentApp && (
                    <DropdownMenuItem asChild>
                      <Link to="/songs" className="flex items-center gap-2">
                        <FolderOpen className="h-4 w-4" />
                        Song Library
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem asChild>
                    <Link to="/resources" className="flex items-center gap-2">
                      <Music className="h-4 w-4" />
                      Audio Library
                    </Link>
                  </DropdownMenuItem>
                  {isStudentBase && (
                    <DropdownMenuItem asChild>
                      <Link to="/my-setlists" className="flex items-center gap-2">
                        <ListMusic className="h-4 w-4" />
                        {isStudentApp ? "My Setlists" : "Setlists"}
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {!isStudentApp && !isAuditionCandidate && !isStudentBase && drumTechAccess.hasAnyAccess && (
                    <DropdownMenuItem asChild>
                      <Link to="/drum-tech" className="flex items-center gap-2">
                        <Wrench className="h-4 w-4" />
                        Drum Tech
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {!isAuditionCandidate && !isStudentBase && (
                    <DropdownMenuItem asChild>
                      <Link to="/games" className="flex items-center gap-2">
                        <Gamepad2 className="h-4 w-4" />
                        Games
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {!isAuditionCandidate && !isStudentBase && isApprover && (
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
                  {!isAuditionCandidate && !isStudentBase && (
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

          {homeConfig.logo && (
            <div className="flex flex-1 items-center justify-center">
              <div className={`relative ${homeConfig.logo.className}`}>
                <img
                  src={homeConfig.logo.src}
                  alt={homeConfig.logo.alt}
                  className="h-full w-full object-contain"
                  style={{
                    filter: "drop-shadow(0 10px 24px rgba(0,0,0,0.35))",
                  }}
                />
                <div
                  className="pointer-events-none absolute inset-0 animate-shimmer"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%)",
                    backgroundSize: "200% 100%",
                    mixBlendMode: "overlay",
                    WebkitMaskImage: `url(${homeConfig.logo.src})`,
                    maskImage: `url(${homeConfig.logo.src})`,
                    WebkitMaskSize: "contain",
                    maskSize: "contain",
                    WebkitMaskRepeat: "no-repeat",
                    maskRepeat: "no-repeat",
                    WebkitMaskPosition: "center",
                    maskPosition: "center",
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="relative z-10 flex-1 px-6 py-16">
        <div className="mx-auto w-full max-w-4xl text-center">
          {homeConfig.eyebrow && (
            <p className="mb-3 text-sm font-medium uppercase tracking-widest text-muted-foreground">
              {homeConfig.eyebrow}
            </p>
          )}
          <h1 className={`font-display font-bold tracking-tight ${homeConfig.titleClassName}`}>
            <span className={homeConfig.titleAccentClassName}>{homeConfig.titleLines[0]}</span>
            {homeConfig.titleLines[1] && (
              <>
                <br />
                <span className="text-foreground">{homeConfig.titleLines[1]}</span>
              </>
            )}
          </h1>
          <p className={`mx-auto mt-6 max-w-2xl text-muted-foreground ${homeConfig.descriptionClassName}`}>
            {homeConfig.description}
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
