import { useEffect, useRef, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { addDays, format, getDay, parseISO, subDays } from "date-fns";
import { Home, ListMusic, Check, Clock, Music2, Mic2, Guitar, ArrowLeftRight, ChevronLeft, ChevronRight, Headphones, MapPin, XCircle, FileText, BookOpen, Youtube } from "lucide-react";
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
import { MINISTRY_TYPES } from "@/lib/constants";
import { groupByWeekend, parseLocalDate } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { SetlistConfirmationWidget } from "@/components/dashboard/SetlistConfirmationWidget";
import { SetlistPlaylistCard } from "@/components/audio/SetlistPlaylistCard";
import { ChordChartDialog } from "@/components/songs/ChordChartDialog";
import { useCampusSelectionOptional } from "@/components/layout/CampusSelectionContext";
import { isAuditionCandidateRole } from "@/lib/access";
import { POSITION_LABELS, POSITION_LABELS_SHORT, POSITION_SLOTS } from "@/lib/constants";
import { useTeamRosterForDate } from "@/hooks/useTeamRosterForDate";
import { GroupTextButton, buildRosterGroupTextTemplate } from "@/components/team/GroupTextButton";
import { supabase } from "@/integrations/supabase/client";
import { formatTeachingReference, useTeachingWeekForDate } from "@/hooks/useTeachingSchedule";
import { buildBibleHref } from "@/lib/bible";
import { isMissingYoutubeUrlColumnError } from "@/lib/youtube";
import { useIsMobile } from "@/hooks/use-mobile";

const WEEKEND_MINISTRY_TYPES = new Set(["weekend", "weekend_team", "sunday_am"]);
const CROSS_CAMPUS_SETLIST_VIEWER_ROLES = new Set([
  "admin",
  "campus_admin",
  "campus_worship_pastor",
  "student_worship_pastor",
  "network_worship_pastor",
  "network_worship_leader",
  "campus_pastor",
]);

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

function YouTubeButton({
  href,
  compact = false,
}: {
  href: string | null | undefined;
  compact?: boolean;
}) {
  if (!href) return null;

  return (
    <Button
      asChild
      type="button"
      variant="outline"
      size="sm"
      className={`shrink-0 rounded-full border-red-500/50 bg-red-500/10 font-medium text-red-400 hover:bg-red-500/20 hover:text-red-300 ${
        compact ? "h-6 w-6 p-0 text-red-300" : "h-6 gap-1 px-2 text-[11px]"
      }`}
    >
      <a href={href} target="_blank" rel="noopener noreferrer">
        <Youtube className="h-3 w-3" />
        <span className="sr-only">Open YouTube link</span>
        {!compact && "YouTube"}
      </a>
    </Button>
  );
}

function SetlistYoutubeLinks({
  songs,
  compact = false,
}: {
  songs: Array<{
    id: string;
    youtube_url?: string | null;
    song?: {
      title?: string | null;
    } | null;
  }>;
  compact?: boolean;
}) {
  const songsWithYoutube = songs.filter((song) => song.youtube_url);

  if (songsWithYoutube.length === 0) return null;

  return (
    <div className="space-y-2 rounded-lg border border-ecc-blue/40 bg-card/50 p-3">
      <div className="flex items-center gap-2">
        <Youtube className="h-4 w-4 text-ecc-blue" />
        <span className="text-sm font-medium text-foreground">YouTube Links</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {songsWithYoutube.map((song) => (
          <div key={song.id} className="flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-2 py-1">
            <span className="max-w-[140px] truncate text-xs text-muted-foreground sm:max-w-[220px]">
              {song.song?.title || "Song"}
            </span>
            <YouTubeButton href={song.youtube_url} compact={compact} />
          </div>
        ))}
      </div>
    </div>
  );
}

function StandardMySetlists() {
  const { isAdmin, user } = useAuth();
  const [searchParams] = useSearchParams();
  const highlightSetId = searchParams.get("setId");
  const { data: campuses } = useCampuses();
  const { data: userCampuses = [] } = useUserCampuses(user?.id);
  const { data: userRoles = [] } = useUserRoles(user?.id);
  
  // Use global campus selection context if available
  const campusContext = useCampusSelectionOptional();
  const [localCampusId, setLocalCampusId] = useState<string>("");
  const canViewCampusWideSetlists = useMemo(
    () => userRoles.some(({ role }) => CROSS_CAMPUS_SETLIST_VIEWER_ROLES.has(role)),
    [userRoles],
  );

  const assignedCampusIds = useMemo(
    () => new Set(userCampuses.map((uc) => uc.campus_id)),
    [userCampuses]
  );
  const assignedCampuses = useMemo(() => {
    if (!campuses) return [];
    return campuses.filter((campus) => assignedCampusIds.has(campus.id));
  }, [campuses, assignedCampusIds]);
  const selectableCampuses = useMemo(() => {
    if (isAdmin || canViewCampusWideSetlists) return campuses || [];
    return assignedCampuses;
  }, [isAdmin, canViewCampusWideSetlists, campuses, assignedCampuses]);
  
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
    if (selectedCampusId && selectableCampuses.some((campus) => campus.id === selectedCampusId)) {
      return selectedCampusId;
    }
    if (selectableCampuses.length > 0) return selectableCampuses[0].id;
    return "__none__";
  }, [selectedCampusId, selectableCampuses]);

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
  const [chartSong, setChartSong] = useState<{ id: string; title: string; author: string | null; draftSetSongId?: string | null; originalKey?: string | null } | null>(null);
  const isMobile = useIsMobile();

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
    if (isAdmin || canViewCampusWideSetlists) return allGroupedSetlists;
    return allGroupedSetlists
      .map((group) => ({
        ...group,
        items: group.items.filter((setlist) => setlist.amIOnRoster === true),
      }))
      .filter((group) => group.items.length > 0);
  }, [allGroupedSetlists, isAdmin, canViewCampusWideSetlists]);

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
          <Select value={normalizedCampusId} onValueChange={setSelectedCampusId} disabled={selectableCampuses.length === 0}>
            <SelectTrigger className="w-auto min-w-[160px]">
              <SelectValue placeholder="Select Campus" />
            </SelectTrigger>
            <SelectContent>
              {selectableCampuses.map((campus) => (
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
                  <SetlistTeachingSchedule
                    planDate={setlist.plan_date}
                    campusId={setlist.campus_id}
                    ministryType={setlist.ministry_type}
                  />

                  {/* Songs list */}
                  <div className="space-y-2">
                    <TooltipProvider>
                      {setlist.songs.map((item, index) => (
                        <div
                          key={item.id}
                          className="flex items-start gap-2 p-2 rounded-lg bg-muted/50 md:items-center md:gap-3"
                        >
                          <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-medium flex items-center justify-center shrink-0">
                            {index + 1}
                          </span>
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="min-w-0">
                              <div className="flex min-w-0 items-center gap-2">
                                <button
                                  type="button"
                                  className="min-w-0 truncate text-left font-medium text-sm hover:text-primary hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-70"
                                  disabled={!item.song_id}
                                  onClick={() => {
                                    if (!item.song_id) return;
                                    setChartSong({
                                      id: item.song_id,
                                      title: item.song?.title || "Unknown Song",
                                      author: item.song?.author || null,
                                      draftSetSongId: item.id,
                                      originalKey: item.song_key || null,
                                    });
                                  }}
                                >
                                  {item.song?.title || "Unknown Song"}
                                </button>
                                {item.isFirstUse && (
                                  <Badge className="bg-ecc-teal text-white text-[10px] px-1.5 py-0 h-4 shrink-0">
                                    NEW
                                  </Badge>
                                )}
                              </div>
                            </div>
                            {item.song?.author && (
                              <p className="text-xs text-muted-foreground truncate">
                                {item.song.author}
                              </p>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5 self-center md:gap-2">
                            {item.song_key && (
                              <Badge variant="outline" className="text-xs font-medium shrink-0">
                                {item.song_key}
                              </Badge>
                            )}
                            {item.song_id && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className={`shrink-0 text-xs ${isMobile ? "h-7 px-2" : "h-7 gap-1 px-2"}`}
                                onClick={() =>
                                  setChartSong({
                                    id: item.song_id,
                                    title: item.song?.title || "Unknown Song",
                                    author: item.song?.author || null,
                                    draftSetSongId: item.id,
                                    originalKey: item.song_key || null,
                                  })
                                }
                              >
                                <FileText className="h-3.5 w-3.5" />
                                {!isMobile && "Chart"}
                              </Button>
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

                  {/* Audio library playlist(s) attached to this setlist */}
                  {setlistPlaylists.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-border">
                      <div className="flex items-center gap-2">
                        <Headphones className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">References</span>
                      </div>
                      <SetlistYoutubeLinks songs={setlist.songs} compact={isMobile} />
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

      <ChordChartDialog
        open={!!chartSong}
        onOpenChange={(open) => !open && setChartSong(null)}
        song={chartSong}
      />
    </div>
  );
}

function SetlistTeachingSchedule({
  planDate,
  campusId,
  ministryType,
}: {
  planDate: string;
  campusId: string;
  ministryType: string;
}) {
  const { data: teachingWeek } = useTeachingWeekForDate(campusId, ministryType, planDate);

  if (!teachingWeek) return null;

  return (
    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="bg-emerald-600/10 text-emerald-700 border-transparent">
          Teaching
        </Badge>
        <span className="text-sm font-medium">
          {formatTeachingReference(teachingWeek)}
        </span>
        <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs">
          <Link to={buildBibleHref(formatTeachingReference(teachingWeek), teachingWeek.translation || "ESV")}>
            Read Passage
          </Link>
        </Button>
      </div>
      {teachingWeek.themes_manual && teachingWeek.themes_manual.length > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          {teachingWeek.themes_manual.join(", ")}
        </p>
      )}
      {(teachingWeek.psa_highlight || teachingWeek.announcer_name) ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {[teachingWeek.psa_highlight, teachingWeek.announcer_name].filter(Boolean).join(" • ")}
        </p>
      ) : null}
      {teachingWeek.ai_summary ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {teachingWeek.ai_summary}
        </p>
      ) : null}
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
  const { user } = useAuth();
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

  const { data: auditionCandidates = [], isLoading: loadingAuditions } = useQuery({
    queryKey: ["my-setlists-audition-roster", planDate, campusId, ministryType],
    queryFn: async () => {
      if (ministryType !== "audition") return [];

      const { data, error } = await supabase
        .from("auditions")
        .select(`
          id,
          candidate_id,
          stage,
          candidate_track,
          profiles!auditions_candidate_id_fkey (
            full_name,
            avatar_url
          )
        `)
        .eq("audition_date", planDate)
        .eq("status", "scheduled")
        .eq("campus_id", campusId);

      if (error) throw error;
      return data || [];
    },
    enabled: !!planDate && !!campusId && ministryType === "audition" && !customServiceId,
  });

  const { data: safeProfiles = [] } = useQuery({
    queryKey: ["my-setlists-safe-phones", campusId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_profiles_for_campus");
      if (error) throw error;
      return (data || []) as Array<{ id: string; phone: string | null }>;
    },
    enabled: !!campusId && !!user,
  });

  const safePhoneMap = useMemo(
    () => new Map(safeProfiles.map((profile) => [profile.id, profile.phone])),
    [safeProfiles]
  );

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

  const speakerPositions = useMemo(
    () => new Set(["teacher", "announcement", "annoucement", "closing_prayer"]),
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

  const speakers = useMemo(
    () =>
      roster.filter((member) => {
        const hasSpeakerSlot = member.positionSlots.some(
          (slot) => slotCategoryBySlot.get(slot) === "Speaker"
        );
        if (hasSpeakerSlot) return true;
        return member.positions.some((position) => speakerPositions.has(position));
      }),
    [roster, slotCategoryBySlot, speakerPositions]
  );

  const rosterRows = useMemo(() => {
    if (customServiceId) {
      const byPerson = new Map<
        string,
        {
          id: string;
          memberName: string;
          avatarUrl: string | null;
          phone: string | null;
          isSwapped: boolean;
          positions: Set<string>;
          positionSlots: Set<string>;
          hasVocalistRole: boolean;
          hasBandRole: boolean;
          hasSpeakerRole: boolean;
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
        const hasSpeakerRole = roleCategory === "Speaker" || speakerPositions.has(role);

        if (!existing) {
          byPerson.set(key, {
            id: assignment.id,
            memberName: name,
            avatarUrl: assignment.profiles?.avatar_url || null,
            phone: safePhoneMap.get(assignment.user_id) || null,
            isSwapped: false,
            positions: new Set([role]),
            positionSlots: new Set([role]),
            hasVocalistRole,
            hasBandRole,
            hasSpeakerRole,
          });
        } else {
          existing.positions.add(role);
          existing.positionSlots.add(role);
          existing.hasVocalistRole = existing.hasVocalistRole || hasVocalistRole;
          existing.hasBandRole = existing.hasBandRole || hasBandRole;
          existing.hasSpeakerRole = existing.hasSpeakerRole || hasSpeakerRole;
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

    if (ministryType === "audition") {
      return (auditionCandidates as any[])
        .map((candidate) => {
          const candidateTrack = candidate.candidate_track as string;
          const candidateStage = candidate.stage as string;
          const stageLabel = candidateStage === "pre_audition" ? "Pre-Audition" : "Audition";
          const trackLabel = candidateTrack === "instrumentalist" ? "Instrumentalist" : "Vocalist";
          const hasVocalistRole = candidateTrack !== "instrumentalist";
          const hasBandRole = candidateTrack === "instrumentalist";

          return {
            id: candidate.id,
            memberName: candidate.profiles?.full_name || "Audition Candidate",
            avatarUrl: candidate.profiles?.avatar_url || null,
            phone: safePhoneMap.get(candidate.candidate_id) || null,
            isSwapped: false,
            positions: new Set([candidateTrack]),
            positionSlots: new Set<string>(),
            hasVocalistRole,
            hasBandRole,
            roleLabels: [stageLabel, trackLabel],
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
        phone: string | null;
        isSwapped: boolean;
        positions: Set<string>;
        positionSlots: Set<string>;
          hasVocalistRole: boolean;
          hasBandRole: boolean;
          hasSpeakerRole: boolean;
        }
      >();

    const allMembers = [...vocalists, ...band, ...speakers];
    for (const member of allMembers) {
      const key = member.userId || member.memberName;
      const existing = byPerson.get(key);
      const hasVocalistRole = member.positionSlots.some((slot) => slotCategoryBySlot.get(slot) === "Vocalists") || member.positions.includes("vocalist");
      const hasBandRole = member.positionSlots.some((slot) => slotCategoryBySlot.get(slot) === "Band") || member.positions.some((position) => bandFallbackPositions.has(position));
      const hasSpeakerRole = member.positionSlots.some((slot) => slotCategoryBySlot.get(slot) === "Speaker") || member.positions.some((position) => speakerPositions.has(position));

      if (!existing) {
        byPerson.set(key, {
          id: member.id,
          memberName: member.memberName,
          avatarUrl: member.avatarUrl,
          phone: member.phone,
          isSwapped: member.isSwapped,
          positions: new Set(member.positions),
          positionSlots: new Set(member.positionSlots),
          hasVocalistRole,
          hasBandRole,
          hasSpeakerRole,
        });
      } else {
        member.positions.forEach((position) => existing.positions.add(position));
        member.positionSlots.forEach((slot) => existing.positionSlots.add(slot));
        existing.isSwapped = existing.isSwapped || member.isSwapped;
        existing.phone = existing.phone || member.phone;
        existing.hasVocalistRole = existing.hasVocalistRole || hasVocalistRole;
        existing.hasBandRole = existing.hasBandRole || hasBandRole;
        existing.hasSpeakerRole = existing.hasSpeakerRole || hasSpeakerRole;
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
  }, [customServiceId, ministryType, customAssignments, auditionCandidates, vocalists, band, speakers, slotCategoryBySlot, bandFallbackPositions, speakerPositions]);

  const vocalistRows = useMemo(
    () => rosterRows.filter((member) => member.hasVocalistRole),
    [rosterRows]
  );

  const bandRows = useMemo(
    () => rosterRows.filter((member) => member.hasBandRole && !member.hasVocalistRole),
    [rosterRows]
  );

  const speakerRows = useMemo(
    () => rosterRows.filter((member) => member.hasSpeakerRole && !member.hasVocalistRole && !member.hasBandRole),
    [rosterRows]
  );

  const serviceLabel = useMemo(() => {
    if (customServiceId) return "this custom service";
    if (ministryType === "audition") return "this audition";
    return MINISTRY_TYPES.find((ministry) => ministry.value === ministryType)?.label || ministryType;
  }, [customServiceId, ministryType]);

  if (customServiceId && loadingCustomAssignments) {
    return <Skeleton className="h-20 w-full" />;
  }

  if (!customServiceId && ministryType === "audition" && loadingAuditions) {
    return <Skeleton className="h-20 w-full" />;
  }

  if (!customServiceId && ministryType !== "audition" && (loadingTeam || loadingRoster)) {
    return <Skeleton className="h-20 w-full" />;
  }

  if (customServiceId && !vocalistRows.length && !bandRows.length && !speakerRows.length) {
    return null;
  }

  if (!customServiceId && ministryType !== "audition" && (!teamEntry || (!vocalistRows.length && !bandRows.length && !speakerRows.length))) {
    return null;
  }

  if (!customServiceId && ministryType === "audition" && !vocalistRows.length && !bandRows.length && !speakerRows.length) {
    return null;
  }

  return (
    <div className="space-y-4 rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-muted-foreground">Team Roster</p>
        <GroupTextButton
          phoneNumbers={rosterRows.map((member) => member.phone)}
          rosterMembers={rosterRows.map((member) => ({ name: member.memberName, phone: member.phone }))}
          defaultMessage={buildRosterGroupTextTemplate({
            date,
            serviceLabel,
          })}
          className="ml-auto"
        />
      </div>

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

      {speakerRows.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-primary">
            <BookOpen className="h-4 w-4" />
            <p className="text-sm font-medium">Speaker</p>
          </div>
          <div className="space-y-1">
            {speakerRows.map((member) => (
              <div
                key={`speaker-${member.id}-${member.memberName}`}
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

function AuditionCandidateSetlists() {
  const { user } = useAuth();
  const confirmSetlist = useConfirmSetlist();
  const { data: playlists = [], isLoading: playlistsLoading } = useMySetlistPlaylists();
  const [chartSong, setChartSong] = useState<{ id: string; title: string; author: string | null; draftSetSongId?: string | null; originalKey?: string | null } | null>(null);
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

      let sets: any[] | null = null;
      let setsError: any = null;
      const primarySetsQuery = await supabase
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
              youtube_url,
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

      sets = primarySetsQuery.data;
      setsError = primarySetsQuery.error;

      if (setsError && isMissingYoutubeUrlColumnError(setsError)) {
        const legacySetsQuery = await supabase
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
        sets = legacySetsQuery.data;
        setsError = legacySetsQuery.error;
      }

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
                      <div className="flex items-start justify-between gap-3">
                        <button
                          type="button"
                          className="font-medium text-left hover:text-primary hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-70"
                          disabled={!item.song_id}
                          onClick={() => {
                            if (!item.song_id) return;
                            setChartSong({
                              id: item.song_id,
                              title: item.song?.title || "Unknown Song",
                              author: item.song?.author || null,
                              draftSetSongId: item.id,
                              originalKey: item.song_key || null,
                            });
                          }}
                        >
                          {index + 1}. {item.song?.title || "Unknown Song"}
                        </button>
                        {item.song_id && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 px-2 text-xs shrink-0"
                            onClick={() =>
                              setChartSong({
                                id: item.song_id,
                                title: item.song?.title || "Unknown Song",
                                author: item.song?.author || null,
                                draftSetSongId: item.id,
                                originalKey: item.song_key || null,
                              })
                            }
                          >
                            <FileText className="h-3.5 w-3.5" />
                            Chart
                          </Button>
                        )}
                      </div>
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
                      <span className="text-sm font-medium">References</span>
                    </div>
                    <SetlistYoutubeLinks songs={setlist.songs} compact />
                    {setlistPlaylists.map((playlist) => (
                      <SetlistPlaylistCard key={playlist.id} playlist={playlist} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

      <ChordChartDialog
        open={!!chartSong}
        onOpenChange={(open) => !open && setChartSong(null)}
        song={chartSong}
      />
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
