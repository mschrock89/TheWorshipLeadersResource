import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useMyTeamAssignments } from "@/hooks/useMyTeamAssignments";
import { useUserCampuses } from "@/hooks/useCampuses";
import { useDraftSets, useDraftSetSongs } from "@/hooks/useSetPlanner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, Music, Clock, MapPin, ChevronRight } from "lucide-react";
import { format, isSameWeek, addDays } from "date-fns";
import { POSITION_LABELS } from "@/lib/constants";

export function VolunteerUpcomingWidget() {
  const { user } = useAuth();
  const { scheduledDates, uniqueTeams, isLoading: scheduleLoading } = useMyTeamAssignments();
  const { data: userCampuses = [], isLoading: campusLoading } = useUserCampuses(user?.id);

  // Get the user's primary campus (first one)
  const primaryCampus = userCampuses[0]?.campuses;
  const primaryCampusId = primaryCampus?.id;

  // Find the next upcoming weekend
  const nextWeekend = useMemo(() => {
    if (!scheduledDates.length) return null;
    
    const today = new Date();
    const sortedDates = [...scheduledDates]
      .filter(d => d.date >= today)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    
    return sortedDates[0] || null;
  }, [scheduledDates]);

  // Fetch draft sets for the user's campus
  const { data: draftSets = [], isLoading: setsLoading } = useDraftSets(primaryCampusId || null);

  // Find the published set for the next weekend
  const upcomingSet = useMemo(() => {
    if (!nextWeekend || !draftSets.length) return null;
    
    // Find a published set for this weekend
    return draftSets.find(set => {
      const setDate = new Date(set.plan_date);
      return set.status === 'published' && isSameWeek(setDate, nextWeekend.date, { weekStartsOn: 0 });
    }) || null;
  }, [draftSets, nextWeekend]);

  // Fetch songs for the upcoming set
  const { data: setSongs = [], isLoading: songsLoading } = useDraftSetSongs(upcomingSet?.id || null);

  const isLoading = scheduleLoading || campusLoading || setsLoading;

  // Format position label
  const getPositionLabel = (position: string) => {
    return POSITION_LABELS[position as keyof typeof POSITION_LABELS] || position;
  };

  if (isLoading) {
    return (
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarDays className="h-5 w-5 text-primary" />
            Upcoming Weekend
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  // No upcoming schedule
  if (!nextWeekend) {
    return (
      <Card className="border-muted">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarDays className="h-5 w-5 text-muted-foreground" />
            Upcoming Weekend
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Clock className="h-12 w-12 text-muted-foreground/30" />
            <p className="mt-3 text-muted-foreground">
              No upcoming weekends scheduled
            </p>
            <p className="mt-1 text-sm text-muted-foreground/70">
              Enjoy your time off!
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <CalendarDays className="h-5 w-5 text-primary" />
          Upcoming Weekend
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Schedule Info */}
        <div className="rounded-lg border border-border/50 bg-card/50 p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-lg text-muted-foreground">Weekend of the</p>
              <p className="text-2xl font-bold text-foreground">
                {format(nextWeekend.date, "MMM do")} - {format(addDays(nextWeekend.date, 1), "do")}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge 
                  variant="secondary" 
                  className="text-sm"
                  style={{ 
                    backgroundColor: `${nextWeekend.teamColor}20`, 
                    color: nextWeekend.teamColor,
                    borderColor: nextWeekend.teamColor 
                  }}
                >
                  {nextWeekend.teamName}
                </Badge>
                <Badge variant="outline" className="text-sm">
                  {getPositionLabel(nextWeekend.position)}
                </Badge>
              </div>
              {primaryCampus && (
                <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  {primaryCampus.name}
                </p>
              )}
            </div>
            <Link 
              to="/calendar" 
              className="flex items-center gap-1 text-sm text-primary hover:underline"
            >
              View Calendar
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {/* Song Set */}
        <div className="rounded-lg border border-border/50 bg-card/50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-semibold text-foreground">
              <Music className="h-4 w-4 text-accent" />
              Song Set
            </h3>
            {upcomingSet && (
              <Link 
                to="/my-setlists" 
                className="flex items-center gap-1 text-sm text-primary hover:underline"
              >
                View Full Set
                <ChevronRight className="h-4 w-4" />
              </Link>
            )}
          </div>
          
          {songsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          ) : setSongs.length > 0 ? (
            <ol className="space-y-1.5">
              {setSongs.map((song, index) => (
                <li key={song.id} className="flex items-center gap-3">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-xs font-medium">
                    {index + 1}
                  </span>
                  <span className="text-sm text-foreground">
                    {song.song?.title || "Unknown Song"}
                  </span>
                  {song.song_key && (
                    <Badge variant="outline" className="ml-auto h-5 px-1.5 text-[10px]">
                      {song.song_key}
                    </Badge>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">
              No song set published yet for this weekend
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
