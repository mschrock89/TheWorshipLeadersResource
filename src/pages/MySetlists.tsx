import { useEffect, useRef, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { addDays, format, getDay, parseISO, subDays } from "date-fns";
import { Home, ListMusic, Check, Clock, Music2, Mic2, Guitar, ArrowLeftRight, ChevronLeft, ChevronRight, Headphones, MapPin, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { usePublishedSetlists, useConfirmSetlist } from "@/hooks/useSetlistConfirmations";
import { useMySetlistPlaylists } from "@/hooks/useSetlistPlaylists";
import { useCampuses, useUserCampuses } from "@/hooks/useCampuses";
import { useApproveSetlist, useIsApprover, usePendingApprovals, useRejectSetlist } from "@/hooks/useSetlistApprovals";
import { MINISTRY_TYPES } from "@/lib/constants";
import { groupByWeekend, parseLocalDate } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { SetlistConfirmationWidget } from "@/components/dashboard/SetlistConfirmationWidget";
import { SetlistPlaylistCard } from "@/components/audio/SetlistPlaylistCard";
import { useCampusSelectionOptional } from "@/components/layout/CampusSelectionContext";
import { isAuditionCandidateRole } from "@/lib/access";
import { POSITION_LABELS, POSITION_LABELS_SHORT, POSITION_SLOTS } from "@/lib/constants";
import { useTeamRosterForDate } from "@/hooks/useTeamRosterForDate";
import { supabase } from "@/integrations/supabase/client";

const WEEKEND_MINISTRY_TYPES = new Set(["weekend", "weekend_team", "sunday_am"]);

function getSetlistDisplayDate(planDate: string, ministryType: string) {
  const date = parseLocalDate(planDate);
  const day = getDay(date);

  if (WEEKEND_MINISTRY_TYPES.has(ministryType)) {
    const saturday = day === 0 ? subDays(date, 1) : date;
    const sunday = addDays(saturday, 1);
    return `${format(saturday, "EEEE, MMMM d")} - ${format(sunday, "EEEE, MMMM d, yyyy")}`;
  }

  return format(date, "EEEE, MMMM d, yyyy");
}

function StandardMySetlists() {
  const { isAdmin, user } = useAuth();
  const [searchParams] = useSearchParams();
  const highlightSetId = searchParams.get("setId");
  const { data: campuses } = useCampuses();
  const { data: userCampuses = [] } = useUserCampuses(user?.id);
  const { data: isApprover = false } = useIsApprover();
  
  // Use global campus selection context if available
  const campusContext = useCampusSelectionOptional();
  const [localCampusId, setLocalCampusId] = useState<string>("");

  const assignedCampusIds = useMemo(
    () => new Set(userCampuses.map((uc) => uc.campus_id)),
    [userCampuses]
  );
  const assignedCampuses = useMemo(() => {
    if (!campuses) return [];
    return campuses.filter((campus) => assignedCampusIds.has(campus.id));
  }, [campuses, assignedCampusIds]);
  
  // Sync with global context - use context value if set, otherwise use local state
  const selectedCampusId = campusContext?.selectedCampusId || localCampusId;
  const setSelectedCampusId = (value: string) => {
    if (campusContext) {
      campusContext.setSelectedCampusId(value);
    } else {
      setLocalCampusId(value);
    }
  };

  const normalizedCampusId = useMemo(() => {
    if (isApprover) {
      const allCampuses = campuses || [];
      if (selectedCampusId && allCampuses.some((campus) => campus.id === selectedCampusId)) {
        return selectedCampusId;
      }
      if (allCampuses.length > 0) return allCampuses[0].id;
      return "__none__";
    }

    if (selectedCampusId && assignedCampusIds.has(selectedCampusId)) return selectedCampusId;
    if (assignedCampuses.length > 0) return assignedCampuses[0].id;
    return "__none__";
  }, [selectedCampusId, assignedCampusIds, assignedCampuses, isApprover, campuses]);

  useEffect(() => {
    if (normalizedCampusId === "__none__") return;
    if (selectedCampusId !== normalizedCampusId) {
      setSelectedCampusId(normalizedCampusId);
    }
  }, [normalizedCampusId, selectedCampusId]);

  const { data: upcomingSetlists, isLoading: loadingUpcoming } = usePublishedSetlists(
    normalizedCampusId,
    undefined, 
    false
  );
  const { data: pastSetlists, isLoading: loadingPast } = usePublishedSetlists(
    normalizedCampusId,
    undefined, 
    true
  );
  const { data: playlists, isLoading: loadingPlaylists } = useMySetlistPlaylists();
  const confirmSetlist = useConfirmSetlist();
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [currentIndex, setCurrentIndex] = useState(0);

  const today = new Date().toISOString().split("T")[0];

  // Combine all setlists into one chronological list (past first, then upcoming)
  const allGroupedSetlists = useMemo(() => {
    const pastItems = pastSetlists?.filter(s => s.plan_date < today) || [];
    const upcomingItems = upcomingSetlists || [];
    
    // Convert to format expected by groupByWeekend
    const allWithScheduleDate = [...pastItems, ...upcomingItems].map(s => ({
      ...s,
      scheduleDate: s.plan_date
    }));
    
    // Sort chronologically (oldest first)
    allWithScheduleDate.sort((a, b) => a.scheduleDate.localeCompare(b.scheduleDate));
    
    return groupByWeekend(allWithScheduleDate);
  }, [pastSetlists, upcomingSetlists, today]);

  const visibleGroupedSetlists = useMemo(() => {
    if (isAdmin) return allGroupedSetlists;
    return allGroupedSetlists
      .map((group) => ({
        ...group,
        items: group.items.filter((setlist) => setlist.amIOnRoster === true),
      }))
      .filter((group) => group.items.length > 0);
  }, [allGroupedSetlists, isAdmin]);

  // Find the index of the first upcoming/current setlist to start there
  const initialIndex = useMemo(() => {
    const idx = visibleGroupedSetlists.findIndex(g => g.saturdayDate >= today);
    return idx >= 0 ? idx : Math.max(0, visibleGroupedSetlists.length - 1);
  }, [visibleGroupedSetlists, today]);

  // Set initial index once data loads
  useEffect(() => {
    if (visibleGroupedSetlists.length > 0) {
      setCurrentIndex(initialIndex);
    }
  }, [initialIndex, visibleGroupedSetlists.length]);

  const isLoading = loadingUpcoming || loadingPast;

  if (isApprover) {
    const approverCampuses = campuses || [];
    return (
        <ApproverMySetlists
          campuses={approverCampuses}
        selectedCampusId={normalizedCampusId}
        setSelectedCampusId={setSelectedCampusId}
      />
    );
  }

  // Handle deep-link navigation to specific setlist
  useEffect(() => {
    if (highlightSetId && visibleGroupedSetlists.length > 0 && !isLoading) {
      const groupIndex = visibleGroupedSetlists.findIndex(g => 
        g.items.some(item => item.id === highlightSetId)
      );
      if (groupIndex !== -1) {
        setCurrentIndex(groupIndex);
        // Scroll to and highlight the specific card after a short delay
        setTimeout(() => {
          const element = cardRefs.current[highlightSetId];
          if (element) {
            element.scrollIntoView({ behavior: "smooth", block: "center" });
            element.classList.add("ring-2", "ring-primary", "ring-offset-2");
            setTimeout(() => {
              element.classList.remove("ring-2", "ring-primary", "ring-offset-2");
            }, 3000);
          }
        }, 100);
      }
    }
  }, [highlightSetId, visibleGroupedSetlists, isLoading]);

  const goToPrevious = () => {
    setCurrentIndex(prev => Math.max(0, prev - 1));
  };

  const goToNext = () => {
    setCurrentIndex(prev => Math.min(visibleGroupedSetlists.length - 1, prev + 1));
  };

  const currentGroup = visibleGroupedSetlists[currentIndex];

  // Determine if current group is past, present (this weekend), or future
  const isPast = currentGroup && currentGroup.sundayDate < today;

  const getMinistryLabel = (type: string) => {
    return MINISTRY_TYPES.find(m => m.value === type)?.label || type;
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  // Check if this is a weekend group (has both Saturday and Sunday)
  const isWeekendGroup = currentGroup && currentGroup.saturdayDate !== currentGroup.sundayDate;

  // Format the date header
  const getDateHeader = () => {
    if (!currentGroup) return "";
    
    const satDate = parseLocalDate(currentGroup.saturdayDate);
    
    if (isWeekendGroup) {
      const sunDate = parseLocalDate(currentGroup.sundayDate);
      return `${format(satDate, "MMM d")} - ${format(sunDate, "d, yyyy")}`;
    }
    
    return format(satDate, "EEEE, MMMM d, yyyy");
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
            <BreadcrumbPage>My Setlists</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ListMusic className="h-6 w-6" />
            My Setlists
          </h1>
          <p className="text-sm text-muted-foreground">
            Review published setlists for your upcoming dates
          </p>
        </div>
        
        {/* Campus Filter */}
        <div className="flex items-center gap-2 shrink-0">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <Select value={normalizedCampusId} onValueChange={setSelectedCampusId} disabled={assignedCampuses.length === 0}>
            <SelectTrigger className="w-auto min-w-[160px]">
              <SelectValue placeholder="Select Campus" />
            </SelectTrigger>
            <SelectContent>
              {assignedCampuses.map((campus) => (
                <SelectItem key={campus.id} value={campus.id}>
                  {campus.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Admin Setlist Confirmation Widget */}
      {isAdmin && (
        <SetlistConfirmationWidget selectedCampusId={normalizedCampusId} />
      )}

      {visibleGroupedSetlists.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Music2 className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {normalizedCampusId === "__none__" ? "No campus assigned" : "No setlists found"}
            </p>
            <p className="text-sm text-muted-foreground">
              {normalizedCampusId === "__none__"
                ? "Ask an admin to assign you to at least one campus."
                : "You'll see setlists here when they're published for your scheduled dates"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Date Navigation Header */}
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon"
              onClick={goToPrevious}
              disabled={currentIndex === 0}
              className="h-10 w-10"
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>
            
            <div className="text-center">
              <h2 className="text-lg font-semibold">{getDateHeader()}</h2>
              {isWeekendGroup && (
                <p className="text-sm text-muted-foreground">Weekend Worship</p>
              )}
              <div className="flex items-center justify-center gap-2 mt-1">
                {isPast && (
                  <Badge variant="secondary" className="text-xs">Past</Badge>
                )}
              </div>
            </div>
            
            <Button
              variant="ghost"
              size="icon"
              onClick={goToNext}
              disabled={currentIndex === visibleGroupedSetlists.length - 1}
              className="h-10 w-10"
            >
              <ChevronRight className="h-6 w-6" />
            </Button>
          </div>

          {/* Setlists for current date group */}
          {currentGroup?.items.map(setlist => {
            const isConfirmed = !!setlist.myConfirmation;
            const planDate = parseLocalDate(setlist.scheduleDate);
            const setlistPlaylists = playlists?.filter(p => p.draft_set_id === setlist.id) ?? [];

            return (
              <Card 
                key={setlist.id} 
                ref={(el) => { cardRefs.current[setlist.id] = el; }}
                className={`transition-all duration-300 ${isConfirmed ? "border-green-500/30" : ""}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">
                        <Link 
                          to={`/calendar?date=${setlist.scheduleDate}`}
                          className="hover:text-primary hover:underline transition-colors"
                        >
                          {getSetlistDisplayDate(setlist.scheduleDate, setlist.ministry_type)}
                        </Link>
                      </CardTitle>
                      <div className="flex items-center gap-1.5 mt-2">
                        <Badge variant="secondary" className="text-xs font-medium">
                          {getMinistryLabel(setlist.ministry_type)}
                        </Badge>
                        {setlist.campuses && (
                          <Badge variant="outline" className="text-xs font-normal">
                            {setlist.campuses.name}
                          </Badge>
                        )}
                      </div>
                    </div>
                    {isConfirmed ? (
                      <Badge className="bg-green-600 text-white gap-1">
                        <Check className="h-3 w-3" />
                        Confirmed
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 text-amber-600 border-amber-500">
                        <Clock className="h-3 w-3" />
                        Needs Review
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Songs list */}
                  <div className="space-y-2">
                    <TooltipProvider>
                      {setlist.songs.map((item, index) => (
                        <div
                          key={item.id}
                          className="flex items-center gap-3 p-2 rounded-lg bg-muted/50"
                        >
                          <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-medium flex items-center justify-center shrink-0">
                            {index + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-sm truncate">
                                {item.song?.title || "Unknown Song"}
                              </p>
                              {item.isFirstUse && (
                                <Badge className="bg-ecc-teal text-white text-[10px] px-1.5 py-0 h-4 shrink-0">
                                  NEW
                                </Badge>
                              )}
                            </div>
                            {item.song?.author && (
                              <p className="text-xs text-muted-foreground truncate">
                                {item.song.author}
                              </p>
                            )}
                          </div>
                          {item.song_key && (
                            <Badge variant="outline" className="text-xs font-medium shrink-0">
                              {item.song_key}
                            </Badge>
                          )}
                          {(() => {
                            const displayVocalists = (item.vocalists && item.vocalists.length > 0)
                              ? item.vocalists
                              : (item.vocalist ? [item.vocalist] : []);
                            if (displayVocalists.length === 0) return null;
                            const displayNames = displayVocalists
                              .map((v) => v.full_name)
                              .filter(Boolean)
                              .join(", ");
                            return (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <div className="flex -space-x-2">
                                    {displayVocalists.slice(0, 2).map((vocalist) => (
                                      <Avatar key={vocalist.id} className="h-6 w-6 ring-2 ring-background">
                                        <AvatarImage src={vocalist.avatar_url || undefined} />
                                        <AvatarFallback className="text-[10px] bg-gradient-to-br from-primary/30 to-primary/10 text-primary">
                                          {getInitials(vocalist.full_name || "?")}
                                        </AvatarFallback>
                                      </Avatar>
                                    ))}
                                  </div>
                                  {displayVocalists.length > 2 && (
                                    <span className="text-[10px] text-muted-foreground">+{displayVocalists.length - 2}</span>
                                  )}
                                  <Mic2 className="h-3 w-3 text-muted-foreground" />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs">{displayNames} {displayVocalists.length > 1 ? "are" : "is"} leading</p>
                              </TooltipContent>
                            </Tooltip>
                            );
                          })()}
                        </div>
                      ))}
                    </TooltipProvider>
                  </div>

                  {/* Notes */}
                  {setlist.notes && (
                    <div className="text-sm p-3 rounded-lg bg-muted/50 border">
                      <p className="font-medium text-xs text-muted-foreground mb-1">Notes</p>
                      <p>{setlist.notes}</p>
                    </div>
                  )}

                  <SetlistTeamRoster
                    planDate={setlist.plan_date}
                    campusId={setlist.campus_id}
                    ministryType={setlist.ministry_type}
                    customServiceId={setlist.custom_service_id}
                    getInitials={getInitials}
                  />

                  {/* Confirm button - only for users on the team roster for this setlist */}
                  {!isConfirmed && setlist.amIOnRoster && (
                    <Button
                      onClick={() => confirmSetlist.mutate(setlist.id)}
                      disabled={confirmSetlist.isPending}
                      className="w-full bg-green-600 hover:bg-green-700 text-white"
                    >
                      <Check className="mr-2 h-4 w-4" />
                      Confirm I've Reviewed This Setlist
                    </Button>
                  )}

                  {!isConfirmed && setlist.amIOnRoster === false && (
                    <p className="text-xs text-center text-muted-foreground">
                      You're not on the team roster for this service, so you can't confirm.
                    </p>
                  )}

                  {isConfirmed && setlist.myConfirmation && (
                    <p className="text-xs text-center text-muted-foreground">
                      Confirmed on {format(parseISO(setlist.myConfirmation.confirmed_at), "MMM d 'at' h:mm a")}
                    </p>
                  )}

                  {/* Practice playlist(s) attached to this setlist */}
                  {setlistPlaylists.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-border">
                      <div className="flex items-center gap-2">
                        <Headphones className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">Practice Playlist</span>
                      </div>
                      {setlistPlaylists.map((playlist) => (
                        <SetlistPlaylistCard key={playlist.id} playlist={playlist} />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SetlistTeamRoster({
  planDate,
  campusId,
  ministryType,
  customServiceId,
  getInitials,
}: {
  planDate: string;
  campusId: string;
  ministryType: string;
  customServiceId?: string | null;
  getInitials: (name: string) => string;
}) {
  const date = useMemo(() => parseLocalDate(planDate), [planDate]);

  const { data: customAssignments = [], isLoading: loadingCustomAssignments } = useQuery({
    queryKey: ["my-setlists-custom-service-roster", customServiceId, planDate],
    queryFn: async () => {
      if (!customServiceId) return [];
      const { data, error } = await supabase
        .from("custom_service_assignments")
        .select(`
          id,
          user_id,
          role,
          profiles!custom_service_assignments_user_id_fkey (
            full_name,
            avatar_url
          )
        `)
        .eq("custom_service_id", customServiceId)
        .eq("assignment_date", planDate);

      if (error) throw error;
      return data || [];
    },
    enabled: !!customServiceId && !!planDate,
  });

  const { data: teamEntry, isLoading: loadingTeam } = useQuery({
    queryKey: ["my-setlists-team-entry", planDate, campusId, ministryType],
    queryFn: async () => {
      const weekendAliases = ["weekend", "sunday_am", "weekend_team"];
      const datesToCheck = [planDate];

      const isWeekendDate = date.getDay() === 0 || date.getDay() === 6;
      if (isWeekendDate) {
        const pair = new Date(date);
        pair.setDate(date.getDay() === 6 ? date.getDate() + 1 : date.getDate() - 1);
        datesToCheck.push(pair.toISOString().split("T")[0]);
      }

      let query = supabase
        .from("team_schedule")
        .select("team_id, campus_id, ministry_type, schedule_date")
        .in("schedule_date", datesToCheck)
        .or(`campus_id.eq.${campusId},campus_id.is.null`);

      if (ministryType === "weekend" || ministryType === "weekend_team" || ministryType === "sunday_am") {
        query = query.in("ministry_type", weekendAliases);
      } else {
        query = query.eq("ministry_type", ministryType);
      }

      const { data, error } = await query;
      if (error) throw error;

      if (!data || data.length === 0) return null;

      const sorted = [...data].sort((a, b) => {
        const campusPriority = Number(Boolean(b.campus_id)) - Number(Boolean(a.campus_id));
        if (campusPriority !== 0) return campusPriority;
        if (a.schedule_date === planDate && b.schedule_date !== planDate) return -1;
        if (b.schedule_date === planDate && a.schedule_date !== planDate) return 1;
        return 0;
      });

      return sorted[0];
    },
    enabled: !!planDate && !!campusId && !customServiceId,
  });

  const { data: roster = [], isLoading: loadingRoster } = useTeamRosterForDate(
    date,
    teamEntry?.team_id,
    ministryType,
    campusId
  );

  const slotCategoryBySlot = useMemo(
    () => new Map(POSITION_SLOTS.map((slot) => [slot.slot, slot.category])),
    []
  );

  const bandFallbackPositions = useMemo(
    () =>
      new Set([
        "acoustic_guitar",
        "acoustic_1",
        "acoustic_2",
        "electric_guitar",
        "electric_1",
        "electric_2",
        "bass",
        "drums",
        "keys",
        "piano",
      ]),
    []
  );

  const vocalists = useMemo(
    () =>
      roster.filter((member) => {
        const hasVocalistSlot = member.positionSlots.some(
          (slot) => slotCategoryBySlot.get(slot) === "Vocalists"
        );
        if (hasVocalistSlot) return true;
        return member.positions.some((position) => position === "vocalist");
      }),
    [roster, slotCategoryBySlot]
  );

  const band = useMemo(
    () =>
      roster.filter((member) => {
        const hasBandSlot = member.positionSlots.some(
          (slot) => slotCategoryBySlot.get(slot) === "Band"
        );
        if (hasBandSlot) return true;
        return member.positions.some((position) => bandFallbackPositions.has(position));
      }),
    [roster, slotCategoryBySlot, bandFallbackPositions]
  );

  const rosterRows = useMemo(() => {
    if (customServiceId) {
      const byPerson = new Map<
        string,
        {
          id: string;
          memberName: string;
          avatarUrl: string | null;
          isSwapped: boolean;
          positions: Set<string>;
          positionSlots: Set<string>;
          hasVocalistRole: boolean;
          hasBandRole: boolean;
        }
      >();

      for (const assignment of customAssignments as any[]) {
        const name = assignment.profiles?.full_name || "Team Member";
        const role = assignment.role as string;
        const key = assignment.user_id || name;
        const existing = byPerson.get(key);
        const roleCategory = slotCategoryBySlot.get(role);
        const hasVocalistRole = roleCategory === "Vocalists" || role === "vocalist";
        const hasBandRole = roleCategory === "Band" || bandFallbackPositions.has(role);

        if (!existing) {
          byPerson.set(key, {
            id: assignment.id,
            memberName: name,
            avatarUrl: assignment.profiles?.avatar_url || null,
            isSwapped: false,
            positions: new Set([role]),
            positionSlots: new Set([role]),
            hasVocalistRole,
            hasBandRole,
          });
        } else {
          existing.positions.add(role);
          existing.positionSlots.add(role);
          existing.hasVocalistRole = existing.hasVocalistRole || hasVocalistRole;
          existing.hasBandRole = existing.hasBandRole || hasBandRole;
        }
      }

      return Array.from(byPerson.values())
        .map((member) => {
          const roleLabels = Array.from(member.positions)
            .map((position) => POSITION_LABELS_SHORT[position] || POSITION_LABELS[position] || position)
            .filter((label, idx, arr) => arr.indexOf(label) === idx);

          return {
            ...member,
            roleLabels,
          };
        })
        .sort((a, b) => a.memberName.localeCompare(b.memberName));
    }

    const byPerson = new Map<
      string,
      {
        id: string;
        memberName: string;
        avatarUrl: string | null;
        isSwapped: boolean;
        positions: Set<string>;
        positionSlots: Set<string>;
        hasVocalistRole: boolean;
        hasBandRole: boolean;
      }
    >();

    const allMembers = [...vocalists, ...band];
    for (const member of allMembers) {
      const key = member.userId || member.memberName;
      const existing = byPerson.get(key);
      const hasVocalistRole = member.positionSlots.some((slot) => slotCategoryBySlot.get(slot) === "Vocalists") || member.positions.includes("vocalist");
      const hasBandRole = member.positionSlots.some((slot) => slotCategoryBySlot.get(slot) === "Band") || member.positions.some((position) => bandFallbackPositions.has(position));

      if (!existing) {
        byPerson.set(key, {
          id: member.id,
          memberName: member.memberName,
          avatarUrl: member.avatarUrl,
          isSwapped: member.isSwapped,
          positions: new Set(member.positions),
          positionSlots: new Set(member.positionSlots),
          hasVocalistRole,
          hasBandRole,
        });
      } else {
        member.positions.forEach((position) => existing.positions.add(position));
        member.positionSlots.forEach((slot) => existing.positionSlots.add(slot));
        existing.isSwapped = existing.isSwapped || member.isSwapped;
        existing.hasVocalistRole = existing.hasVocalistRole || hasVocalistRole;
        existing.hasBandRole = existing.hasBandRole || hasBandRole;
      }
    }

    return Array.from(byPerson.values()).map((member) => {
      const roleLabels = Array.from(member.positions)
        .map((position) => POSITION_LABELS_SHORT[position] || POSITION_LABELS[position] || position)
        .filter((label, idx, arr) => arr.indexOf(label) === idx);

      return {
        ...member,
        roleLabels,
      };
    });
  }, [vocalists, band, slotCategoryBySlot, bandFallbackPositions]);

  const vocalistRows = useMemo(
    () => rosterRows.filter((member) => member.hasVocalistRole),
    [rosterRows]
  );

  const bandRows = useMemo(
    () => rosterRows.filter((member) => member.hasBandRole && !member.hasVocalistRole),
    [rosterRows]
  );

  if (customServiceId && loadingCustomAssignments) {
    return <Skeleton className="h-20 w-full" />;
  }

  if (!customServiceId && (loadingTeam || loadingRoster)) {
    return <Skeleton className="h-20 w-full" />;
  }

  if (customServiceId && !vocalistRows.length && !bandRows.length) {
    return null;
  }

  if (!customServiceId && (!teamEntry || (!vocalistRows.length && !bandRows.length))) {
    return null;
  }

  return (
    <div className="space-y-4 rounded-lg border bg-muted/20 p-3">
      <p className="text-sm font-medium text-muted-foreground">Team Roster</p>

      {vocalistRows.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-primary">
            <Mic2 className="h-4 w-4" />
            <p className="text-sm font-medium">Vocalists</p>
          </div>
          <div className="space-y-1">
            {vocalistRows.map((member) => (
              <div
                key={`vox-${member.id}-${member.memberName}`}
                className={`flex items-center justify-between gap-3 rounded-md px-2 py-2 ${
                  member.isSwapped ? "border border-green-500/50 bg-green-500/10" : "bg-background/50"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={member.avatarUrl || undefined} />
                    <AvatarFallback className="text-[11px]">
                      {getInitials(member.memberName || "?")}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate text-sm">{member.memberName}</span>
                  {member.isSwapped && <ArrowLeftRight className="h-3.5 w-3.5 text-green-400" />}
                </div>
                <span className="text-xs text-muted-foreground text-right">
                  {member.roleLabels.join(", ")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {bandRows.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-primary">
            <Guitar className="h-4 w-4" />
            <p className="text-sm font-medium">Band</p>
          </div>
          <div className="space-y-1">
            {bandRows.map((member) => (
              <div
                key={`band-${member.id}-${member.memberName}`}
                className={`flex items-center justify-between gap-3 rounded-md px-2 py-2 ${
                  member.isSwapped ? "border border-green-500/50 bg-green-500/10" : "bg-background/50"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={member.avatarUrl || undefined} />
                    <AvatarFallback className="text-[11px]">
                      {getInitials(member.memberName || "?")}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate text-sm">{member.memberName}</span>
                  {member.isSwapped && <ArrowLeftRight className="h-3.5 w-3.5 text-green-400" />}
                </div>
                <span className="text-xs text-muted-foreground text-right">
                  {member.roleLabels.join(", ")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ApproverMySetlists({
  campuses,
  selectedCampusId,
  setSelectedCampusId,
}: {
  campuses: Array<{ id: string; name: string }>;
  selectedCampusId: string;
  setSelectedCampusId: (value: string) => void;
}) {
  const today = new Date().toISOString().split("T")[0];
  const approveSetlist = useApproveSetlist();
  const rejectSetlist = useRejectSetlist();
  const { data: pendingApprovals = [], isLoading: loadingPending, error: pendingError } = usePendingApprovals();
  const [rejectNotesBySetId, setRejectNotesBySetId] = useState<Record<string, string>>({});

  const { data: approvedSetlists = [], isLoading: loadingApproved, error: approvedError } = useQuery({
    queryKey: ["approver-published-setlists", selectedCampusId, today],
    queryFn: async () => {
      const query = supabase
        .from("draft_sets")
        .select(`
          id,
          campus_id,
          plan_date,
          ministry_type,
          notes,
          status,
          published_at,
          campuses(name),
          draft_set_songs(
            id,
            sequence_order,
            song_key,
            songs(title, author),
            vocalist:profiles!draft_set_songs_vocalist_id_fkey(id, full_name, avatar_url)
          )
        `)
        .eq("status", "published")
        .eq("campus_id", selectedCampusId)
        .gte("plan_date", today)
        .order("plan_date", { ascending: true });

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const filteredPendingApprovals = useMemo(() => {
    return pendingApprovals.filter((approval) => {
      if (!approval.draft_set?.plan_date || approval.draft_set.plan_date < today) return false;
      if (approval.draft_set.campus_id !== selectedCampusId) return false;
      return true;
    });
  }, [pendingApprovals, selectedCampusId, today]);

  const getMinistryLabel = (type: string) => {
    return MINISTRY_TYPES.find(m => m.value === type)?.label || type;
  };

  const handleReject = async (approvalId: string, draftSetId: string) => {
    const notes = (rejectNotesBySetId[draftSetId] || "").trim();
    if (!notes) return;
    await rejectSetlist.mutateAsync({ approvalId, draftSetId, notes });
    setRejectNotesBySetId((prev) => ({ ...prev, [draftSetId]: "" }));
  };

  const isLoading = loadingPending || loadingApproved;
  const hasError = pendingError || approvedError;

  return (
    <div className="space-y-6">
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
            <BreadcrumbPage>My Setlists</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ListMusic className="h-6 w-6" />
            Setlist Review
          </h1>
          <p className="text-sm text-muted-foreground">
            Review upcoming drafts and approved setlists
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <Select value={selectedCampusId} onValueChange={setSelectedCampusId}>
            <SelectTrigger className="w-auto min-w-[160px]">
              <SelectValue placeholder="Select Campus" />
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

      {isLoading && (
        <div className="space-y-4">
          {[1, 2].map(i => <Skeleton key={i} className="h-44 w-full" />)}
        </div>
      )}

      {!isLoading && hasError && (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">
            Unable to load setlist review data. Please refresh and try again.
          </CardContent>
        </Card>
      )}

      {!isLoading && !hasError && (
        <>
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Drafts Awaiting Approval</h2>
              <Badge variant="secondary">{filteredPendingApprovals.length}</Badge>
            </div>

            {filteredPendingApprovals.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-sm text-muted-foreground">No upcoming drafts awaiting approval.</CardContent>
              </Card>
            ) : (
              filteredPendingApprovals.map((approval) => (
                <Card key={approval.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-lg">
                          {getSetlistDisplayDate(approval.draft_set.plan_date, approval.draft_set.ministry_type)}
                        </CardTitle>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <Badge variant="secondary">{getMinistryLabel(approval.draft_set.ministry_type)}</Badge>
                          {approval.draft_set.campuses?.name && (
                            <Badge variant="outline">{approval.draft_set.campuses.name}</Badge>
                          )}
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Submitted by {approval.submitter?.full_name || "Unknown"} on{" "}
                          {format(parseISO(approval.submitted_at), "MMM d 'at' h:mm a")}
                        </p>
                      </div>
                      <Badge className="gap-1 bg-amber-600 text-white">
                        <Clock className="h-3 w-3" />
                        Pending
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      {(approval.songs || []).map((song, index) => (
                        <div key={song.id} className="rounded-md bg-muted/50 p-2 text-sm flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate">{index + 1}. {song.song?.title || "Unknown Song"}</p>
                            {song.vocalist?.full_name && (
                              <p className="text-xs text-muted-foreground truncate">
                                Vocalist: {song.vocalist.full_name}
                              </p>
                            )}
                          </div>
                          {song.song_key && <Badge variant="outline" className="text-xs shrink-0">{song.song_key}</Badge>}
                        </div>
                      ))}
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Revision message (required to deny)</p>
                      <Textarea
                        value={rejectNotesBySetId[approval.draft_set_id] || ""}
                        onChange={(e) =>
                          setRejectNotesBySetId((prev) => ({ ...prev, [approval.draft_set_id]: e.target.value }))
                        }
                        placeholder="Tell the worship pastor what needs to change..."
                        className="min-h-[80px]"
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        className="bg-green-600 hover:bg-green-700 text-white"
                        disabled={approveSetlist.isPending || rejectSetlist.isPending}
                        onClick={() => approveSetlist.mutate({ approvalId: approval.id, draftSetId: approval.draft_set_id })}
                      >
                        <Check className="mr-2 h-4 w-4" />
                        Approve
                      </Button>
                      <Button
                        variant="destructive"
                        disabled={
                          approveSetlist.isPending ||
                          rejectSetlist.isPending ||
                          !(rejectNotesBySetId[approval.draft_set_id] || "").trim()
                        }
                        onClick={() => handleReject(approval.id, approval.draft_set_id)}
                      >
                        <XCircle className="mr-2 h-4 w-4" />
                        Deny
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Approved Setlists</h2>
              <Badge variant="secondary">{approvedSetlists.length}</Badge>
            </div>
            {approvedSetlists.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-sm text-muted-foreground">No upcoming approved setlists.</CardContent>
              </Card>
            ) : (
              approvedSetlists.map((setlist) => (
                <Card key={setlist.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-lg">
                          {getSetlistDisplayDate(setlist.plan_date, setlist.ministry_type)}
                        </CardTitle>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <Badge variant="secondary">{getMinistryLabel(setlist.ministry_type)}</Badge>
                          {setlist.campuses?.name && <Badge variant="outline">{setlist.campuses.name}</Badge>}
                        </div>
                      </div>
                      <Badge className="bg-green-600 text-white">Approved</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {(setlist.draft_set_songs || [])
                      .slice()
                      .sort((a: any, b: any) => a.sequence_order - b.sequence_order)
                      .map((song: any, index: number) => (
                        <div key={song.id} className="rounded-md bg-muted/50 p-2 text-sm flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate">{index + 1}. {song.songs?.title || "Unknown Song"}</p>
                            {song.vocalist?.full_name && (
                              <p className="text-xs text-muted-foreground truncate">
                                Vocalist: {song.vocalist.full_name}
                              </p>
                            )}
                          </div>
                          {song.song_key && <Badge variant="outline" className="text-xs shrink-0">{song.song_key}</Badge>}
                        </div>
                      ))}
                  </CardContent>
                </Card>
              ))
            )}
          </section>
        </>
      )}
    </div>
  );
}

function AuditionCandidateSetlists() {
  const { user } = useAuth();
  const confirmSetlist = useConfirmSetlist();
  const { data: playlists = [], isLoading: playlistsLoading } = useMySetlistPlaylists();
  const { data: assignedSetlists = [], isLoading } = useQuery({
    queryKey: ["audition-assigned-setlists", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];

      const { data: assignments, error: assignmentError } = await supabase
        .from("audition_setlist_assignments")
        .select("draft_set_id")
        .eq("user_id", user!.id);

      if (assignmentError) throw assignmentError;

      const setIds = (assignments || []).map((a) => a.draft_set_id);
      if (setIds.length === 0) return [];

      const { data: sets, error: setsError } = await supabase
        .from("draft_sets")
        .select(
          `
            id,
            campus_id,
            plan_date,
            ministry_type,
            notes,
            status,
            published_at,
            campuses(name),
            draft_set_songs(
              id,
              song_id,
              sequence_order,
              song_key,
              vocalist_id,
              songs(title, author),
              vocalist:profiles!draft_set_songs_vocalist_id_fkey(id, full_name, avatar_url)
            )
          `,
        )
        .in("id", setIds)
        .eq("status", "published")
        .eq("ministry_type", "audition")
        .gte("plan_date", today)
        .order("plan_date", { ascending: true });

      if (setsError) throw setsError;

      const { data: confirmations, error: confirmationError } = await supabase
        .from("setlist_confirmations")
        .select("id, draft_set_id, user_id, confirmed_at, created_at")
        .eq("user_id", user!.id)
        .in("draft_set_id", setIds);

      if (confirmationError) throw confirmationError;
      const confirmationsBySet = new Map((confirmations || []).map((c) => [c.draft_set_id, c]));

      return (sets || []).map((set: any) => ({
        ...set,
        songs: (set.draft_set_songs || [])
          .slice()
          .sort((a: any, b: any) => a.sequence_order - b.sequence_order)
          .map((item: any) => ({
            ...item,
            song: item.songs,
          })),
        myConfirmation: confirmationsBySet.get(set.id) || null,
        amIOnRoster: true,
      }));
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">My Audition Setlists</h1>

      {(isLoading || playlistsLoading) && (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">Loading audition setlist...</CardContent>
        </Card>
      )}

      {!isLoading && assignedSetlists.length === 0 && (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            No upcoming audition setlist has been assigned yet.
          </CardContent>
        </Card>
      )}

      {!isLoading &&
        assignedSetlists.map((setlist: any) => {
          const isConfirmed = !!setlist.myConfirmation;
          const setlistPlaylists = playlists.filter((p) => p.draft_set_id === setlist.id);

          return (
            <Card key={setlist.id}>
              <CardHeader>
                <CardTitle>
                  {new Date(`${setlist.plan_date}T00:00:00`).toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Audition
                  {setlist.campuses?.name ? ` • ${setlist.campuses.name}` : ""}
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {setlist.songs?.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No songs assigned yet.</p>
                ) : (
                  setlist.songs.map((item: any, index: number) => (
                    <div key={item.id} className="rounded-lg bg-muted/50 p-3 text-sm">
                      <p className="font-medium">{index + 1}. {item.song?.title || "Unknown Song"}</p>
                      {item.song?.author && (
                        <p className="text-xs text-muted-foreground mt-1">{item.song.author}</p>
                      )}
                      {item.song_key && (
                        <Badge variant="outline" className="mt-2 text-xs">
                          Key: {item.song_key}
                        </Badge>
                      )}
                    </div>
                  ))
                )}

                {setlist.notes && (
                  <div className="rounded-lg border border-border p-3 text-sm text-muted-foreground">
                    {setlist.notes}
                  </div>
                )}

                {!isConfirmed ? (
                  <Button
                    onClick={() => confirmSetlist.mutate(setlist.id)}
                    disabled={confirmSetlist.isPending}
                    className="w-full bg-green-600 hover:bg-green-700 text-white"
                  >
                    <Check className="mr-2 h-4 w-4" />
                    Confirm I've Reviewed This Setlist
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground text-center">
                    Confirmed on {format(parseISO(setlist.myConfirmation.confirmed_at), "MMM d 'at' h:mm a")}
                  </p>
                )}

                {setlistPlaylists.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-border">
                    <div className="flex items-center gap-2">
                      <Headphones className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">Practice Playlist</span>
                    </div>
                    {setlistPlaylists.map((playlist) => (
                      <SetlistPlaylistCard key={playlist.id} playlist={playlist} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
    </div>
  );
}

export default function MySetlists() {
  const { user } = useAuth();
  const { data: roles = [] } = useUserRoles(user?.id);
  const isAuditionCandidate = isAuditionCandidateRole(roles.map((r) => r.role));

  if (isAuditionCandidate) {
    return <AuditionCandidateSetlists />;
  }

  return <StandardMySetlists />;
}
