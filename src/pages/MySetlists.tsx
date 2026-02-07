import { useEffect, useRef, useState, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { Home, ListMusic, Check, Clock, Music2, Mic2, ChevronLeft, ChevronRight, Headphones, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { useCampuses } from "@/hooks/useCampuses";
import { MINISTRY_TYPES } from "@/lib/constants";
import { groupByWeekend, parseLocalDate } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { SetlistConfirmationWidget } from "@/components/dashboard/SetlistConfirmationWidget";
import { SetlistPlaylistCard } from "@/components/audio/SetlistPlaylistCard";
import { useCampusSelectionOptional } from "@/components/layout/CampusSelectionContext";

export default function MySetlists() {
  const { isAdmin, user } = useAuth();
  const [searchParams] = useSearchParams();
  const highlightSetId = searchParams.get("setId");
  const { data: campuses } = useCampuses();
  
  // Use global campus selection context if available
  const campusContext = useCampusSelectionOptional();
  const [localCampusId, setLocalCampusId] = useState<string>("all");
  
  // Sync with global context - use context value if set, otherwise use local state
  const selectedCampusId = campusContext?.selectedCampusId || localCampusId;
  const setSelectedCampusId = (value: string) => {
    if (value === "all") {
      // "All" is local-only - don't update global context
      setLocalCampusId("all");
    } else if (campusContext) {
      campusContext.setSelectedCampusId(value);
    } else {
      setLocalCampusId(value);
    }
  };
  
  const { data: upcomingSetlists, isLoading: loadingUpcoming } = usePublishedSetlists(
    selectedCampusId === "all" ? undefined : selectedCampusId, 
    undefined, 
    false
  );
  const { data: pastSetlists, isLoading: loadingPast } = usePublishedSetlists(
    selectedCampusId === "all" ? undefined : selectedCampusId, 
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

  // Find the index of the first upcoming/current setlist to start there
  const initialIndex = useMemo(() => {
    const idx = allGroupedSetlists.findIndex(g => g.saturdayDate >= today);
    return idx >= 0 ? idx : Math.max(0, allGroupedSetlists.length - 1);
  }, [allGroupedSetlists, today]);

  // Set initial index once data loads
  useEffect(() => {
    if (allGroupedSetlists.length > 0) {
      setCurrentIndex(initialIndex);
    }
  }, [initialIndex, allGroupedSetlists.length]);

  const isLoading = loadingUpcoming || loadingPast;

  // Handle deep-link navigation to specific setlist
  useEffect(() => {
    if (highlightSetId && allGroupedSetlists.length > 0 && !isLoading) {
      const groupIndex = allGroupedSetlists.findIndex(g => 
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
  }, [highlightSetId, allGroupedSetlists, isLoading]);

  const goToPrevious = () => {
    setCurrentIndex(prev => Math.max(0, prev - 1));
  };

  const goToNext = () => {
    setCurrentIndex(prev => Math.min(allGroupedSetlists.length - 1, prev + 1));
  };

  const currentGroup = allGroupedSetlists[currentIndex];

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
          <Select value={selectedCampusId} onValueChange={setSelectedCampusId}>
            <SelectTrigger className="w-auto min-w-[160px]">
              <SelectValue placeholder="All Campuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Campuses</SelectItem>
              {campuses?.map((campus) => (
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
        <SetlistConfirmationWidget selectedCampusId={selectedCampusId} />
      )}

      {allGroupedSetlists.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Music2 className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No setlists found</p>
            <p className="text-sm text-muted-foreground">
              You'll see setlists here when they're published for your scheduled dates
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
                <span className="text-xs text-muted-foreground">
                  {currentIndex + 1} of {allGroupedSetlists.length}
                </span>
              </div>
            </div>
            
            <Button
              variant="ghost"
              size="icon"
              onClick={goToNext}
              disabled={currentIndex === allGroupedSetlists.length - 1}
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
                      {/* Show day label when in a weekend group */}
                      {isWeekendGroup && (
                        <p className="text-xs text-muted-foreground mb-1">
                          {format(planDate, "EEEE")}
                        </p>
                      )}
                      <CardTitle className="text-lg">
                        <Link 
                          to={`/calendar?date=${setlist.scheduleDate}`}
                          className="hover:text-primary hover:underline transition-colors"
                        >
                          {!isWeekendGroup && format(planDate, "EEEE, MMMM d, yyyy")}
                          {isWeekendGroup && format(planDate, "MMMM d, yyyy")}
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
                          {item.vocalist && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <Avatar className="h-6 w-6 ring-2 ring-background">
                                    <AvatarImage src={item.vocalist.avatar_url || undefined} />
                                    <AvatarFallback className="text-[10px] bg-gradient-to-br from-primary/30 to-primary/10 text-primary">
                                      {getInitials(item.vocalist.full_name || "?")}
                                    </AvatarFallback>
                                  </Avatar>
                                  <Mic2 className="h-3 w-3 text-muted-foreground" />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs">{item.vocalist.full_name} is leading</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
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

                  {/* Confirm button */}
                  {!isConfirmed && (
                    <Button
                      onClick={() => confirmSetlist.mutate(setlist.id)}
                      disabled={confirmSetlist.isPending}
                      className="w-full bg-green-600 hover:bg-green-700 text-white"
                    >
                      <Check className="mr-2 h-4 w-4" />
                      Confirm I've Reviewed This Setlist
                    </Button>
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
