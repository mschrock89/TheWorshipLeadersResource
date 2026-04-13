import { useState, useMemo, useEffect, useRef } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useProfiles, TeamPosition, Profile } from "@/hooks/useProfiles";
import { useProfilesWithCampuses, useCampuses } from "@/hooks/useCampuses";
import { useAllCampusMinistryPositions } from "@/hooks/useCampusMinistryPositions";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { TeamMemberCard } from "@/components/team/TeamMemberCard";
import { TeamFilters } from "@/components/team/TeamFilters";
import { CreateAuditionCandidateDialog } from "@/components/team/CreateAuditionCandidateDialog";
import { CreateTeamMemberDialog } from "@/components/team/CreateTeamMemberDialog";
import { WelcomeEmailDialog } from "@/components/team/WelcomeEmailDialog";
import { RefreshableContainer } from "@/components/layout/RefreshableContainer";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Users, Mail, ChevronDown, Send, RefreshCw, Home, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getMinistryLabel, normalizeWeekendWorshipMinistryType } from "@/lib/constants";

const normalizePositionFilterValue = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

const POSITION_FILTER_ALIASES: Record<string, string[]> = {
  acoustic_1: ["acoustic_1", "acoustic_guitar", "acoustic", "ag_1"],
  acoustic_2: ["acoustic_2", "acoustic_guitar", "acoustic", "ag_2"],
  electric_1: ["electric_1", "electric_guitar", "electric", "eg_1"],
  electric_2: ["electric_2", "electric_guitar", "electric", "eg_2"],
  drums: ["drums", "drummer", "drum_tech"],
  keys: ["keys", "piano", "keyboard", "keyboards"],
};

const matchesPositionFilter = (positions: TeamPosition[] | undefined, positionFilter: string) => {
  if (positionFilter === "all") return true;
  if (!positions || positions.length === 0) return false;

  const normalizedFilter = normalizePositionFilterValue(positionFilter);
  const allowedValues = new Set([
    normalizedFilter,
    ...(POSITION_FILTER_ALIASES[normalizedFilter] || []),
  ]);

  return positions.some((position) => allowedValues.has(normalizePositionFilterValue(position)));
};

export default function Team() {
  const { data: profiles = [], isLoading, refetch } = useProfiles();
  const { data: userCampusMap = {} } = useProfilesWithCampuses();
  const { data: campusMinistryPositions = [] } = useAllCampusMinistryPositions();
  const { data: campuses = [] } = useCampuses();
  const { canManageTeam, isAdmin } = useAuth();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const hasRestoredScrollRef = useRef(false);
  const [candidateDialogOpen, setCandidateDialogOpen] = useState(false);
  const [createMemberDialogOpen, setCreateMemberDialogOpen] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailDialogMode, setEmailDialogMode] = useState<"bulk" | "individual" | "resend">("bulk");
  const [selectedMemberForEmail, setSelectedMemberForEmail] = useState<Profile | undefined>();
  const [resetPasswordMember, setResetPasswordMember] = useState<Profile | undefined>();
  const [deleteMember, setDeleteMember] = useState<Profile | undefined>();
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const search = searchParams.get("search") ?? "";
  const sortBy = searchParams.get("sort") ?? "name";
  const positionFilter = searchParams.get("position") ?? "all";
  const campusFilter = searchParams.get("campus") ?? "all";
  const genderFilter = searchParams.get("gender") ?? "all";
  const scrollStorageKey = `team-directory-scroll:${location.search || "default"}`;

  const updateDirectoryParam = (key: string, value: string, fallback = "all") => {
    const nextParams = new URLSearchParams(searchParams);
    const trimmedValue = value.trim();

    if (!trimmedValue || trimmedValue === fallback) {
      nextParams.delete(key);
    } else {
      nextParams.set(key, trimmedValue);
    }

    setSearchParams(nextParams, { replace: true });
  };

  useEffect(() => {
    hasRestoredScrollRef.current = false;
  }, [scrollStorageKey]);

  useEffect(() => {
    return () => {
      sessionStorage.setItem(scrollStorageKey, String(window.scrollY));
    };
  }, [scrollStorageKey]);

  useEffect(() => {
    if (!isLoading && !hasRestoredScrollRef.current) {
      const savedScroll = sessionStorage.getItem(scrollStorageKey);
      const targetScrollY = savedScroll ? Number(savedScroll) : 0;
      const scrollY = Number.isFinite(targetScrollY) ? targetScrollY : 0;
      let attempts = 0;
      let timeoutId: number | undefined;

      const restoreScroll = () => {
        window.scrollTo(0, scrollY);
        attempts += 1;

        const maxScrollY = Math.max(
          document.documentElement.scrollHeight - window.innerHeight,
          0
        );
        const reachedTarget = Math.abs(window.scrollY - Math.min(scrollY, maxScrollY)) < 2;

        if (reachedTarget || attempts >= 6) {
          hasRestoredScrollRef.current = true;
          return;
        }

        timeoutId = window.setTimeout(restoreScroll, 50);
      };

      restoreScroll();

      return () => {
        if (timeoutId) {
          window.clearTimeout(timeoutId);
        }
      };
    }
  }, [isLoading, scrollStorageKey]);

  const filteredProfiles = useMemo(() => {
    const campusScopedPositionMap = new Map<string, TeamPosition[]>();
    const campusScopedMinistryMap = new Map<string, string[]>();

    const getProfileMinistries = (profile: Profile) =>
      Array.isArray(profile.ministry_types) ? profile.ministry_types : [];

    if (campusFilter !== "all") {
      campusMinistryPositions.forEach(({ user_id, campus_id, position, ministry_type }) => {
        if (campus_id !== campusFilter) return;

        const existing = campusScopedPositionMap.get(user_id) || [];
        if (!existing.includes(position as TeamPosition)) {
          campusScopedPositionMap.set(user_id, [...existing, position as TeamPosition]);
        }

        const existingMinistries = campusScopedMinistryMap.get(user_id) || [];
        const normalizedMinistry = normalizeWeekendWorshipMinistryType(ministry_type) || ministry_type;
        if (normalizedMinistry && !existingMinistries.includes(normalizedMinistry)) {
          campusScopedMinistryMap.set(user_id, [...existingMinistries, normalizedMinistry]);
        }
      });
    }

    const getMinistrySortValue = (profile: Profile) => {
      const profileMinistryTypes = (
        campusFilter === "all"
          ? getProfileMinistries(profile)
          : campusScopedMinistryMap.get(profile.id) || []
      )
        .map((ministryType) => normalizeWeekendWorshipMinistryType(ministryType) || ministryType)
        .filter(Boolean);

      if (profileMinistryTypes.length === 0) {
        return "zzz";
      }

      const labels = Array.from(
        new Set(profileMinistryTypes.map((ministryType) => getMinistryLabel(ministryType)))
      ).sort((a, b) => a.localeCompare(b));

      return labels[0]?.toLowerCase() || "zzz";
    };

    const getNormalizedProfileMinistries = (profile: Profile) =>
      (
        campusFilter === "all"
          ? getProfileMinistries(profile)
          : campusScopedMinistryMap.get(profile.id) || []
      )
        .map((ministryType) => normalizeWeekendWorshipMinistryType(ministryType) || ministryType)
        .filter(Boolean);

    const selectedMinistrySort = sortBy.startsWith("ministry:") ? sortBy.replace("ministry:", "") : null;

    return profiles
      .filter((profile) => {
        // Search filter
        const searchLower = search.toLowerCase();
        const fullName = profile.full_name?.toLowerCase() ?? "";
        const email = profile.email?.toLowerCase() ?? "";
        const matchesSearch =
          !search ||
          fullName.includes(searchLower) ||
          email.includes(searchLower);

        // Campus filter
        const userCampusData = userCampusMap[profile.id];
        const matchesCampus =
          campusFilter === "all" ||
          (userCampusData?.ids?.includes(campusFilter) ?? false);

        const positionsForFilter =
          campusFilter === "all"
            ? profile.positions
            : campusScopedPositionMap.get(profile.id) || [];

        // Position filter
        const matchesPosition = matchesPositionFilter(positionsForFilter, positionFilter);

        const normalizedProfileMinistries = getNormalizedProfileMinistries(profile);
        const matchesSelectedMinistry =
          !selectedMinistrySort || normalizedProfileMinistries.includes(selectedMinistrySort);

        // Gender filter
        const matchesGender =
          genderFilter === "all" ||
          (genderFilter === "not_set" && !profile.gender) ||
          profile.gender === genderFilter;

        return matchesSearch && matchesPosition && matchesCampus && matchesSelectedMinistry && matchesGender;
      })
      .sort((a, b) => {
        const nameA = (a.full_name || a.email || "").toLowerCase();
        const nameB = (b.full_name || b.email || "").toLowerCase();

        if (selectedMinistrySort) {
          const ministriesA = new Set(getNormalizedProfileMinistries(a));
          const ministriesB = new Set(getNormalizedProfileMinistries(b));
          const aMatchesSelected = ministriesA.has(selectedMinistrySort);
          const bMatchesSelected = ministriesB.has(selectedMinistrySort);

          if (aMatchesSelected !== bMatchesSelected) {
            return aMatchesSelected ? -1 : 1;
          }

          const ministryCompare = getMinistrySortValue(a).localeCompare(getMinistrySortValue(b));
          if (ministryCompare !== 0) {
            return ministryCompare;
          }
        } else if (sortBy === "ministry") {
          const ministryA = getMinistrySortValue(a);
          const ministryB = getMinistrySortValue(b);
          const ministryCompare = ministryA.localeCompare(ministryB);

          if (ministryCompare !== 0) {
            return ministryCompare;
          }
        }

        return nameA.localeCompare(nameB);
      });
  }, [profiles, search, sortBy, positionFilter, campusFilter, genderFilter, userCampusMap, campusMinistryPositions]);

  const handleEmailSent = () => {
    refetch();
  };

  const handleSendIndividualEmail = (member: Profile) => {
    setSelectedMemberForEmail(member);
    setEmailDialogMode("individual");
    setEmailDialogOpen(true);
  };

  const handleResetPassword = (member: Profile) => {
    setResetPasswordMember(member);
  };

  const handleDeleteProfile = (member: Profile) => {
    setDeleteMember(member);
  };

  const getFunctionErrorMessage = async (
    error: unknown,
    response: { error: { message?: string } | null; data?: { error?: string; hint?: string } | null },
    fallback: string,
  ) => {
    if (error instanceof FunctionsHttpError) {
      try {
        const payload = await error.context.json();
        const errorMessage =
          typeof payload?.error === "string" && payload.error.trim()
            ? payload.error.trim()
            : fallback;
        const hintMessage =
          typeof payload?.hint === "string" && payload.hint.trim()
            ? payload.hint.trim()
            : "";

        return hintMessage ? `${errorMessage} ${hintMessage}` : errorMessage;
      } catch {
        // Fall through to the response payload and generic error message.
      }
    }

    const hint = response.data?.hint?.trim();
    const message =
      response.data?.error?.trim() ||
      (error instanceof Error ? error.message.trim() : "") ||
      response.error?.message?.trim() ||
      fallback;

    return hint ? `${message} ${hint}` : message;
  };

  const confirmResetPassword = async () => {
    if (!resetPasswordMember) return;
    
    setIsResettingPassword(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: "Error", description: "You must be logged in", variant: "destructive" });
        return;
      }

      const response = await supabase.functions.invoke('reset-user-password', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: { email: resetPasswordMember.email }
      });

      if (response.error) {
        throw new Error(await getFunctionErrorMessage(response.error, response, 'Failed to reset password'));
      }

      if (response.data?.error) {
        throw new Error(await getFunctionErrorMessage(response.error, response, 'Failed to reset password'));
      }

      toast({ 
        title: "Password Reset", 
        description: `Password for ${resetPasswordMember.full_name || resetPasswordMember.email} has been reset to 123456` 
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to reset password";
      toast({ 
        title: "Error", 
        description: errorMessage, 
        variant: "destructive" 
      });
    } finally {
      setIsResettingPassword(false);
      setResetPasswordMember(undefined);
    }
  };

  const confirmDeleteProfile = async () => {
    if (!deleteMember) return;
    
    setIsDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: "Error", description: "You must be logged in", variant: "destructive" });
        return;
      }

      const response = await supabase.functions.invoke('delete-profile', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: { profileId: deleteMember.id }
      });

      if (response.error) {
        throw new Error(await getFunctionErrorMessage(response.error, response, 'Failed to delete profile'));
      }

      if (response.data?.error) {
        throw new Error(await getFunctionErrorMessage(response.error, response, 'Failed to delete profile'));
      }

      toast({ 
        title: "Profile Deleted", 
        description: `${deleteMember.full_name || deleteMember.email} has been removed` 
      });
      
      // Refresh the profiles list
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to delete profile";
      toast({ 
        title: "Error", 
        description: errorMessage, 
        variant: "destructive" 
      });
    } finally {
      setIsDeleting(false);
      setDeleteMember(undefined);
    }
  };

  const notYetEmailedCount = profiles.filter(p => !p.welcome_email_sent_at).length;
  const alreadyEmailedCount = profiles.filter(p => p.welcome_email_sent_at).length;

  return (
    <RefreshableContainer queryKeys={[["profiles"]]}>
      {/* Breadcrumb Navigation */}
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/dashboard" className="flex items-center gap-1.5">
                <Home className="h-3.5 w-3.5" />
                Dashboard
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Team Directory</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground">Team Directory</h1>
          <p className="mt-1 text-muted-foreground">
            {profiles.length} team member{profiles.length !== 1 ? "s" : ""}
          </p>
        </div>
        {canManageTeam && (
          <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:flex sm:flex-wrap sm:justify-end">
            <Button className="w-full" variant="outline" onClick={() => setCreateMemberDialogOpen(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              New Member
            </Button>
            <Button className="w-full" variant="outline" onClick={() => setCandidateDialogOpen(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              New Candidate
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="w-full justify-between sm:justify-center" variant="outline">
                  <Mail className="h-4 w-4 mr-2" />
                  Send Emails
                  <ChevronDown className="h-4 w-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem 
                  onClick={() => {
                    setEmailDialogMode("bulk");
                    setSelectedMemberForEmail(undefined);
                    setEmailDialogOpen(true);
                  }}
                  disabled={notYetEmailedCount === 0}
                >
                  <Send className="h-4 w-4 mr-2" />
                  Send Welcome Emails ({notYetEmailedCount})
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => {
                    setEmailDialogMode("resend");
                    setSelectedMemberForEmail(undefined);
                    setEmailDialogOpen(true);
                  }}
                  disabled={alreadyEmailedCount === 0}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Resend Welcome Emails ({alreadyEmailedCount})
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="mb-6">
        <TeamFilters
          search={search}
          onSearchChange={(value) => updateDirectoryParam("search", value, "")}
          sortBy={sortBy}
          onSortByChange={(value) => updateDirectoryParam("sort", value, "name")}
          positionFilter={positionFilter}
          onPositionFilterChange={(value) => updateDirectoryParam("position", value)}
          campusFilter={campusFilter}
          onCampusFilterChange={(value) => updateDirectoryParam("campus", value)}
          genderFilter={genderFilter}
          onGenderFilterChange={(value) => updateDirectoryParam("gender", value)}
          showGenderFilter={true}
        />
      </div>

      {/* Team grid */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-64 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : filteredProfiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Users className="h-16 w-16 text-muted-foreground/30" />
          <h2 className="mt-4 text-lg font-semibold text-foreground">No team members found</h2>
          <p className="mt-2 text-muted-foreground">
            {search || positionFilter !== "all" || campusFilter !== "all" || genderFilter !== "all"
              ? "Try adjusting your filters"
              : "Team members will appear here once they sign up"}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredProfiles.map((member) => (
            <TeamMemberCard 
              key={member.id} 
              member={member} 
              campusNames={userCampusMap[member.id]?.names || []}
              onSendEmail={canManageTeam ? handleSendIndividualEmail : undefined}
              onResetPassword={canManageTeam ? handleResetPassword : undefined}
              onDelete={isAdmin ? handleDeleteProfile : undefined}
            />
          ))}
        </div>
      )}

      <CreateAuditionCandidateDialog
        open={candidateDialogOpen}
        onOpenChange={setCandidateDialogOpen}
        campuses={campuses}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: ["profiles"] });
          queryClient.invalidateQueries({ queryKey: ["user-roles"] });
        }}
      />

      <CreateTeamMemberDialog
        open={createMemberDialogOpen}
        onOpenChange={setCreateMemberDialogOpen}
        campuses={campuses}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: ["profiles"] });
          queryClient.invalidateQueries({ queryKey: ["user-roles"] });
          queryClient.invalidateQueries({ queryKey: ["user-campuses"] });
        }}
      />

      {/* Welcome Email Dialog */}
      <WelcomeEmailDialog
        open={emailDialogOpen}
        onOpenChange={setEmailDialogOpen}
        profiles={profiles}
        mode={emailDialogMode}
        selectedMember={selectedMemberForEmail}
        onEmailSent={handleEmailSent}
      />

      {/* Reset Password Confirmation Dialog */}
      <AlertDialog open={!!resetPasswordMember} onOpenChange={(open) => !open && setResetPasswordMember(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Password</AlertDialogTitle>
            <AlertDialogDescription>
              This will reset the password for <strong>{resetPasswordMember?.full_name || resetPasswordMember?.email}</strong> to <strong>123456</strong>. They can keep it or change it later from their profile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isResettingPassword}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmResetPassword} disabled={isResettingPassword}>
              {isResettingPassword ? "Resetting..." : "Reset Password"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Profile Confirmation Dialog */}
      <AlertDialog open={!!deleteMember} onOpenChange={(open) => !open && setDeleteMember(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Profile</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete <strong>{deleteMember?.full_name || deleteMember?.email}</strong>? This action cannot be undone and will remove all their data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDeleteProfile} 
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete Profile"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </RefreshableContainer>
  );
}
