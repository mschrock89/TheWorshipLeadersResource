import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { useProfiles, TeamPosition, Profile } from "@/hooks/useProfiles";
import { useProfilesWithCampuses, useCampuses } from "@/hooks/useCampuses";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { TeamMemberCard } from "@/components/team/TeamMemberCard";
import { TeamFilters } from "@/components/team/TeamFilters";
import { TeamImportDialog } from "@/components/team/TeamImportDialog";
import { CreateAuditionCandidateDialog } from "@/components/team/CreateAuditionCandidateDialog";
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
import { Users, Upload, Mail, ChevronDown, Send, RefreshCw, Home, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export default function Team() {
  const { data: profiles = [], isLoading, refetch } = useProfiles();
  const { data: userCampusMap = {} } = useProfilesWithCampuses();
  const { data: campuses = [] } = useCampuses();
  const { isLeader, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState("all");
  const [campusFilter, setCampusFilter] = useState("all");
  const [genderFilter, setGenderFilter] = useState("all");
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [candidateDialogOpen, setCandidateDialogOpen] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailDialogMode, setEmailDialogMode] = useState<"bulk" | "individual" | "resend">("bulk");
  const [selectedMemberForEmail, setSelectedMemberForEmail] = useState<Profile | undefined>();
  const [resetPasswordMember, setResetPasswordMember] = useState<Profile | undefined>();
  const [deleteMember, setDeleteMember] = useState<Profile | undefined>();
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Always start at top when opening Team Directory.
  useEffect(() => {
    if (!isLoading) {
      window.scrollTo(0, 0);
    }
  }, [isLoading]);

  const filteredProfiles = useMemo(() => {
    return profiles
      .filter((profile) => {
        // Search filter
        const searchLower = search.toLowerCase();
        const matchesSearch =
          !search ||
          profile.full_name?.toLowerCase().includes(searchLower) ||
          profile.email.toLowerCase().includes(searchLower);

        // Position filter
        const matchesPosition =
          positionFilter === "all" ||
          profile.positions?.includes(positionFilter as TeamPosition);

        // Campus filter
        const userCampusData = userCampusMap[profile.id];
        const matchesCampus =
          campusFilter === "all" ||
          (userCampusData?.ids?.includes(campusFilter) ?? false);

        // Gender filter
        const matchesGender =
          genderFilter === "all" ||
          (genderFilter === "not_set" && !profile.gender) ||
          profile.gender === genderFilter;

        return matchesSearch && matchesPosition && matchesCampus && matchesGender;
      })
      .sort((a, b) => {
        const nameA = (a.full_name || a.email).toLowerCase();
        const nameB = (b.full_name || b.email).toLowerCase();
        return nameA.localeCompare(nameB);
      });
  }, [profiles, search, positionFilter, campusFilter, genderFilter, userCampusMap]);

  const handleImportComplete = () => {
    queryClient.invalidateQueries({ queryKey: ['profiles'] });
  };

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
        body: { email: resetPasswordMember.email }
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to reset password');
      }

      toast({ 
        title: "Password Reset", 
        description: `Password for ${resetPasswordMember.full_name || resetPasswordMember.email} has been reset to 123456` 
      });
    } catch (error: any) {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to reset password", 
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
        body: { profileId: deleteMember.id }
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to delete profile');
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
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
        {isLeader && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setCandidateDialogOpen(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              New Candidate
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
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
            <Button onClick={() => setImportDialogOpen(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Import Team
            </Button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="mb-6">
        <TeamFilters
          search={search}
          onSearchChange={setSearch}
          positionFilter={positionFilter}
          onPositionFilterChange={setPositionFilter}
          campusFilter={campusFilter}
          onCampusFilterChange={setCampusFilter}
          genderFilter={genderFilter}
          onGenderFilterChange={setGenderFilter}
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
            {search || positionFilter !== "all" || campusFilter !== "all"
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
              onSendEmail={isLeader ? handleSendIndividualEmail : undefined}
              onResetPassword={isLeader ? handleResetPassword : undefined}
              onDelete={isAdmin ? handleDeleteProfile : undefined}
            />
          ))}
        </div>
      )}

      {/* Import Dialog */}
      <TeamImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImportComplete={handleImportComplete}
      />

      <CreateAuditionCandidateDialog
        open={candidateDialogOpen}
        onOpenChange={setCandidateDialogOpen}
        campuses={campuses}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: ["profiles"] });
          queryClient.invalidateQueries({ queryKey: ["user-roles"] });
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
              This will reset the password for <strong>{resetPasswordMember?.full_name || resetPasswordMember?.email}</strong> to the temporary password <strong>123456</strong>. They will be prompted to change it on next login.
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
