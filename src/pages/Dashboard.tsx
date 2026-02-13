import { useState, useMemo, useEffect } from "react";
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
import { Users, ArrowRight, MapPin, Music, Settings, ListChecks } from "lucide-react";
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
  const belongsToCampus = (profileId: string): boolean => {
    if (selectedCampusId === "all") return true;
    const userCampusData = profileCampusMap[profileId];
    return userCampusData?.ids?.includes(selectedCampusId) ?? false;
  };

  // Filtered data based on selected campus
  const filteredProfiles = useMemo(() => {
    return profiles.filter(p => belongsToCampus(p.id));
  }, [profiles, selectedCampusId, profileCampusMap]);
  const filteredBirthdays = useMemo(() => {
    return upcomingBirthdays.filter(p => belongsToCampus(p.id));
  }, [upcomingBirthdays, selectedCampusId, profileCampusMap]);
  const filteredAnniversaries = useMemo(() => {
    return upcomingAnniversaries.filter(p => belongsToCampus(p.id));
  }, [upcomingAnniversaries, selectedCampusId, profileCampusMap]);
  const firstName = user?.user_metadata?.full_name?.split(" ")[0] || user?.email?.split("@")[0] || "there";

  // Check if user is a regular volunteer (not a leader/admin)
  const isVolunteer = !canManageTeam;
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
          <div className="rounded-xl border border-secondary/50 bg-secondary/10 p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-display text-xl font-semibold text-secondary-foreground">Set Planner</h2>
                <p className="mt-1 text-muted-foreground">
                  Plan and build song sets for upcoming services
                </p>
              </div>
              <Link to="/set-planner">
                <Button variant="secondary" className="gap-2">
                  <Music className="h-4 w-4" />
                  View
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>

          <div className="rounded-xl border border-accent/50 bg-accent/10 p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-display text-xl font-semibold">Team Builder</h2>
                <p className="mt-1 text-muted-foreground">View your team's and build new ones.</p>
              </div>
              <Link to="/team-builder">
                <Button className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90">
                  <Users className="h-4 w-4" />
                  View
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>

          <div className="rounded-xl border border-sky-500/40 bg-sky-500/10 p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-display text-xl font-semibold">Auditions</h2>
                <p className="mt-1 text-muted-foreground">
                  Manage the audition queue and schedule candidates quickly.
                </p>
              </div>
              <Link to="/auditions">
                <Button className="gap-2 bg-sky-600 text-white hover:bg-sky-700">
                  <ListChecks className="h-4 w-4" />
                  View
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>

          {/* Admin Tools button - admin only */}
          {isAdmin && (
            <div className="rounded-xl border border-muted bg-muted/30 p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-display text-xl font-semibold text-foreground">Admin Tools</h2>
                  <p className="mt-1 text-muted-foreground">
                    Manage service schedules and organization settings
                  </p>
                </div>
                <Link to="/admin-tools">
                  <Button variant="outline" className="gap-2">
                    <Settings className="h-4 w-4" />
                    View
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          )}
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
