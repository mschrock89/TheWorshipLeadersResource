import { useState, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useProfile, useUpdateProfile, TeamPosition } from "@/hooks/useProfiles";
import { useCampuses, useUserCampuses, useUpdateUserCampuses } from "@/hooks/useCampuses";
import { useUserRoles, useUserAdminCampuses, useAddUserRole, useRemoveUserRole, useToggleUserRole, useUpdateBaseRole } from "@/hooks/useUserRoles";
import { useUserMinistryAssignments, useToggleMinistryAssignment } from "@/hooks/useMinistryAssignments";
import { useUserCampusMinistryPositions, useToggleCampusMinistryPosition } from "@/hooks/useCampusMinistryPositions";
import { useCandidateAudition, useUpsertAudition } from "@/hooks/useAuditions";
import { AvatarUpload } from "@/components/profile/AvatarUpload";
import { PushNotificationToggle } from "@/components/settings/PushNotificationToggle";
import { TestPushNotification } from "@/components/settings/TestPushNotification";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Loader2, Save, MapPin, Shield, Key, Music, Home, Pencil, X, Check, ArrowLeft, ListMusic } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { POSITION_LABELS, POSITION_CATEGORIES, ROLE_LABELS, LEADERSHIP_ROLES, BASE_ROLES, MINISTRY_TYPES } from "@/lib/constants";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

export default function Profile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isLeader, isAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  
  // If no ID provided, show current user's profile
  const profileId = id || user?.id;
  const isOwnProfile = profileId === user?.id;
  const canEdit = isOwnProfile || isLeader;

  const { data: profile, isLoading } = useProfile(profileId);
  const { data: campuses = [] } = useCampuses();
  const { data: userCampuses = [] } = useUserCampuses(profileId);
  const { data: userRoles = [], isLoading: isRolesLoading } = useUserRoles(profileId);
  const { data: adminCampusIds = [] } = useUserAdminCampuses(profileId);
  const { data: ministryAssignments = [] } = useUserMinistryAssignments(profileId);
  const { data: campusMinistryPositions = [] } = useUserCampusMinistryPositions(profileId);
  const updateProfile = useUpdateProfile();
  const updateUserCampuses = useUpdateUserCampuses();
  const toggleUserRole = useToggleUserRole();
  const updateBaseRole = useUpdateBaseRole();
  const addUserRole = useAddUserRole();
  const removeUserRole = useRemoveUserRole();
  const toggleMinistryAssignment = useToggleMinistryAssignment();
  const toggleCampusMinistryPosition = useToggleCampusMinistryPosition();
  const upsertAudition = useUpsertAudition();
  const { data: candidateAudition } = useCandidateAudition(profileId);
  
  // Derived role info
  const hasRole = (role: string) => userRoles.some(r => r.role === role);
  const isOrgAdmin = hasRole('admin');
  const isCampusAdmin = hasRole('campus_admin');
  const isAuditionCandidate = hasRole('audition_candidate');
  const baseRole = userRoles.find(r => BASE_ROLES.includes(r.role as any))?.role || 'volunteer';

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [birthday, setBirthday] = useState("");
  const [anniversary, setAnniversary] = useState("");
  const [positions, setPositions] = useState<TeamPosition[]>([]);
  const [ministryTypes, setMinistryTypes] = useState<string[]>(["weekend"]);
  const [selectedCampuses, setSelectedCampuses] = useState<string[]>([]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [shareContactWithPastors, setShareContactWithPastors] = useState(false);
  const [shareContactWithCampus, setShareContactWithCampus] = useState(false);
  const [gender, setGender] = useState<string | null>(null);
  const [defaultCampusId, setDefaultCampusId] = useState<string | null>(null);
  const [auditionDate, setAuditionDate] = useState("");
  const [auditionStage, setAuditionStage] = useState<"pre_audition" | "audition">("pre_audition");
  const [auditionTrack, setAuditionTrack] = useState<"vocalist" | "instrumentalist">("vocalist");
  const [auditionCampusId, setAuditionCampusId] = useState<string>("");
  const [auditionStartTime, setAuditionStartTime] = useState("");
  const [auditionEndTime, setAuditionEndTime] = useState("");
  const [leadSong, setLeadSong] = useState("");
  const [harmonySong, setHarmonySong] = useState("");
  const [songOne, setSongOne] = useState("");
  const [songTwo, setSongTwo] = useState("");
  const [auditionNotes, setAuditionNotes] = useState("");
  
  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  
  // Email editing state
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [isUpdatingEmail, setIsUpdatingEmail] = useState(false);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "");
      setPhone(profile.phone || "");
      setBirthday(profile.birthday || "");
      setAnniversary(profile.anniversary || "");
      setPositions(profile.positions || []);
      setMinistryTypes(profile.ministry_types || ["weekend"]);
      setAvatarUrl(profile.avatar_url);
      setShareContactWithPastors(profile.share_contact_with_pastors ?? false);
      setShareContactWithCampus(profile.share_contact_with_campus ?? false);
      setGender(profile.gender || null);
      setDefaultCampusId(profile.default_campus_id || null);
    }
  }, [profile]);

  useEffect(() => {
    if (!candidateAudition) {
      return;
    }
    setAuditionDate(candidateAudition.audition_date || "");
    setAuditionStage(candidateAudition.stage);
    setAuditionTrack(candidateAudition.candidate_track);
    setAuditionCampusId(candidateAudition.campus_id || "");
    setAuditionStartTime(candidateAudition.start_time || "");
    setAuditionEndTime(candidateAudition.end_time || "");
    setLeadSong(candidateAudition.lead_song || "");
    setHarmonySong(candidateAudition.harmony_song || "");
    setSongOne(candidateAudition.song_one || "");
    setSongTwo(candidateAudition.song_two || "");
    setAuditionNotes(candidateAudition.notes || "");
  }, [candidateAudition]);

  useEffect(() => {
    if (userCampuses.length > 0) {
      setSelectedCampuses(userCampuses.map(uc => uc.campus_id));
    }
  }, [userCampuses]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileId) return;

    updateProfile.mutate({
      id: profileId,
      full_name: fullName || null,
      phone: phone || null,
      birthday: birthday || null,
      anniversary: anniversary || null,
      positions,
      ministry_types: ministryTypes,
      share_contact_with_pastors: shareContactWithPastors,
      share_contact_with_campus: shareContactWithCampus,
      gender: gender,
      default_campus_id: defaultCampusId,
    } as any);

    // Update campus assignments (only leaders can do this)
    if (isLeader) {
      updateUserCampuses.mutate({
        userId: profileId,
        campusIds: selectedCampuses,
      });
    }
  };

  const togglePosition = (pos: TeamPosition) => {
    setPositions((prev) =>
      prev.includes(pos) ? prev.filter((p) => p !== pos) : [...prev, pos]
    );
  };

  const toggleMinistry = (ministry: string) => {
    setMinistryTypes((prev) =>
      prev.includes(ministry) ? prev.filter((m) => m !== ministry) : [...prev, ministry]
    );
  };

  const toggleCampus = (campusId: string) => {
    setSelectedCampuses((prev) =>
      prev.includes(campusId) ? prev.filter((c) => c !== campusId) : [...prev, campusId]
    );
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure your new passwords match.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: "Password too short",
        description: "Password must be at least 6 characters long.",
        variant: "destructive",
      });
      return;
    }

    setIsChangingPassword(true);
    
    try {
      // First verify current password by signing in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: profile?.email || "",
        password: currentPassword,
      });

      if (signInError) {
        toast({
          title: "Current password incorrect",
          description: "Please check your current password and try again.",
          variant: "destructive",
        });
        setIsChangingPassword(false);
        return;
      }

      // Update the password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        toast({
          title: "Failed to change password",
          description: updateError.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Password changed",
          description: "Your password has been updated successfully.",
        });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleEmailUpdate = async () => {
    if (!profileId || !newEmail.trim()) return;
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      toast({
        title: "Invalid email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }
    
    setIsUpdatingEmail(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: "Error", description: "You must be logged in", variant: "destructive" });
        return;
      }

      const response = await supabase.functions.invoke('update-user-email', {
        body: { userId: profileId, newEmail: newEmail.trim() }
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to update email');
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      toast({ 
        title: "Email Updated", 
        description: `Email has been changed to ${newEmail.trim()}` 
      });
      
      setIsEditingEmail(false);
      setNewEmail("");
      
      // Refresh profile data
      queryClient.invalidateQueries({ queryKey: ['profile', profileId] });
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to update email";
      toast({ 
        title: "Error", 
        description: errorMessage, 
        variant: "destructive" 
      });
    } finally {
      setIsUpdatingEmail(false);
    }
  };

  const startEditingEmail = () => {
    setNewEmail(profile?.email || "");
    setIsEditingEmail(true);
  };

  const cancelEditingEmail = () => {
    setIsEditingEmail(false);
    setNewEmail("");
  };

  if (isLoading) {
    return (
      <>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </>
    );
  }

  if (!profile) {
    return (
      <>
        <div className="text-center py-16">
          <p className="text-muted-foreground">Profile not found</p>
          <Button variant="link" onClick={() => navigate(-1)}>Go back</Button>
        </div>
      </>
    );
  }

  const initials = profile.full_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase() || profile.email.substring(0, 2).toUpperCase();

  const handleBackToDirectory = () => {
    navigate('/team');
  };

  return (
    <>
      {/* Back to Directory button - shown when viewing someone else's profile */}
      {id && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBackToDirectory}
          className="mb-3 gap-2 text-muted-foreground hover:text-foreground -ml-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Directory
        </Button>
      )}

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
          {id && (
            <>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/team">Team Directory</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
            </>
          )}
          <BreadcrumbItem>
            <BreadcrumbPage>{isOwnProfile ? "My Profile" : profile.full_name || "Profile"}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader className="text-center flex flex-col items-center">
            {canEdit ? (
              <AvatarUpload
                userId={profileId!}
                currentAvatarUrl={avatarUrl}
                initials={initials}
                onUploadComplete={setAvatarUrl}
                disabled={!canEdit}
              />
            ) : (
              <Avatar className="h-24 w-24 border-4 border-secondary">
                <AvatarImage src={avatarUrl || undefined} />
                <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                  {initials}
                </AvatarFallback>
              </Avatar>
            )}
            <CardTitle className="mt-4 font-display text-2xl">
              {isOwnProfile ? "My Profile" : profile.full_name || "Team Member"}
            </CardTitle>
            {/* Email display with edit capability for leaders */}
            {isLeader && !isOwnProfile ? (
              <div className="flex items-center gap-2 mt-1">
                {isEditingEmail ? (
                  <>
                    <Input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      className="h-8 w-64 text-sm"
                      placeholder="Enter new email"
                      disabled={isUpdatingEmail}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-green-500 hover:text-green-600 hover:bg-green-500/10"
                      onClick={handleEmailUpdate}
                      disabled={isUpdatingEmail}
                    >
                      {isUpdatingEmail ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={cancelEditingEmail}
                      disabled={isUpdatingEmail}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <CardDescription className="mb-0">{profile.email}</CardDescription>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-muted-foreground hover:text-foreground"
                      onClick={startEditingEmail}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <CardDescription>{profile.email}</CardDescription>
            )}
            
            {/* Role Display & Management */}
            <div className="mt-3 flex flex-col items-center gap-3">
              {isLeader && !isOwnProfile ? (
                <>
                  {/* Leadership Roles (can have multiple) */}
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-xs text-muted-foreground font-medium">Leadership Roles</p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {/* Organization Admin Toggle */}
                      <label className="flex items-center gap-2 cursor-pointer rounded-md border px-3 py-2 hover:bg-accent/50 transition-colors">
                        <Checkbox
                          checked={isOrgAdmin}
                          onCheckedChange={() => {
                            if (profileId) {
                              toggleUserRole.mutate({
                                userId: profileId,
                                role: 'admin' as AppRole,
                                hasRole: isOrgAdmin
                              });
                            }
                          }}
                          disabled={toggleUserRole.isPending || isRolesLoading}
                        />
                        <span className="text-sm font-medium">{ROLE_LABELS.admin}</span>
                      </label>
                      
                      {/* Campus Admin Toggle */}
                      <label className="flex items-center gap-2 cursor-pointer rounded-md border px-3 py-2 hover:bg-accent/50 transition-colors">
                        <Checkbox
                          checked={isCampusAdmin}
                          onCheckedChange={() => {
                            if (profileId) {
                              toggleUserRole.mutate({
                                userId: profileId,
                                role: 'campus_admin' as AppRole,
                                hasRole: isCampusAdmin,
                                adminCampusId: adminCampusIds[0] || null
                              });
                            }
                          }}
                          disabled={toggleUserRole.isPending || isRolesLoading}
                        />
                        <span className="text-sm font-medium">{ROLE_LABELS.campus_admin}</span>
                      </label>
                    </div>
                    
                    {/* Campus Admin Campus Selector - Multi-select checkboxes */}
                    {isCampusAdmin && (
                      <div className="flex flex-col items-center gap-2">
                        <p className="text-xs text-muted-foreground font-medium">Campuses to Admin</p>
                        <div className="flex flex-wrap justify-center gap-2">
                          {campuses.map((campus) => {
                            const isAdminForCampus = adminCampusIds.includes(campus.id);
                            return (
                              <label 
                                key={campus.id}
                                className="flex items-center gap-2 cursor-pointer rounded-md border px-3 py-2 hover:bg-accent/50 transition-colors"
                              >
                                <Checkbox
                                  checked={isAdminForCampus}
                                  onCheckedChange={() => {
                                    if (profileId) {
                                      if (isAdminForCampus) {
                                        // Remove this specific campus admin role
                                        removeUserRole.mutate({
                                          userId: profileId,
                                          role: 'campus_admin' as AppRole,
                                          adminCampusId: campus.id
                                        });
                                      } else {
                                        // Add campus admin role for this campus
                                        addUserRole.mutate({
                                          userId: profileId,
                                          role: 'campus_admin' as AppRole,
                                          adminCampusId: campus.id
                                        });
                                      }
                                    }
                                  }}
                                  disabled={addUserRole.isPending || removeUserRole.isPending || isRolesLoading}
                                />
                                <span className="text-sm">{campus.name}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Base Role Selector */}
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-xs text-muted-foreground font-medium">Base Role</p>
                    <Select
                      value={baseRole}
                      onValueChange={(value) => {
                        if (profileId) {
                          updateBaseRole.mutate({ 
                            userId: profileId, 
                            role: value as AppRole
                          });
                        }
                      }}
                      disabled={updateBaseRole.isPending || isRolesLoading}
                    >
                      <SelectTrigger className="w-[280px] bg-background">
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4 text-muted-foreground" />
                          <SelectValue placeholder="Select base role" />
                        </div>
                      </SelectTrigger>
                      <SelectContent className="bg-background">
                        {BASE_ROLES.map((role) => (
                          <SelectItem key={role} value={role}>{ROLE_LABELS[role]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {(toggleUserRole.isPending || updateBaseRole.isPending) && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </>
              ) : (
                <div className="flex flex-wrap justify-center gap-2">
                  {/* Display all roles as badges */}
                  {userRoles.map((roleData, index) => (
                    <span 
                      key={`${roleData.role}-${roleData.admin_campus_id || index}`}
                      className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-2.5 py-1 text-sm font-medium text-secondary-foreground"
                    >
                      <Shield className="h-3.5 w-3.5" />
                      {ROLE_LABELS[roleData.role] || roleData.role}
                      {roleData.role === 'campus_admin' && roleData.admin_campus_id && (
                        <span className="text-xs opacity-75">
                          ({campuses.find(c => c.id === roleData.admin_campus_id)?.name || 'Campus'})
                        </span>
                      )}
                    </span>
                  ))}
                  {userRoles.length === 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-2.5 py-1 text-sm font-medium text-secondary-foreground">
                      <Shield className="h-3.5 w-3.5" />
                      Volunteer
                    </span>
                  )}
                </div>
              )}
            </div>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Basic info */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    disabled={!canEdit}
                    placeholder="John Smith"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={!canEdit}
                    placeholder="(555) 123-4567"
                  />
                </div>
              </div>

              {/* Audition Candidate Setup */}
              {isLeader && isAuditionCandidate && (
                <Card className="border-primary/30">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg">Audition Plan</CardTitle>
                    <CardDescription>
                      Schedule the candidate's pre-audition or audition and assign their songs.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Stage</Label>
                        <Select value={auditionStage} onValueChange={(value) => setAuditionStage(value as "pre_audition" | "audition")}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pre_audition">Pre-Audition</SelectItem>
                            <SelectItem value="audition">Audition</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Candidate Type</Label>
                        <Select value={auditionTrack} onValueChange={(value) => setAuditionTrack(value as "vocalist" | "instrumentalist")}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="vocalist">Vocalist</SelectItem>
                            <SelectItem value="instrumentalist">Instrumentalist</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Audition Date</Label>
                        <Input type="date" value={auditionDate} onChange={(e) => setAuditionDate(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Campus</Label>
                        <Select value={auditionCampusId} onValueChange={setAuditionCampusId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select campus" />
                          </SelectTrigger>
                          <SelectContent>
                            {campuses.map((campus) => (
                              <SelectItem key={campus.id} value={campus.id}>
                                {campus.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Start Time</Label>
                        <Input type="time" value={auditionStartTime} onChange={(e) => setAuditionStartTime(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>End Time</Label>
                        <Input type="time" value={auditionEndTime} onChange={(e) => setAuditionEndTime(e.target.value)} />
                      </div>
                    </div>

                    {auditionTrack === "vocalist" ? (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Song to Lead</Label>
                          <Input value={leadSong} onChange={(e) => setLeadSong(e.target.value)} placeholder="Song title" />
                        </div>
                        <div className="space-y-2">
                          <Label>Harmony Song</Label>
                          <Input value={harmonySong} onChange={(e) => setHarmonySong(e.target.value)} placeholder="Song title" />
                        </div>
                      </div>
                    ) : (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Song 1</Label>
                          <Input value={songOne} onChange={(e) => setSongOne(e.target.value)} placeholder="Song title" />
                        </div>
                        <div className="space-y-2">
                          <Label>Song 2</Label>
                          <Input value={songTwo} onChange={(e) => setSongTwo(e.target.value)} placeholder="Song title" />
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label>Notes</Label>
                      <Input
                        value={auditionNotes}
                        onChange={(e) => setAuditionNotes(e.target.value)}
                        placeholder="Interview notes, instructions, reminders..."
                      />
                    </div>

                    <Button
                      type="button"
                      disabled={!profileId || !auditionDate || upsertAudition.isPending}
                      onClick={() => {
                        if (!profileId || !auditionDate) return;
                        upsertAudition.mutate({
                          id: candidateAudition?.id,
                          candidate_id: profileId,
                          audition_date: auditionDate,
                          campus_id: auditionCampusId || null,
                          start_time: auditionStartTime || null,
                          end_time: auditionEndTime || null,
                          stage: auditionStage,
                          candidate_track: auditionTrack,
                          lead_song: auditionTrack === "vocalist" ? (leadSong || null) : null,
                          harmony_song: auditionTrack === "vocalist" ? (harmonySong || null) : null,
                          song_one: auditionTrack === "instrumentalist" ? (songOne || null) : null,
                          song_two: auditionTrack === "instrumentalist" ? (songTwo || null) : null,
                          notes: auditionNotes || null,
                          status: "scheduled",
                        });
                      }}
                    >
                      {upsertAudition.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        "Save Audition Plan"
                      )}
                    </Button>

                    {profileId && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => navigate(`/set-planner/audition/${profileId}`)}
                        className="w-full sm:w-auto"
                      >
                        <ListMusic className="mr-2 h-4 w-4" />
                        Create Audition Setlist
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Gender (for vocalists - swap matching) */}
              {canEdit && (
                <div className="space-y-2">
                  <Label>Gender</Label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="gender"
                        value="male"
                        checked={gender === "male"}
                        onChange={(e) => setGender(e.target.value)}
                        className="h-4 w-4 text-primary"
                      />
                      <span className="text-sm">Male</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="gender"
                        value="female"
                        checked={gender === "female"}
                        onChange={(e) => setGender(e.target.value)}
                        className="h-4 w-4 text-primary"
                      />
                      <span className="text-sm">Female</span>
                    </label>
                    {gender && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setGender(null)}
                        className="text-xs text-muted-foreground"
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Dates */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="birthday">Birthday</Label>
                  <Input
                    id="birthday"
                    type="date"
                    value={birthday}
                    onChange={(e) => setBirthday(e.target.value)}
                    disabled={!canEdit}
                    className="text-left h-10 min-h-[2.5rem] [&::-webkit-date-and-time-value]:text-left"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="anniversary">Team Anniversary</Label>
                  <Input
                    id="anniversary"
                    type="date"
                    value={anniversary}
                    onChange={(e) => setAnniversary(e.target.value)}
                    disabled={!canEdit}
                    className="text-left h-10 min-h-[2.5rem] [&::-webkit-date-and-time-value]:text-left"
                  />
                </div>
              </div>
              {/* Campus Assignments - Leaders can edit */}
              {isLeader && (
                <div className="space-y-4">
                  <Label className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Campus Assignments
                  </Label>
                  <div className="flex flex-wrap gap-3">
                    {campuses.map((campus) => (
                      <label
                        key={campus.id}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <Checkbox
                          checked={selectedCampuses.includes(campus.id)}
                          onCheckedChange={() => toggleCampus(campus.id)}
                        />
                        <span className="text-sm">{campus.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Default Campus - Visible to admins (for any profile) or profile owner if admin/leader */}
              {(isAdmin || (isOwnProfile && isLeader)) && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Home className="h-4 w-4" />
                    Default Campus
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    This campus will be pre-selected when you open the Calendar, Set Builder, Team Builder, and other campus-filtered views.
                  </p>
                  <Select value={defaultCampusId || ""} onValueChange={(value) => setDefaultCampusId(value || null)}>
                    <SelectTrigger className="w-full sm:w-[280px]">
                      <SelectValue placeholder="Select default campus" />
                    </SelectTrigger>
                    <SelectContent>
                      {campuses.map((campus) => (
                        <SelectItem key={campus.id} value={campus.id}>
                          {campus.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Show campus info for non-leaders */}
              {!isLeader && userCampuses.length > 0 && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Campus
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {userCampuses.map((uc) => (
                      <span
                        key={uc.id}
                        className="inline-flex items-center rounded-md bg-secondary px-2.5 py-1 text-sm font-medium text-secondary-foreground"
                      >
                        {uc.campuses.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Ministry Types and Positions per Campus */}
              <div className="space-y-4">
                <Label className="flex items-center gap-2">
                  <Music className="h-4 w-4" />
                  Ministries & Positions by Campus
                </Label>
                <p className="text-sm text-muted-foreground">
                  Select which ministries and positions this person serves in at each campus.
                </p>
                
                {selectedCampuses.length === 0 && userCampuses.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">
                    Assign a campus first to configure ministries.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {(isLeader ? campuses.filter(c => selectedCampuses.includes(c.id)) : campuses.filter(c => userCampuses.some(uc => uc.campus_id === c.id))).map((campus) => {
                      const campusMinistries = ministryAssignments
                        .filter(a => a.campus_id === campus.id)
                        .map(a => a.ministry_type);
                      
                      return (
                        <div key={campus.id} className="rounded-lg border p-4 space-y-4">
                          <p className="font-medium text-sm flex items-center gap-2">
                            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                            {campus.name}
                          </p>
                          
                          {/* Ministry Types */}
                          {isLeader || canEdit ? (
                            <div className="flex flex-wrap gap-3">
                              {MINISTRY_TYPES.filter(m => m.value !== 'weekend_team').map((ministry) => {
                                const isActive = campusMinistries.includes(ministry.value);
                                return (
                                  <label
                                    key={ministry.value}
                                    className="flex items-center gap-2 cursor-pointer"
                                  >
                                    <Checkbox
                                      checked={isActive}
                                      onCheckedChange={() => {
                                        if (profileId) {
                                          toggleMinistryAssignment.mutate({
                                            userId: profileId,
                                            campusId: campus.id,
                                            ministryType: ministry.value,
                                            isActive,
                                          });
                                        }
                                      }}
                                      disabled={toggleMinistryAssignment.isPending}
                                    />
                                    <span className="inline-flex items-center gap-1.5 text-sm">
                                      <span className={`w-2 h-2 rounded-full ${ministry.color}`} />
                                      {ministry.label}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {campusMinistries.length > 0 ? (
                                campusMinistries.map((mt) => {
                                  const ministry = MINISTRY_TYPES.find(m => m.value === mt);
                                  return ministry ? (
                                    <span
                                      key={mt}
                                      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium text-white ${ministry.color}`}
                                    >
                                      {ministry.label}
                                    </span>
                                  ) : null;
                                })
                              ) : (
                                <p className="text-sm text-muted-foreground">No ministries assigned</p>
                              )}
                            </div>
                          )}
                          
                          {/* Positions per Ministry - only show for active ministries */}
                          {campusMinistries.length > 0 && (
                            <div className="space-y-3 pt-2 border-t border-border/50">
                              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                Positions by Ministry
                              </p>
                              {campusMinistries.map((ministryType) => {
                                const ministry = MINISTRY_TYPES.find(m => m.value === ministryType);
                                const ministryPositions = campusMinistryPositions
                                  .filter(p => p.campus_id === campus.id && p.ministry_type === ministryType)
                                  .map(p => p.position);
                                
                                // Determine which position categories to show based on ministry type
                                // weekend_team shows all position categories (worship + production + video)
                                const showMusicPositions = ['weekend', 'weekend_team', 'encounter', 'eon', 'eon_weekend', 'evident', 'er'].includes(ministryType);
                                const showProductionPositions = ministryType === 'production' || ministryType === 'weekend_team';
                                const showVideoPositions = ministryType === 'video' || ministryType === 'weekend_team';
                                
                                return (
                                  <div key={ministryType} className="rounded-md bg-muted/30 p-3 space-y-2">
                                    <p className="text-sm font-medium flex items-center gap-1.5">
                                      <span className={`w-2 h-2 rounded-full ${ministry?.color || 'bg-muted'}`} />
                                      {ministry?.label || ministryType}
                                    </p>
                                    
                                    {isLeader || canEdit ? (
                                      <div className="space-y-2">
                                        {/* Vocals */}
                                        {showMusicPositions && (
                                          <div className="flex flex-wrap gap-2">
                                            <span className="text-xs text-muted-foreground w-16 pt-0.5">Vocals:</span>
                                            {POSITION_CATEGORIES.vocals.map((pos) => {
                                              const isPositionActive = ministryPositions.includes(pos);
                                              return (
                                                <label
                                                  key={pos}
                                                  className="flex items-center gap-1.5 cursor-pointer text-xs"
                                                >
                                                  <Checkbox
                                                    className="h-3.5 w-3.5"
                                                    checked={isPositionActive}
                                                    onCheckedChange={() => {
                                                      if (profileId) {
                                                        toggleCampusMinistryPosition.mutate({
                                                          userId: profileId,
                                                          campusId: campus.id,
                                                          ministryType,
                                                          position: pos,
                                                          isActive: isPositionActive,
                                                        });
                                                      }
                                                    }}
                                                    disabled={toggleCampusMinistryPosition.isPending}
                                                  />
                                                  <span>{POSITION_LABELS[pos]}</span>
                                                </label>
                                              );
                                            })}
                                          </div>
                                        )}
                                        
                                        {/* Instruments */}
                                        {showMusicPositions && (
                                          <div className="flex flex-wrap gap-2">
                                            <span className="text-xs text-muted-foreground w-16 pt-0.5">Band:</span>
                                            {POSITION_CATEGORIES.instruments.map((pos) => {
                                              const isPositionActive = ministryPositions.includes(pos);
                                              return (
                                                <label
                                                  key={pos}
                                                  className="flex items-center gap-1.5 cursor-pointer text-xs"
                                                >
                                                  <Checkbox
                                                    className="h-3.5 w-3.5"
                                                    checked={isPositionActive}
                                                    onCheckedChange={() => {
                                                      if (profileId) {
                                                        toggleCampusMinistryPosition.mutate({
                                                          userId: profileId,
                                                          campusId: campus.id,
                                                          ministryType,
                                                          position: pos,
                                                          isActive: isPositionActive,
                                                        });
                                                      }
                                                    }}
                                                    disabled={toggleCampusMinistryPosition.isPending}
                                                  />
                                                  <span>{POSITION_LABELS[pos]}</span>
                                                </label>
                                              );
                                            })}
                                          </div>
                                        )}
                                        
                                        {/* Production */}
                                        {showProductionPositions && (
                                          <div className="flex flex-wrap gap-2">
                                            <span className="text-xs text-muted-foreground w-16 pt-0.5">Audio:</span>
                                            {POSITION_CATEGORIES.audio.map((pos) => {
                                              const isPositionActive = ministryPositions.includes(pos);
                                              return (
                                                <label
                                                  key={pos}
                                                  className="flex items-center gap-1.5 cursor-pointer text-xs"
                                                >
                                                  <Checkbox
                                                    className="h-3.5 w-3.5"
                                                    checked={isPositionActive}
                                                    onCheckedChange={() => {
                                                      if (profileId) {
                                                        toggleCampusMinistryPosition.mutate({
                                                          userId: profileId,
                                                          campusId: campus.id,
                                                          ministryType,
                                                          position: pos,
                                                          isActive: isPositionActive,
                                                        });
                                                      }
                                                    }}
                                                    disabled={toggleCampusMinistryPosition.isPending}
                                                  />
                                                  <span>{POSITION_LABELS[pos]}</span>
                                                </label>
                                              );
                                            })}
                                          </div>
                                        )}
                                        
                                        {/* Video */}
                                        {showVideoPositions && (
                                          <div className="flex flex-wrap gap-2">
                                            <span className="text-xs text-muted-foreground w-16 pt-0.5">Video:</span>
                                            {POSITION_CATEGORIES.video.map((pos) => {
                                              const isPositionActive = ministryPositions.includes(pos);
                                              return (
                                                <label
                                                  key={pos}
                                                  className="flex items-center gap-1.5 cursor-pointer text-xs"
                                                >
                                                  <Checkbox
                                                    className="h-3.5 w-3.5"
                                                    checked={isPositionActive}
                                                    onCheckedChange={() => {
                                                      if (profileId) {
                                                        toggleCampusMinistryPosition.mutate({
                                                          userId: profileId,
                                                          campusId: campus.id,
                                                          ministryType,
                                                          position: pos,
                                                          isActive: isPositionActive,
                                                        });
                                                      }
                                                    }}
                                                    disabled={toggleCampusMinistryPosition.isPending}
                                                  />
                                                  <span>{POSITION_LABELS[pos]}</span>
                                                </label>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="flex flex-wrap gap-1.5">
                                        {ministryPositions.length > 0 ? (
                                          ministryPositions.map((pos) => (
                                            <span
                                              key={pos}
                                              className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
                                            >
                                              {POSITION_LABELS[pos] || pos}
                                            </span>
                                          ))
                                        ) : (
                                          <p className="text-xs text-muted-foreground">No positions assigned</p>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Privacy Settings - only for own profile */}
              {isOwnProfile && (
                <div className="space-y-4 rounded-lg border p-4 bg-muted/30">
                  <Label className="flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Privacy Settings
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Control who can see your contact information (email, phone, birthday, anniversary).
                  </p>
                  
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="share-campus" className="text-sm font-medium">
                          Share with campus members
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Allow other members in your campus to see your contact info
                        </p>
                      </div>
                      <Switch
                        id="share-campus"
                        checked={shareContactWithCampus}
                        onCheckedChange={setShareContactWithCampus}
                      />
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="share-pastors" className="text-sm font-medium">
                          Share with campus pastors
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Allow campus pastors to see your contact info
                        </p>
                      </div>
                      <Switch
                        id="share-pastors"
                        checked={shareContactWithPastors}
                        onCheckedChange={setShareContactWithPastors}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Push Notifications - only for own profile */}
              {isOwnProfile && (
                <div className="space-y-2 rounded-lg border p-4 bg-muted/30">
                  <PushNotificationToggle />
                  <TestPushNotification />
                </div>
              )}

              {/* Password Change - only for own profile */}
              {isOwnProfile && (
                <div className="space-y-4 rounded-lg border p-4 bg-muted/30">
                  <Label className="flex items-center gap-2">
                    <Key className="h-4 w-4" />
                    Change Password
                  </Label>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="currentPassword">Current Password</Label>
                      <Input
                        id="currentPassword"
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="Enter current password"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="newPassword">New Password</Label>
                      <Input
                        id="newPassword"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Enter new password"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">Confirm New Password</Label>
                      <Input
                        id="confirmPassword"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirm new password"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handlePasswordChange}
                      disabled={isChangingPassword || !currentPassword || !newPassword || !confirmPassword}
                      className="w-full gap-2"
                    >
                      {isChangingPassword ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Key className="h-4 w-4" />
                      )}
                      Update Password
                    </Button>
                  </div>
                </div>
              )}

              {canEdit && (
                <Button
                  type="submit"
                  className="w-full gap-2"
                  disabled={updateProfile.isPending || updateUserCampuses.isPending}
                >
                  {(updateProfile.isPending || updateUserCampuses.isPending) ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save Changes
                </Button>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
