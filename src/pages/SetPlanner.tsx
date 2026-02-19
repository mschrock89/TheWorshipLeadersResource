import { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SongAvailabilityList } from "@/components/set-planner/SongAvailabilityList";
import { BuildingSet, BuildingSetSong, ApprovalStatus } from "@/components/set-planner/BuildingSet";
import { SuggestionCards } from "@/components/set-planner/SuggestionCards";
import { ScheduledTeamRoster } from "@/components/set-planner/ScheduledTeamRoster";
import { SetPlannerSkeleton } from "@/components/set-planner/SetPlannerSkeleton";
import { PublishSetlistDialog } from "@/components/set-planner/PublishSetlistDialog";
import { useSongAvailability, useSaveDraftSet, useExistingSet, usePublishedSetlistSongs, SongAvailability } from "@/hooks/useSetPlanner";
import { useScheduledVocalists } from "@/hooks/useScheduledVocalists";
import { useAddCustomServiceAssignment, useCustomServiceAssignments, useCustomServiceCampusMembers, useCustomServiceOccurrences, useRemoveCustomServiceAssignment } from "@/hooks/useCustomServices";
import { useCampuses } from "@/hooks/useCampuses";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole, useUserRoles } from "@/hooks/useUserRoles";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { useQuery } from "@tanstack/react-query";
import { format, nextSunday, nextSaturday, isSaturday, isSunday, isWednesday, addDays, subDays, nextWednesday, subMonths, addMonths } from "date-fns";
import { CalendarIcon, ListMusic, Home, Music, Settings, Sparkles, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCampusSelectionOptional } from "@/components/layout/CampusSelectionContext";
import { POSITION_LABELS, SET_PLANNER_MINISTRY_OPTIONS } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";

const CUSTOM_SERVICE_ROLE_OPTIONS: Array<{
  value: Database["public"]["Enums"]["team_position"];
  label: string;
}> = [
  { value: "vocalist", label: "Vocalist" },
  { value: "acoustic_1", label: "AG 1" },
  { value: "acoustic_2", label: "AG 2" },
  { value: "electric_1", label: "EG 1" },
  { value: "electric_2", label: "EG 2" },
  { value: "bass", label: "Bass" },
  { value: "drums", label: "Drums" },
  { value: "keys", label: "Keys" },
  { value: "sound_tech", label: "FOH" },
  { value: "mon", label: "MON" },
  { value: "broadcast", label: "Broadcast" },
  { value: "audio_shadow", label: "Audio Shadow" },
  { value: "lighting", label: "Lighting" },
  { value: "media", label: "Lyrics" },
  { value: "producer", label: "Producer" },
  { value: "camera_1", label: "Camera 1" },
  { value: "camera_2", label: "Camera 2" },
  { value: "camera_3", label: "Camera 3" },
  { value: "camera_4", label: "Camera 4" },
  { value: "camera_5", label: "Camera 5" },
  { value: "camera_6", label: "Camera 6" },
  { value: "chat_host", label: "Chat Host" },
  { value: "director", label: "Director" },
  { value: "graphics", label: "Graphics" },
  { value: "switcher", label: "Switcher" },
];

const CUSTOM_SERVICE_VOCAL_ROLES = new Set<Database["public"]["Enums"]["team_position"]>([
  "vocalist",
  "lead_vocals",
  "harmony_vocals",
  "background_vocals",
]);


export default function SetPlanner() {
  const { user, isAdmin } = useAuth();
  const { data: userRole, isLoading: roleLoading } = useUserRole(user?.id);
  const { data: allUserRoles = [] } = useUserRoles(user?.id);
  const navigate = useNavigate();
  const { data: campuses } = useCampuses();
  
  // Use global campus selection context if available
  const campusContext = useCampusSelectionOptional();

  // All useState hooks MUST be called before any conditional returns
  const [localCampusId, setLocalCampusId] = useState<string>('');
  const [selectedMinistry, setSelectedMinistry] = useState<string>('weekend');
  const [lastSavedSetId, setLastSavedSetId] = useState<string | null>(null);
  const isPrayerNightMinistry = selectedMinistry === "prayer_night";
  
  // Determine ministry scheduling behavior
  const isMidweekMinistry = selectedMinistry === 'encounter' || selectedMinistry === 'eon';
  const isWeekendStyleMinistry = selectedMinistry === 'weekend' || selectedMinistry === 'eon_weekend';
  
  // Get appropriate default date based on ministry type
  const defaultDate = useMemo(() => {
    const today = new Date();
    if (isMidweekMinistry) {
      // If today is Wednesday, use today; otherwise next Wednesday
      return isWednesday(today) ? today : nextWednesday(today);
    }
    // For weekend services: if today is Saturday or Sunday, use this weekend's Saturday
    if (isSaturday(today)) {
      return today;
    }
    if (isSunday(today)) {
      return subDays(today, 1); // Use yesterday (Saturday)
    }
    if (isWeekendStyleMinistry) return nextSaturday(today);
    // Non-weekend ministries (e.g. Prayer Night) use exact date
    return today;
  }, [isMidweekMinistry, isWeekendStyleMinistry]);
  
  const [selectedDate, setSelectedDate] = useState<Date>(defaultDate);
  const [selectedCustomServiceKey, setSelectedCustomServiceKey] = useState<string>("none");
  const [customServiceMemberId, setCustomServiceMemberId] = useState<string>("");
  const [customServiceRoles, setCustomServiceRoles] = useState<Array<Database["public"]["Enums"]["team_position"]>>(["vocalist"]);
  const [customRolePopoverOpen, setCustomRolePopoverOpen] = useState(false);
  const [assignmentSaveState, setAssignmentSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [assignmentSavedAt, setAssignmentSavedAt] = useState<Date | null>(null);
  const [buildingSongs, setBuildingSongs] = useState<BuildingSetSong[]>([]);
  const [notes, setNotes] = useState('');

  // Check if user has network-level access (can see all campuses)
  const hasNetworkAccess = useMemo(() => {
    return allUserRoles.some(r => 
      r.role === 'network_worship_pastor' || 
      r.role === 'admin' || 
      r.role === 'network_worship_leader'
    );
  }, [allUserRoles]);

  // Get campus IDs user is assigned to (for campus worship pastors)
  const assignedCampusIds = useMemo(() => {
    return allUserRoles
      .filter(r => 
        (r.role === 'campus_worship_pastor' || r.role === 'student_worship_pastor') && 
        r.admin_campus_id
      )
      .map(r => r.admin_campus_id as string);
  }, [allUserRoles]);

  // Filter campuses based on user role
  const availableCampuses = useMemo(() => {
    if (!campuses) return [];
    
    // Network-level roles see all campuses
    if (hasNetworkAccess) return campuses;
    
    // Campus worship pastors only see their assigned campuses
    if (assignedCampusIds.length > 0) {
      return campuses.filter(c => assignedCampusIds.includes(c.id));
    }
    
    // Fallback - should not reach here for authorized users
    return [];
  }, [campuses, hasNetworkAccess, assignedCampusIds]);

  // Use global context if available, otherwise use local state
  const selectedCampusId = campusContext?.selectedCampusId || localCampusId;
  const setSelectedCampusId = (value: string) => {
    if (campusContext) {
      campusContext.setSelectedCampusId(value);
    } else {
      setLocalCampusId(value);
    }
  };

  const effectiveCampusId = selectedCampusId || availableCampuses[0]?.id || '';
  const currentCampus = availableCampuses.find(c => c.id === effectiveCampusId);

  // Check if current campus uses weekend grouping (has both Saturday and Sunday services)
  const isWeekendCampus = currentCampus?.has_saturday_service && currentCampus?.has_sunday_service;

  const { availability, isLoading } = useSongAvailability(
    effectiveCampusId,
    selectedMinistry,
    selectedDate
  );

  // Get scheduled vocalists for the date and campus
  const { data: scheduledVocalists = [] } = useScheduledVocalists(selectedDate, selectedMinistry, effectiveCampusId);

  // Get songs from published setlists for this campus/ministry (to filter from suggestions)
  const { data: publishedSetlistSongIds = new Set<string>() } = usePublishedSetlistSongs(effectiveCampusId, selectedMinistry);

  // Fetch existing set for this date/campus/ministry
  const planDateStr = format(selectedDate, 'yyyy-MM-dd');
  const rangeStart = format(subMonths(selectedDate, 1), "yyyy-MM-dd");
  const rangeEnd = format(addMonths(selectedDate, 3), "yyyy-MM-dd");
  const { data: customServiceOccurrences = [] } = useCustomServiceOccurrences({
    campusId: effectiveCampusId || undefined,
    startDate: rangeStart,
    endDate: rangeEnd,
  });
  const selectedCustomServiceIdForQuery = useMemo(() => {
    if (selectedCustomServiceKey === "none") return null;
    return customServiceOccurrences.find((s) => s.occurrence_key === selectedCustomServiceKey)?.id || null;
  }, [selectedCustomServiceKey, customServiceOccurrences]);
  const { data: existingSet, isLoading: existingSetLoading } = useExistingSet(
    effectiveCampusId,
    selectedMinistry,
    planDateStr,
    selectedCustomServiceIdForQuery
  );

  // Fetch approval status for the current set
  const { data: approvalData } = useQuery({
    queryKey: ["setlist-approval", existingSet?.id],
    queryFn: async () => {
      if (!existingSet?.id) return null;
      
      const { data } = await supabase
        .from("setlist_approvals")
        .select("id, status, notes, reviewed_at")
        .eq("draft_set_id", existingSet.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      return data;
    },
    enabled: !!existingSet?.id,
  });

  // Compute the effective approval status
  const approvalStatus: ApprovalStatus = useMemo(() => {
    if (existingSet?.status === "published") return "published";
    if (existingSet?.status === "pending_approval") return "pending_approval";
    if (approvalData?.status === "rejected") return "rejected";
    return "draft";
  }, [existingSet?.status, approvalData?.status]);

  const rejectionNotes = approvalData?.status === "rejected" ? approvalData.notes : null;

  const saveDraftSet = useSaveDraftSet();
  const addCustomServiceAssignment = useAddCustomServiceAssignment();
  const removeCustomServiceAssignment = useRemoveCustomServiceAssignment();

  const addedSongIds = useMemo(
    () => new Set(buildingSongs.map(s => s.song.id)),
    [buildingSongs]
  );

  const hasConflicts = useMemo(
    () => buildingSongs.some(s => s.status === 'too-recent'),
    [buildingSongs]
  );

  // Track the plan date to detect changes and force reload
  const [loadedForPlanDate, setLoadedForPlanDate] = useState<string | null>(null);

  // Load existing set when one is found for the selected date/campus/ministry
  useEffect(() => {
    // Wait until we have both the existing set and availability data
    if (existingSetLoading || !availability || availability.length === 0) {
      return;
    }
    
    // If no existing set, clear building songs (fresh start for this date)
    if (!existingSet) {
      // Only clear if we had a previously saved set (switching from a date with set to one without)
      if (lastSavedSetId) {
        setBuildingSongs([]);
        setNotes('');
        setLastSavedSetId(null);
      }
      setLoadedForPlanDate(planDateStr);
      return;
    }
    
    // Force reload if the plan date changed OR if we haven't loaded this set yet
    const needsReload = loadedForPlanDate !== planDateStr || 
                        lastSavedSetId !== existingSet.id || 
                        buildingSongs.length === 0;
    
    if (!needsReload) {
      return;
    }
    
    // Map existing songs to BuildingSetSong format
    const existingSongs: BuildingSetSong[] = (existingSet.draft_set_songs || [])
      .sort((a: any, b: any) => a.sequence_order - b.sequence_order)
      .map((dss: any) => {
        const songAvail = availability.find(a => a.song.id === dss.song_id);
        if (!songAvail) return null;
        // Support both legacy single vocalist and new multi-vocalist format
        const vocalistIds = dss.vocalist_ids || (dss.vocalist_id ? [dss.vocalist_id] : []);
        return {
          ...songAvail,
          selectedKey: dss.song_key,
          selectedVocalistId: vocalistIds[0] || null,
          selectedVocalistIds: vocalistIds,
        };
      })
      .filter(Boolean) as BuildingSetSong[];
    
    setBuildingSongs(existingSongs);
    setNotes(existingSet.notes || '');
    setLastSavedSetId(existingSet.id);
    setLoadedForPlanDate(planDateStr);
  }, [existingSet, existingSetLoading, availability, planDateStr]);

  // Redirect volunteers away from this page
  const isVolunteer = userRole === "volunteer" || userRole === "member";
  
  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // When ministry changes, update the selected date
  useEffect(() => {
    if (isMidweekMinistry && !isWednesday(selectedDate)) {
      setSelectedDate(nextWednesday(new Date()));
    } else if (isWeekendStyleMinistry && isWednesday(selectedDate)) {
      setSelectedDate(nextSaturday(new Date()));
    }
  }, [selectedMinistry, isMidweekMinistry, isWeekendStyleMinistry, selectedDate]);

  // When campus changes, reset the loaded date to force reload
  useEffect(() => {
    if (selectedCampusId) {
      setLoadedForPlanDate(null);
    }
  }, [selectedCampusId]);

  // When ministry changes, reset the loaded date to force reload  
  useEffect(() => {
    setLoadedForPlanDate(null);
  }, [selectedMinistry]);

  useEffect(() => {
    if (!roleLoading && isVolunteer) {
      navigate("/songs", { replace: true });
    }
  }, [isVolunteer, roleLoading, navigate]);

  const handleAddSong = useCallback((songAvail: SongAvailability) => {
    if (addedSongIds.has(songAvail.song.id)) return;
    // Auto-populate with suggested key from PCO history
    setBuildingSongs(prev => [...prev, { ...songAvail, selectedKey: songAvail.suggestedKey }]);
  }, [addedSongIds]);

  const handleRemoveSong = useCallback((songId: string) => {
    setBuildingSongs(prev => prev.filter(s => s.song.id !== songId));
  }, []);

  const handleReorderSongs = useCallback((newSongs: BuildingSetSong[]) => {
    setBuildingSongs(newSongs);
  }, []);

  const handleKeyChange = useCallback((songId: string, key: string | null) => {
    setBuildingSongs(prev => prev.map(s => 
      s.song.id === songId ? { ...s, selectedKey: key } : s
    ));
  }, []);

  const handleVocalistChange = useCallback((songId: string, vocalistIds: string[]) => {
    setBuildingSongs(prev => prev.map(s => 
      s.song.id === songId ? { ...s, selectedVocalistIds: vocalistIds, selectedVocalistId: vocalistIds[0] || null } : s
    ));
  }, []);

  // For weekend campuses, ensure we always store Saturday as the reference
  // For midweek ministries (Encounter/EON), only allow Wednesdays
  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;
    
    if (isMidweekMinistry) {
      // For Encounter/EON, snap to nearest Wednesday
      if (isWednesday(date)) {
        setSelectedDate(date);
      } else {
        setSelectedDate(nextWednesday(date));
      }
    } else if (isWeekendStyleMinistry && isWeekendCampus) {
      // If Sunday is selected, use the previous Saturday
      if (isSunday(date)) {
        setSelectedDate(subDays(date, 1));
      } else if (isSaturday(date)) {
        setSelectedDate(date);
      } else {
        // For any other day, go to the next Saturday
        setSelectedDate(nextSaturday(date));
      }
    } else {
      setSelectedDate(date);
    }
  };

  // Format the date display
  const formatDateDisplay = () => {
    if (isMidweekMinistry) {
      return format(selectedDate, 'EEE, MMM d, yyyy');
    }
    if (isWeekendStyleMinistry && isWeekendCampus) {
      const saturday = isSaturday(selectedDate) ? selectedDate : nextSaturday(selectedDate);
      const sunday = addDays(saturday, 1);
      return `${format(saturday, 'MMM d')}-${format(sunday, 'd, yyyy')}`;
    }
    return format(selectedDate, 'MMM d, yyyy');
  };
  
  // Disable dates based on ministry type (allow today and past dates for viewing)
  const isDateDisabled = (date: Date) => {
    if (isMidweekMinistry) {
      // Only allow Wednesdays for Encounter/EON
      return !isWednesday(date);
    }
    
    return false;
  };

  const handleSave = async () => {
    if (!user || !effectiveCampusId) return;

    const result = await saveDraftSet.mutateAsync({
      draftSet: {
        // Prefer updating the set we found for this campus/ministry/date
        id: existingSet?.id || lastSavedSetId || undefined,
        campus_id: effectiveCampusId,
        plan_date: format(selectedDate, 'yyyy-MM-dd'),
        ministry_type: selectedMinistry,
        custom_service_id: selectedCustomService?.id || null,
        created_by: user.id,
        status: existingSet?.status || 'draft', // Preserve published status
        notes: notes || null,
      },
      songs: buildingSongs.map((s, i) => ({
        song_id: s.song.id,
        sequence_order: i,
        song_key: s.selectedKey || undefined,
        vocalist_id: s.selectedVocalistIds?.[0] || s.selectedVocalistId || undefined,
        vocalist_ids: s.selectedVocalistIds || (s.selectedVocalistId ? [s.selectedVocalistId] : []),
      })),
    });

    // Store the saved set ID for publishing
    if (result) {
      setLastSavedSetId(result);
    }
  };

  const handlePublished = () => {
    // Keep the set loaded for continued editing - just update the status indicator
    // The existing set query will refresh and show the published status
  };

  const availableCustomServices = useMemo(
    () =>
      customServiceOccurrences.filter((s) => {
        if (s.ministry_type !== selectedMinistry) return false;
        return s.occurrence_date >= planDateStr;
      }),
    [customServiceOccurrences, selectedMinistry, planDateStr],
  );

  useEffect(() => {
    if (selectedCustomServiceKey === "none") return;
    const stillValid = availableCustomServices.some((s) => s.occurrence_key === selectedCustomServiceKey);
    if (!stillValid) {
      setSelectedCustomServiceKey("none");
    }
  }, [selectedCustomServiceKey, availableCustomServices]);

  const servicesOnSelectedDate = useMemo(
    () =>
      customServiceOccurrences.filter(
        (s) => s.ministry_type === selectedMinistry && s.occurrence_date === planDateStr,
      ),
    [customServiceOccurrences, selectedMinistry, planDateStr],
  );

  const applyCustomService = (serviceKey: string) => {
    if (serviceKey === "none") {
      setSelectedCustomServiceKey("none");
      return;
    }
    const service = customServiceOccurrences.find((s) => s.occurrence_key === serviceKey);
    if (!service) return;

    setSelectedCustomServiceKey(serviceKey);
    setSelectedMinistry(service.ministry_type);
    setSelectedDate(new Date(`${service.occurrence_date}T12:00:00`));
  };

  const selectedCustomService = useMemo(
    () => customServiceOccurrences.find((s) => s.occurrence_key === selectedCustomServiceKey) || null,
    [customServiceOccurrences, selectedCustomServiceKey],
  );

  const { data: customServiceAssignments = [] } = useCustomServiceAssignments(
    selectedCustomService?.id,
    selectedCustomService?.occurrence_date,
  );

  const { data: customServiceCampusMembers = [] } = useCustomServiceCampusMembers(
    selectedCustomService?.campus_id || effectiveCampusId || undefined,
    selectedMinistry,
  );

  const groupedCustomServiceAssignments = useMemo(() => {
    const grouped = new Map<
      string,
      {
        userId: string;
        userName: string;
        assignments: typeof customServiceAssignments;
      }
    >();

    for (const assignment of customServiceAssignments) {
      const existing = grouped.get(assignment.user_id);
      if (existing) {
        existing.assignments.push(assignment);
      } else {
        grouped.set(assignment.user_id, {
          userId: assignment.user_id,
          userName: assignment.profiles?.full_name || "Unknown Member",
          assignments: [assignment],
        });
      }
    }

    return Array.from(grouped.values())
      .map((entry) => ({
        ...entry,
        assignments: [...entry.assignments].sort((a, b) =>
          (POSITION_LABELS[a.role] || a.role).localeCompare(POSITION_LABELS[b.role] || b.role),
        ),
      }))
      .sort((a, b) => a.userName.localeCompare(b.userName));
  }, [customServiceAssignments]);

  const effectiveVocalists = useMemo(() => {
    if (!selectedCustomService) return scheduledVocalists;

    const byUser = new Map<string, { userId: string; name: string; avatarUrl: string | null; position: string; isSwappedIn?: boolean }>();
    for (const assignment of customServiceAssignments) {
      if (!CUSTOM_SERVICE_VOCAL_ROLES.has(assignment.role)) continue;
      if (byUser.has(assignment.user_id)) continue;
      byUser.set(assignment.user_id, {
        userId: assignment.user_id,
        name: assignment.profiles?.full_name || "Unknown",
        avatarUrl: assignment.profiles?.avatar_url || null,
        position: assignment.role,
        isSwappedIn: false,
      });
    }
    return Array.from(byUser.values());
  }, [selectedCustomService, scheduledVocalists, customServiceAssignments]);

  const canOverrideSongRestrictions = isAdmin && !!selectedCustomService;

  useEffect(() => {
    if (!selectedCustomService) {
      setCustomServiceMemberId("");
      setCustomServiceRoles(["vocalist"]);
      return;
    }
    if (customServiceCampusMembers.length > 0) {
      setCustomServiceMemberId((prev) => prev || customServiceCampusMembers[0].id);
    } else {
      setCustomServiceMemberId("");
    }
  }, [selectedCustomService, customServiceCampusMembers]);

  const toggleCustomRole = (role: Database["public"]["Enums"]["team_position"]) => {
    setCustomServiceRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  };

  const selectedRoleSummary =
    customServiceRoles.length === 0
      ? "Select roles"
      : customServiceRoles.length === 1
      ? CUSTOM_SERVICE_ROLE_OPTIONS.find((r) => r.value === customServiceRoles[0])?.label || "1 role"
      : `${customServiceRoles.length} roles selected`;

  const customAssignmentStatusText = useMemo(() => {
    if (assignmentSaveState === "saving") return "Saving assignments...";
    if (assignmentSaveState === "saved" && assignmentSavedAt) {
      return `Saved at ${format(assignmentSavedAt, "h:mm a")}`;
    }
    if (assignmentSaveState === "error") return "Could not save. Please try again.";
    return "Assignments auto-save instantly.";
  }, [assignmentSaveState, assignmentSavedAt]);

  // Show loading skeleton while checking role
  if (roleLoading) {
    return <SetPlannerSkeleton />;
  }

  // Don't render if volunteer (will redirect)
  if (isVolunteer) {
    return null;
  }

  return (
    <>
      <div className="space-y-4 overflow-hidden">
        {/* Breadcrumb Navigation */}
        <Breadcrumb>
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
              <BreadcrumbLink asChild>
                <Link to="/songs" className="flex items-center gap-1.5">
                  <Music className="h-3.5 w-3.5" />
                  Songs
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Set Builder</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ListMusic className="h-6 w-6" />
              Set Builder
            </h1>
            <p className="text-sm text-muted-foreground">
              Plan your worship sets with smart song rotation rules
            </p>
          </div>
          <Link to="/manage-sets">
            <Button variant="outline" size="sm" className="gap-2">
              <Settings className="h-4 w-4" />
              Manage Sets
            </Button>
          </Link>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="py-4">
            <div className="flex flex-wrap gap-4">
              {/* Date picker */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Target {isMidweekMinistry ? 'Wednesday' : isWeekendStyleMinistry && isWeekendCampus ? 'Weekend' : 'Date'}
                </label>
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex h-9 w-[180px] items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1"
                    >
                      <span>{formatDateDisplay()}</span>
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 opacity-50"><path d="m6 9 6 6 6-6"/></svg>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={handleDateSelect}
                      initialFocus
                      disabled={isDateDisabled}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Campus selector */}
              {availableCampuses.length > 1 && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Campus</label>
                  <Select value={effectiveCampusId} onValueChange={setSelectedCampusId}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Select campus" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableCampuses.map(campus => (
                        <SelectItem key={campus.id} value={campus.id}>
                          {campus.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Ministry selector */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Ministry</label>
                <Select value={selectedMinistry} onValueChange={setSelectedMinistry}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SET_PLANNER_MINISTRY_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Custom service quick selector */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Custom Service</label>
                <Select value={selectedCustomServiceKey} onValueChange={applyCustomService}>
                  <SelectTrigger className="w-[260px]">
                    <SelectValue placeholder="Select a custom service" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {availableCustomServices.map((service) => (
                      <SelectItem key={service.occurrence_key} value={service.occurrence_key}>
                        {service.service_name} • {format(new Date(`${service.occurrence_date}T12:00:00`), "MMM d")}
                        {service.start_time ? ` • ${service.start_time.slice(0, 5)}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Rules reminder */}
            <div className="mt-3 text-xs text-muted-foreground flex gap-4">
              <span>• Standard songs: 8 week wait</span>
              <span>• New songs (&lt;3 uses): 4 week wait</span>
            </div>

            {servicesOnSelectedDate.length > 0 && (
              <div className="mt-3 rounded-md border border-primary/20 bg-primary/5 p-3">
                <p className="text-xs font-medium text-primary flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" />
                  Custom service{servicesOnSelectedDate.length > 1 ? "s" : ""} on this date
                </p>
                <div className="mt-1.5 space-y-1">
                  {servicesOnSelectedDate.map((service) => (
                    <p key={service.occurrence_key} className="text-xs text-muted-foreground">
                      {service.service_name}
                      {service.start_time ? ` • ${service.start_time.slice(0, 5)}` : ""}
                      {service.end_time ? `-${service.end_time.slice(0, 5)}` : ""}
                      {service.repeats_weekly ? " • repeats weekly" : ""}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Team Roster - full width */}
        {!isPrayerNightMinistry && (
          <ScheduledTeamRoster targetDate={selectedDate} ministryType={selectedMinistry} campusId={effectiveCampusId} />
        )}

        {/* Custom Service Team Assignments */}
        {selectedCustomService && !isPrayerNightMinistry && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5" />
                Custom Service Team Assignments
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {selectedCustomService.service_name} • {selectedCustomService.occurrence_date}
              </p>
              <p className={cn(
                "text-xs",
                assignmentSaveState === "saving" && "text-amber-500",
                assignmentSaveState === "saved" && "text-emerald-500",
                assignmentSaveState === "error" && "text-destructive",
                assignmentSaveState === "idle" && "text-muted-foreground",
              )}>
                {customAssignmentStatusText}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
                <Select value={customServiceMemberId} onValueChange={setCustomServiceMemberId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select team member" />
                  </SelectTrigger>
                  <SelectContent>
                    {customServiceCampusMembers.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.full_name || "Unnamed Member"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Popover open={customRolePopoverOpen} onOpenChange={setCustomRolePopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" className="justify-between">
                      <span className="truncate">{selectedRoleSummary}</span>
                      <span className="text-xs text-muted-foreground">▼</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[260px] p-0" align="start">
                    <div className="border-b px-3 py-2">
                      <p className="text-sm font-medium">Assign Role(s)</p>
                      <p className="text-xs text-muted-foreground">Select one or more roles</p>
                    </div>
                    <div className="max-h-[260px] overflow-y-auto p-1">
                      {CUSTOM_SERVICE_ROLE_OPTIONS.map((role) => {
                        const checked = customServiceRoles.includes(role.value);
                        return (
                          <button
                            key={role.value}
                            type="button"
                            onClick={() => toggleCustomRole(role.value)}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted"
                          >
                            <Checkbox checked={checked} />
                            <span className="text-sm">{role.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>

                <Button
                  onClick={async () => {
                    if (!customServiceMemberId || customServiceRoles.length === 0) return;
                    setAssignmentSaveState("saving");
                    try {
                      await Promise.all(
                        customServiceRoles.map((role) =>
                          addCustomServiceAssignment.mutateAsync({
                            custom_service_id: selectedCustomService.id,
                            assignment_date: selectedCustomService.occurrence_date,
                            user_id: customServiceMemberId,
                            role,
                          }),
                        ),
                      );
                      setAssignmentSaveState("saved");
                      setAssignmentSavedAt(new Date());
                    } catch {
                      setAssignmentSaveState("error");
                    }
                  }}
                  disabled={!customServiceMemberId || customServiceRoles.length === 0 || addCustomServiceAssignment.isPending || assignmentSaveState === "saving"}
                >
                  Assign
                </Button>
              </div>

              {customServiceAssignments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No team members assigned to this custom service yet.</p>
              ) : (
                <div className="space-y-2">
                  {groupedCustomServiceAssignments.map((member) => (
                    <div
                      key={member.userId}
                      className="rounded-md border border-border p-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{member.userName}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {member.assignments.map((assignment) => (
                            <Badge key={assignment.id} variant="secondary" className="text-xs pr-1">
                              {POSITION_LABELS[assignment.role] || assignment.role}
                              <button
                                type="button"
                                className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded hover:bg-black/10"
                                onClick={async () => {
                                  setAssignmentSaveState("saving");
                                  try {
                                    await removeCustomServiceAssignment.mutateAsync({
                                      id: assignment.id,
                                      custom_service_id: assignment.custom_service_id,
                                      assignment_date: assignment.assignment_date,
                                    });
                                    setAssignmentSaveState("saved");
                                    setAssignmentSavedAt(new Date());
                                  } catch {
                                    setAssignmentSaveState("error");
                                  }
                                }}
                                disabled={removeCustomServiceAssignment.isPending || assignmentSaveState === "saving"}
                                aria-label={`Remove ${POSITION_LABELS[assignment.role] || assignment.role} role`}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {selectedCustomService && isPrayerNightMinistry && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5" />
                Prayer Night
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {selectedCustomService.service_name} • {selectedCustomService.occurrence_date}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Prayer Night roster supports optional role assignments.
              </p>

              <div className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
                <Select value={customServiceMemberId} onValueChange={setCustomServiceMemberId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select team member" />
                  </SelectTrigger>
                  <SelectContent>
                    {customServiceCampusMembers.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.full_name || "Unnamed Member"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Popover open={customRolePopoverOpen} onOpenChange={setCustomRolePopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" className="justify-between">
                      <span className="truncate">{selectedRoleSummary}</span>
                      <span className="text-xs text-muted-foreground">▼</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[260px] p-0" align="start">
                    <div className="border-b px-3 py-2">
                      <p className="text-sm font-medium">Assign Role(s)</p>
                      <p className="text-xs text-muted-foreground">Select one or more roles</p>
                    </div>
                    <div className="max-h-[260px] overflow-y-auto p-1">
                      {CUSTOM_SERVICE_ROLE_OPTIONS.map((role) => {
                        const checked = customServiceRoles.includes(role.value);
                        return (
                          <button
                            key={role.value}
                            type="button"
                            onClick={() => toggleCustomRole(role.value)}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted"
                          >
                            <Checkbox checked={checked} />
                            <span className="text-sm">{role.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>

                <Button
                  onClick={async () => {
                    if (!customServiceMemberId || customServiceRoles.length === 0) return;
                    setAssignmentSaveState("saving");
                    try {
                      await Promise.all(
                        customServiceRoles.map((role) =>
                          addCustomServiceAssignment.mutateAsync({
                            custom_service_id: selectedCustomService.id,
                            assignment_date: selectedCustomService.occurrence_date,
                            user_id: customServiceMemberId,
                            role,
                          }),
                        ),
                      );
                      setAssignmentSaveState("saved");
                      setAssignmentSavedAt(new Date());
                    } catch {
                      setAssignmentSaveState("error");
                    }
                  }}
                  disabled={!customServiceMemberId || customServiceRoles.length === 0 || addCustomServiceAssignment.isPending || assignmentSaveState === "saving"}
                >
                  Assign
                </Button>
              </div>

              {customServiceAssignments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No team members assigned to this Prayer Night yet.</p>
              ) : (
                <div className="space-y-2">
                  {groupedCustomServiceAssignments.map((member) => (
                    <div key={member.userId} className="rounded-md border border-border p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{member.userName}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {member.assignments.map((assignment) => (
                            <Badge key={assignment.id} variant="secondary" className="text-xs pr-1">
                              {POSITION_LABELS[assignment.role] || assignment.role}
                              <button
                                type="button"
                                className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded hover:bg-black/10"
                                onClick={async () => {
                                  setAssignmentSaveState("saving");
                                  try {
                                    await removeCustomServiceAssignment.mutateAsync({
                                      id: assignment.id,
                                      custom_service_id: assignment.custom_service_id,
                                      assignment_date: assignment.assignment_date,
                                    });
                                    setAssignmentSaveState("saved");
                                    setAssignmentSavedAt(new Date());
                                  } catch {
                                    setAssignmentSaveState("error");
                                  }
                                }}
                                disabled={removeCustomServiceAssignment.isPending || assignmentSaveState === "saving"}
                                aria-label={`Remove ${POSITION_LABELS[assignment.role] || assignment.role} role`}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Smart suggestions - under team roster */}
        <SuggestionCards
          availability={availability}
          onAddSong={handleAddSong}
          addedSongIds={addedSongIds}
          publishedSetlistSongIds={publishedSetlistSongIds}
        />

        {/* Main content: two panels */}
        <div className="flex flex-col lg:grid lg:grid-cols-2 gap-4">
          {/* Left: Building set */}
          <BuildingSet
            songs={buildingSongs}
            onRemoveSong={handleRemoveSong}
            onReorderSongs={handleReorderSongs}
            onKeyChange={handleKeyChange}
            onVocalistChange={handleVocalistChange}
            onSave={handleSave}
            isSaving={saveDraftSet.isPending}
            notes={notes}
            onNotesChange={setNotes}
            hasConflicts={hasConflicts}
            vocalists={effectiveVocalists}
            isPublished={existingSet?.status === 'published'}
            approvalStatus={approvalStatus}
            rejectionNotes={rejectionNotes}
            publishButton={
              approvalStatus !== "pending_approval" ? (
                <PublishSetlistDialog
                  draftSetId={lastSavedSetId || undefined}
                  songs={buildingSongs}
                  targetDate={selectedDate}
                  ministryType={selectedMinistry}
                  campusId={effectiveCampusId}
                  customServiceId={selectedCustomService?.id || undefined}
                  onPublished={handlePublished}
                />
              ) : null
            }
          />

          {/* Right: Song browser */}
          <Card className="flex flex-col min-w-0 min-h-[400px] lg:min-h-[500px]">
            <CardHeader className="pb-3 shrink-0">
              <CardTitle className="text-lg">Song Library</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-w-0 pb-4 overflow-x-visible overflow-y-hidden">
              <SongAvailabilityList
                availability={availability}
                onAddSong={handleAddSong}
                addedSongIds={addedSongIds}
                publishedSetlistSongIds={publishedSetlistSongIds}
                isLoading={isLoading}
                allowSchedulingOverrides={canOverrideSongRestrictions}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
