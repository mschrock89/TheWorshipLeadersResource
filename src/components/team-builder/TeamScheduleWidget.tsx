import { useState, useMemo, useEffect } from "react";
import { format, parseISO, getDay, eachDayOfInterval } from "date-fns";
import { Calendar, Plus, Trash2, Info, Globe2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useTeamScheduleForCampus,
  useUpdateScheduleTeam,
  useCreateScheduleEntry,
  useDeleteScheduleEntry,
  useClearScheduleEntries,
  usePublishScheduleNetworkWide,
} from "@/hooks/useTeamScheduleEditor";
import { useWorshipTeams } from "@/hooks/useTeamSchedule";
import { useCampuses } from "@/hooks/useCampuses";
import { useAuth } from "@/hooks/useAuth";

interface TeamScheduleWidgetProps {
  campusId: string | null;
  rotationPeriodName: string | null;
  rotationPeriodStartDate: string | null;
  rotationPeriodEndDate: string | null;
  ministryFilter: string | null;
  canPublishNetworkWide?: boolean;
}

interface DisplayScheduleEntry {
  id: string;
  schedule_date: string;
  team_id: string;
  team_name: string;
  team_color: string;
  ministry_type: string | null;
  campus_id: string | null;
  isVirtual: boolean;
}

const ENCOUNTER_EON_COMBINED = "encounter_eon_combined";
const ENCOUNTER_EON_MINISTRY_TYPES = ["encounter", "eon"] as const;

function normalizeScheduleMinistryFilter(ministryFilter: string | null) {
  if (!ministryFilter || ministryFilter === "all" || ministryFilter === "weekend_team") {
    return "weekend";
  }

  return ministryFilter;
}

const MINISTRY_COLORS: Record<string, string> = {
  weekend: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  production: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  video: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200",
  encounter: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  eon: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  student: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
};

export function TeamScheduleWidget({
  campusId,
  rotationPeriodName,
  rotationPeriodStartDate,
  rotationPeriodEndDate,
  ministryFilter,
  canPublishNetworkWide = false,
}: TeamScheduleWidgetProps) {
  const { isAdmin } = useAuth();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newTeamId, setNewTeamId] = useState("");
  const [newMinistryType, setNewMinistryType] = useState("weekend");
  const [scheduleMinistryFilter, setScheduleMinistryFilter] = useState(() =>
    normalizeScheduleMinistryFilter(ministryFilter),
  );

  const { data: scheduleEntries = [], isLoading } = useTeamScheduleForCampus(
    campusId,
    rotationPeriodName,
    scheduleMinistryFilter
  );
  const { data: campuses = [] } = useCampuses();
  const { data: teams = [] } = useWorshipTeams();
  const selectedCampus = useMemo(
    () => campuses.find((campus) => campus.id === campusId) || null,
    [campusId, campuses],
  );

  const activeScheduleMinistry = useMemo(() => {
    return normalizeScheduleMinistryFilter(scheduleMinistryFilter);
  }, [scheduleMinistryFilter]);

  useEffect(() => {
    setScheduleMinistryFilter(normalizeScheduleMinistryFilter(ministryFilter));
  }, [ministryFilter]);

  useEffect(() => {
    setNewMinistryType(activeScheduleMinistry);
  }, [activeScheduleMinistry]);

  const preloadableDates = useMemo(() => {
    if (!selectedCampus || !rotationPeriodStartDate || !rotationPeriodEndDate) {
      return [];
    }

    const preloadWeekday =
      activeScheduleMinistry === "encounter" ||
      activeScheduleMinistry === "eon" ||
      activeScheduleMinistry === ENCOUNTER_EON_COMBINED
        ? 3
        : null;

    return eachDayOfInterval({
      start: parseISO(rotationPeriodStartDate),
      end: parseISO(rotationPeriodEndDate),
    })
      .filter((date) => {
        const dayOfWeek = getDay(date);
        if (preloadWeekday !== null) {
          return dayOfWeek === preloadWeekday;
        }
        if (dayOfWeek === 6) return selectedCampus.has_saturday_service;
        if (dayOfWeek === 0) return selectedCampus.has_sunday_service;
        return false;
      })
      .map((date) => format(date, "yyyy-MM-dd"));
  }, [activeScheduleMinistry, rotationPeriodEndDate, rotationPeriodStartDate, selectedCampus]);

  // Filter out Saturday/Sunday entries for campuses that don't have service on those days
  // (e.g. Tullahoma, Shelbyville, Murfreesboro North have no Saturday service)
  const filteredEntries = useMemo(() => {
    if (!campusId) return scheduleEntries;
    const campus = campuses.find((c) => c.id === campusId);
    if (!campus) return scheduleEntries;
    return scheduleEntries.filter((entry) => {
      const date = parseISO(entry.schedule_date);
      const dayOfWeek = getDay(date); // 0 = Sunday, 6 = Saturday
      if (dayOfWeek === 6 && !campus.has_saturday_service) return false;
      if (dayOfWeek === 0 && !campus.has_sunday_service) return false;
      return true;
    });
  }, [scheduleEntries, campusId, campuses]);

  const availableDates = useMemo(() => {
    const usedDates = new Set(
      filteredEntries
        .filter((entry) => {
          const entryMinistryType = entry.ministry_type || "weekend";
          if (newMinistryType === ENCOUNTER_EON_COMBINED) {
            return ENCOUNTER_EON_MINISTRY_TYPES.includes(
              entryMinistryType as (typeof ENCOUNTER_EON_MINISTRY_TYPES)[number],
            );
          }
          return entryMinistryType === newMinistryType;
        })
        .map((entry) => entry.schedule_date),
    );

    return preloadableDates.filter((date) => !usedDates.has(date));
  }, [filteredEntries, newMinistryType, preloadableDates]);
  const displayEntries = useMemo<DisplayScheduleEntry[]>(() => {
    const existingEntriesByDate = new Map(
      filteredEntries.map((entry) => [entry.schedule_date, entry]),
    );

    if (preloadableDates.length === 0) {
      return filteredEntries.map((entry) => ({
        id: entry.id,
        schedule_date: entry.schedule_date,
        team_id: entry.team_id,
        team_name: entry.team_name,
        team_color: entry.team_color,
        ministry_type: entry.ministry_type,
        campus_id: entry.campus_id,
        isVirtual: false,
      }));
    }

    return preloadableDates.map((date) => {
      const existingEntry = existingEntriesByDate.get(date);

      if (existingEntry) {
        return {
          id: existingEntry.id,
          schedule_date: existingEntry.schedule_date,
          team_id: existingEntry.team_id,
          team_name: existingEntry.team_name,
          team_color: existingEntry.team_color,
          ministry_type: existingEntry.ministry_type,
          campus_id: existingEntry.campus_id,
          isVirtual: false,
        };
      }

      return {
        id: `virtual-${activeScheduleMinistry}-${date}`,
        schedule_date: date,
        team_id: "",
        team_name: "Unassigned",
        team_color: "transparent",
        ministry_type: activeScheduleMinistry,
        campus_id: campusId,
        isVirtual: true,
      };
    });
  }, [activeScheduleMinistry, campusId, filteredEntries, preloadableDates]);
  const updateTeam = useUpdateScheduleTeam();
  const createEntry = useCreateScheduleEntry();
  const deleteEntry = useDeleteScheduleEntry();
  const clearScheduleEntries = useClearScheduleEntries();
  const publishNetworkWide = usePublishScheduleNetworkWide();
  const showPublishNetworkWide = canPublishNetworkWide && isAdmin;
  const clearableEntryIds = useMemo(
    () =>
      filteredEntries
        .filter(
          (entry) =>
            entry.campus_id !== null &&
            (entry.ministry_type || "weekend") === activeScheduleMinistry,
        )
        .map((entry) => entry.id),
    [activeScheduleMinistry, filteredEntries],
  );

  const handleTeamChange = (entry: DisplayScheduleEntry, teamId: string) => {
    if (!campusId || !rotationPeriodName) return;

    if (entry.isVirtual) {
      createEntry.mutate({
        campusId,
        date: entry.schedule_date,
        teamId,
        ministryType: entry.ministry_type || activeScheduleMinistry,
        rotationPeriod: rotationPeriodName,
      });
      return;
    }

    updateTeam.mutate({ scheduleId: entry.id, teamId, campusId });
  };

  const handleAddEntry = () => {
    if (!campusId || !newDate || !newTeamId || !rotationPeriodName) return;

    const ministryTypes =
      newMinistryType === ENCOUNTER_EON_COMBINED
        ? [...ENCOUNTER_EON_MINISTRY_TYPES]
        : [newMinistryType];

    Promise.all(
      ministryTypes.map((ministryType, index) =>
        createEntry.mutateAsync({
          campusId,
          date: newDate,
          teamId: newTeamId,
          ministryType,
          rotationPeriod: rotationPeriodName,
          suppressToast: index < ministryTypes.length - 1,
        }),
      ),
    ).then(() => {
      setAddDialogOpen(false);
      setNewDate("");
      setNewTeamId("");
      setNewMinistryType("weekend");
    });
  };

  const handleDeleteEntry = (scheduleId: string) => {
    deleteEntry.mutate(scheduleId);
  };

  const handleClearAllDates = () => {
    clearScheduleEntries.mutate(clearableEntryIds, {
      onSuccess: () => setClearAllOpen(false),
    });
  };

  const handlePublishNetworkWide = () => {
    if (!campusId || !rotationPeriodName) return;

    const ministryTypes =
      activeScheduleMinistry === "encounter" ||
      activeScheduleMinistry === "eon" ||
      activeScheduleMinistry === ENCOUNTER_EON_COMBINED
        ? ["encounter", "eon"]
        : [activeScheduleMinistry];

    publishNetworkWide.mutate({
      campusId,
      rotationPeriod: rotationPeriodName,
      ministryTypes,
    });
  };

  useEffect(() => {
    if (!addDialogOpen) return;
    if (!newDate || !availableDates.includes(newDate)) {
      setNewDate(availableDates[0] || "");
    }
  }, [addDialogOpen, availableDates, newDate]);

  if (!campusId || !rotationPeriodName) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Team Schedule</CardTitle>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-4 w-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>
                    Manage which team plays on each date. Each campus can have
                    its own schedule. Changes here only affect this campus.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Select value={activeScheduleMinistry} onValueChange={setScheduleMinistryFilter}>
              <SelectTrigger className="w-full sm:w-[190px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weekend">Weekend</SelectItem>
                <SelectItem value="kids_camp">Kids Camp</SelectItem>
                <SelectItem value="production">Production</SelectItem>
                <SelectItem value="video">Video</SelectItem>
                <SelectItem value="encounter">Encounter</SelectItem>
                <SelectItem value="eon">EON</SelectItem>
                <SelectItem value={ENCOUNTER_EON_COMBINED}>Combined (Encounter + EON)</SelectItem>
                <SelectItem value="student">Student</SelectItem>
              </SelectContent>
            </Select>
            {showPublishNetworkWide && (
              <Button
                size="sm"
                variant="outline"
                onClick={handlePublishNetworkWide}
                disabled={publishNetworkWide.isPending}
              >
                <Globe2 className="h-4 w-4 mr-1" />
                {activeScheduleMinistry === "encounter" || activeScheduleMinistry === "eon"
                || activeScheduleMinistry === ENCOUNTER_EON_COMBINED
                  ? "Publish Combined"
                  : "Publish Network Wide"}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setClearAllOpen(true)}
              disabled={clearScheduleEntries.isPending}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Clear All Dates
            </Button>
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Date
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Schedule Entry</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="date">Date</Label>
                    <Select value={newDate} onValueChange={setNewDate}>
                      <SelectTrigger id="date">
                        <SelectValue placeholder="Select a trimester date" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableDates.map((date) => (
                          <SelectItem key={date} value={date}>
                            {format(parseISO(date), "EEE, MMM d, yyyy")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {availableDates.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        All scheduled dates for this ministry are already loaded for this trimester.
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="team">Team</Label>
                    <Select value={newTeamId} onValueChange={setNewTeamId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select team" />
                      </SelectTrigger>
                      <SelectContent>
                        {teams.map((team) => (
                          <SelectItem key={team.id} value={team.id}>
                            <div className="flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: team.color }}
                              />
                              {team.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ministry">Ministry Type</Label>
                    <Select
                      value={newMinistryType}
                      onValueChange={setNewMinistryType}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="weekend">Weekend</SelectItem>
                        <SelectItem value="kids_camp">Kids Camp</SelectItem>
                        <SelectItem value="production">Production</SelectItem>
                        <SelectItem value="video">Video</SelectItem>
                        <SelectItem value="encounter">Encounter</SelectItem>
                        <SelectItem value="eon">EON</SelectItem>
                        <SelectItem value={ENCOUNTER_EON_COMBINED}>Combined (Encounter + EON)</SelectItem>
                        <SelectItem value="student">Student</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={handleAddEntry}
                    disabled={!newDate || !newTeamId || createEntry.isPending || availableDates.length === 0}
                    className="w-full"
                  >
                    Add Entry
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <AlertDialog open={clearAllOpen} onOpenChange={setClearAllOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear all dates?</AlertDialogTitle>
              <AlertDialogDescription>
                {clearableEntryIds.length > 0
                  ? "This will remove all campus-specific schedule dates currently shown for this period and ministry. Shared network-wide dates will stay untouched."
                  : "There are no saved campus-specific dates to clear yet. The rows you see right now are trimester placeholders, so there is nothing to delete."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={clearScheduleEntries.isPending}>
                {clearableEntryIds.length > 0 ? "Cancel" : "Close"}
              </AlertDialogCancel>
              {clearableEntryIds.length > 0 && (
                <AlertDialogAction
                  onClick={handleClearAllDates}
                  disabled={clearScheduleEntries.isPending}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {clearScheduleEntries.isPending ? "Clearing..." : "Clear Dates"}
                </AlertDialogAction>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {isLoading ? (
          <div className="text-center text-muted-foreground py-8">
            Loading schedule...
          </div>
        ) : displayEntries.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No schedule entries for this period.</p>
            <p className="text-sm">No trimester dates are available for this campus yet.</p>
          </div>
        ) : (
          <ScrollArea className="h-[300px] pr-4">
            <div className="space-y-2">
              {displayEntries.map((entry) => {
                const date = parseISO(entry.schedule_date);
                const isShared = !entry.isVirtual && entry.campus_id === null;
                const ministryType = entry.ministry_type || "weekend";

                return (
                  <div
                    key={entry.id}
                    className="flex items-center gap-3 p-2 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex-shrink-0 w-24 text-sm">
                      <div className="font-medium">
                        {format(date, "EEE, MMM d")}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {format(date, "yyyy")}
                      </div>
                    </div>

                    <Select
                      value={entry.team_id}
                      onValueChange={(value) =>
                        handleTeamChange(entry, value)
                      }
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue>
                          {entry.team_id ? (
                            <div className="flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: entry.team_color }}
                              />
                              <span className="truncate">{entry.team_name}</span>
                            </div>
                          ) : (
                            <span className="truncate text-muted-foreground">Select team</span>
                          )}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {teams.map((team) => (
                          <SelectItem key={team.id} value={team.id}>
                            <div className="flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: team.color }}
                              />
                              {team.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Badge
                      variant="secondary"
                      className={MINISTRY_COLORS[ministryType] || ""}
                    >
                      {ministryType.charAt(0).toUpperCase() +
                        ministryType.slice(1)}
                    </Badge>

                    {isShared && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Badge variant="outline" className="text-xs">
                              Shared
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>
                              This is a shared schedule entry. Editing will
                              create a campus-specific copy.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}

                    <div className="flex-1" />

                    {!isShared && !entry.isVirtual && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeleteEntry(entry.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
