import { useState, useMemo } from "react";
import { format, parseISO, getDay } from "date-fns";
import { Calendar, Plus, Trash2, Info } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useTeamScheduleForCampus,
  useUpdateScheduleTeam,
  useCreateScheduleEntry,
  useDeleteScheduleEntry,
} from "@/hooks/useTeamScheduleEditor";
import { useWorshipTeams } from "@/hooks/useTeamSchedule";
import { useCampuses } from "@/hooks/useCampuses";

interface TeamScheduleWidgetProps {
  campusId: string | null;
  rotationPeriodName: string | null;
  ministryFilter: string | null;
}

const MINISTRY_COLORS: Record<string, string> = {
  weekend: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  encounter: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  eon: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  student: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
};

export function TeamScheduleWidget({
  campusId,
  rotationPeriodName,
  ministryFilter,
}: TeamScheduleWidgetProps) {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newTeamId, setNewTeamId] = useState("");
  const [newMinistryType, setNewMinistryType] = useState("weekend");

  const { data: scheduleEntries = [], isLoading } = useTeamScheduleForCampus(
    campusId,
    rotationPeriodName,
    ministryFilter
  );
  const { data: campuses = [] } = useCampuses();
  const { data: teams = [] } = useWorshipTeams();

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
  const updateTeam = useUpdateScheduleTeam();
  const createEntry = useCreateScheduleEntry();
  const deleteEntry = useDeleteScheduleEntry();

  const handleTeamChange = (scheduleId: string, teamId: string) => {
    if (!campusId) return;
    updateTeam.mutate({ scheduleId, teamId, campusId });
  };

  const handleAddEntry = () => {
    if (!campusId || !newDate || !newTeamId || !rotationPeriodName) return;
    createEntry.mutate(
      {
        campusId,
        date: newDate,
        teamId: newTeamId,
        ministryType: newMinistryType,
        rotationPeriod: rotationPeriodName,
      },
      {
        onSuccess: () => {
          setAddDialogOpen(false);
          setNewDate("");
          setNewTeamId("");
          setNewMinistryType("weekend");
        },
      }
    );
  };

  const handleDeleteEntry = (scheduleId: string) => {
    deleteEntry.mutate(scheduleId);
  };

  if (!campusId || !rotationPeriodName) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
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
                  <Input
                    id="date"
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                  />
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
                      <SelectItem value="encounter">Encounter</SelectItem>
                      <SelectItem value="eon">EON</SelectItem>
                      <SelectItem value="student">Student</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={handleAddEntry}
                  disabled={!newDate || !newTeamId || createEntry.isPending}
                  className="w-full"
                >
                  Add Entry
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center text-muted-foreground py-8">
            Loading schedule...
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No schedule entries for this period.</p>
            <p className="text-sm">Click "Add Date" to create one.</p>
          </div>
        ) : (
          <ScrollArea className="h-[300px] pr-4">
            <div className="space-y-2">
              {filteredEntries.map((entry) => {
                const date = parseISO(entry.schedule_date);
                const isShared = entry.campus_id === null;
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
                        handleTeamChange(entry.id, value)
                      }
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue>
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: entry.team_color }}
                            />
                            <span className="truncate">{entry.team_name}</span>
                          </div>
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

                    {!isShared && (
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
