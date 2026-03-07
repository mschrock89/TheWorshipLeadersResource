import { useState, useMemo, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useProfiles, useUpcomingBirthdays, useUpcomingAnniversaries } from "@/hooks/useProfiles";
import { useCampuses, useUserCampuses, useProfilesWithCampuses } from "@/hooks/useCampuses";
import { QuickStats } from "@/components/dashboard/QuickStats";
import { UpcomingWidget } from "@/components/dashboard/UpcomingWidget";
import { BreakRequestWidget } from "@/components/dashboard/BreakRequestWidget";
import { VolunteerUpcomingWidget } from "@/components/dashboard/VolunteerUpcomingWidget";
import { SwapManagementWidget } from "@/components/dashboard/SwapManagementWidget";
import { SetlistConfirmationWidget } from "@/components/dashboard/SetlistConfirmationWidget";
import { RefreshableContainer } from "@/components/layout/RefreshableContainer";
import { PushNotificationBanner } from "@/components/settings/PushNotificationBanner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, ArrowRight, MapPin, Music, ListChecks, ShieldCheck } from "lucide-react";
export default function Dashboard() {
  const {
    user,
    isLeader,
    canManageTeam,
    isAdmin
  } = useAuth();

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  const {
    data: profiles = [],
    isLoading: profilesLoading
  } = useProfiles();
  const {
    data: upcomingBirthdays = [],
    isLoading: birthdaysLoading
  } = useUpcomingBirthdays();
  const {
    data: upcomingAnniversaries = [],
    isLoading: anniversariesLoading
  } = useUpcomingAnniversaries();

  // Campus selector state
  const {
    data: allCampuses = []
  } = useCampuses();
  const {
    data: userCampuses = []
  } = useUserCampuses(user?.id);
  const {
    data: profileCampusMap = {}
  } = useProfilesWithCampuses();
  const [selectedCampusId, setSelectedCampusId] = useState<string>(() => {
    return localStorage.getItem("dashboard-campus-filter") || "all";
  });

  // Persist campus selection to localStorage
  const handleCampusChange = (value: string) => {
    setSelectedCampusId(value);
    localStorage.setItem("dashboard-campus-filter", value);
  };

  // Determine which campuses to show in the selector
  const availableCampuses = isAdmin ? allCampuses : userCampuses.map(uc => uc.campuses);
  const canSelectCampus = availableCampuses.length > 1 || isAdmin;

  // Filter helper - checks if a profile belongs to the selected campus
  const belongsToCampus = useCallback((profileId: string): boolean => {
    if (selectedCampusId === "all") return true;
    const userCampusData = profileCampusMap[profileId];
    return userCampusData?.ids?.includes(selectedCampusId) ?? false;
  }, [selectedCampusId, profileCampusMap]);

  // Filtered data based on selected campus
  const filteredProfiles = useMemo(() => {
    return profiles.filter(p => belongsToCampus(p.id));
  }, [profiles, belongsToCampus]);
  const filteredBirthdays = useMemo(() => {
    return upcomingBirthdays.filter(p => belongsToCampus(p.id));
  }, [upcomingBirthdays, belongsToCampus]);
  const filteredAnniversaries = useMemo(() => {
    return upcomingAnniversaries.filter(p => belongsToCampus(p.id));
  }, [upcomingAnniversaries, belongsToCampus]);
  const firstName = user?.user_metadata?.full_name?.split(" ")[0] || user?.email?.split("@")[0] || "there";

  // Check if user is a regular volunteer (not a leader/admin)
  const isVolunteer = !canManageTeam;
  const quickActions = [
    {
      title: "Set Builder",
      description: "Plan upcoming services, shape the flow, and build song sets with confidence.",
      to: "/set-planner",
      icon: Music,
      actionLabel: "Open Set Builder",
      cardClassName: "border-cyan-400/35 bg-[linear-gradient(145deg,rgba(8,145,178,0.2),rgba(8,47,73,0.28))] text-white",
      iconClassName: "border-cyan-300/25 bg-cyan-400/15 text-cyan-100",
      buttonClassName: "bg-cyan-400 text-slate-950 hover:bg-cyan-300",
    },
    {
      title: "Team Builder",
      description: "Build balanced teams, manage rotations, and fill roles across your campus.",
      to: "/team-builder",
      icon: Users,
      actionLabel: "Open Team Builder",
      cardClassName: "border-emerald-400/35 bg-[linear-gradient(145deg,rgba(16,185,129,0.18),rgba(6,78,59,0.28))] text-white",
      iconClassName: "border-emerald-300/25 bg-emerald-400/15 text-emerald-100",
      buttonClassName: "bg-emerald-400 text-slate-950 hover:bg-emerald-300",
    },
    {
      title: "Auditions",
      description: "Track candidates, schedule evaluations, and move people through the process.",
      to: "/auditions",
      icon: ListChecks,
      actionLabel: "Open Auditions",
      cardClassName: "border-amber-400/35 bg-[linear-gradient(145deg,rgba(245,158,11,0.18),rgba(120,53,15,0.28))] text-white",
      iconClassName: "border-amber-300/25 bg-amber-400/15 text-amber-100",
      buttonClassName: "bg-amber-400 text-slate-950 hover:bg-amber-300",
    },
    ...(isAdmin
      ? [{
          title: "Admin Tools",
          description: "Handle service settings, system controls, and organization-level configuration.",
          to: "/admin-tools",
          icon: ShieldCheck,
          actionLabel: "Open Admin Tools",
          cardClassName: "border-violet-300/25 bg-[linear-gradient(145deg,rgba(71,85,105,0.34),rgba(15,23,42,0.5))] text-white",
          iconClassName: "border-slate-300/15 bg-white/10 text-slate-100",
          buttonClassName: "bg-white/12 text-white hover:bg-white/20 border border-white/15",
        }]
      : []),
  ];
  return <RefreshableContainer queryKeys={[["profiles"], ["upcoming-birthdays"], ["upcoming-anniversaries"], ["leadership-roles"], ["my-team-assignments"], ["my-scheduled-dates"], ["draft-sets"], ["swap-requests"]]}>
      {/* Push Notification Banner */}
      <PushNotificationBanner />

      {/* Welcome section with campus selector */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground md:text-4xl">
            Welcome back, <span className="text-gradient-gold">{firstName}</span>
          </h1>
          <p className="mt-2 text-muted-foreground">
            {isVolunteer ? "Here's your upcoming schedule" : "Here's what's happening with your worship team"}
          </p>
        </div>
        
        {/* Campus Selector - only for leaders */}
        {canSelectCampus && canManageTeam && <Select value={selectedCampusId} onValueChange={handleCampusChange}>
            <SelectTrigger className="w-auto min-w-[200px] max-w-[280px] bg-card border-border">
              <MapPin className="h-4 w-4 mr-2 shrink-0 text-muted-foreground" />
              <SelectValue placeholder="Select campus" />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border">
              <SelectItem value="all">All Campuses</SelectItem>
              {availableCampuses.map(campus => <SelectItem key={campus?.id} value={campus?.id || ""}>
                  {campus?.name}
                </SelectItem>)}
            </SelectContent>
          </Select>}
      </div>

      {/* Volunteer view - show upcoming weekend and song set first */}
      {isVolunteer && <section className="mb-8">
          <VolunteerUpcomingWidget />
        </section>}

      {/* Quick stats - hidden for volunteers */}
      {canManageTeam && <section className="mb-8">
          <QuickStats profiles={filteredProfiles} isLoading={profilesLoading} />
        </section>}

      {/* Quick actions - Team cards */}
      {canManageTeam && <section className="mb-8 space-y-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-xl font-semibold text-foreground">Builder Tools</h2>
              <p className="mt-1 text-muted-foreground">
                Each workspace now uses a distinct color family tied to its job.
              </p>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {quickActions.map(action => {
            const Icon = action.icon;
            return <div key={action.title} className={`group relative overflow-hidden rounded-2xl border p-6 shadow-[0_20px_60px_-40px_rgba(0,0,0,0.8)] transition-transform duration-200 hover:-translate-y-0.5 ${action.cardClassName}`}>
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.14),transparent_45%)] opacity-80" />
                  <div className="relative flex h-full flex-col gap-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className={`flex h-12 w-12 items-center justify-center rounded-xl border backdrop-blur-sm ${action.iconClassName}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h3 className="font-display text-2xl font-semibold tracking-tight">{action.title}</h3>
                      <p className="max-w-md text-sm leading-6 text-white/72">
                        {action.description}
                      </p>
                    </div>

                    <div className="mt-auto pt-2">
                      <Link to={action.to}>
                        <Button className={`gap-2 ${action.buttonClassName}`}>
                          <Icon className="h-4 w-4" />
                          {action.actionLabel}
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>;
          })}
          </div>
        </section>}

      {/* Swap Management - for campus admins and above */}
      {canManageTeam && <section className="mb-8">
          <SwapManagementWidget />
        </section>}

      {/* Setlist Confirmation Status - for campus admins and above */}
      {canManageTeam && <section className="mb-8">
          <SetlistConfirmationWidget selectedCampusId={selectedCampusId} />
        </section>}

      {/* Main content grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Upcoming birthdays */}
        <UpcomingWidget title="Upcoming Birthdays" items={filteredBirthdays} type="birthday" isLoading={birthdaysLoading} />

        {/* Upcoming anniversaries */}
        <UpcomingWidget title="Team Anniversaries" items={filteredAnniversaries} type="anniversary" isLoading={anniversariesLoading} />
      </div>

      {/* Break Request Widget - visible to all users */}
      <section className="mt-6">
        <BreakRequestWidget />
      </section>

      {/* Leader tip */}
      {isLeader && <p className="mt-6 text-center text-sm text-muted-foreground">
          As a team leader, you can edit any team member's profile from the team directory.
        </p>}
    </RefreshableContainer>;
}
