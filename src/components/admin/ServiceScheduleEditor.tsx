import { useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, Minus, Plus, Settings, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { CompactSelectValue } from "@/components/ui/compact-select-value";
import {
  AdminToolCard as Card,
  AdminToolCardContent as CardContent,
  AdminToolCardHeader as CardHeader,
} from "@/components/admin/AdminToolCard";
import { CardDescription, CardTitle } from "@/components/ui/card";
import type { Campus } from "@/hooks/useCampuses";
import { useCampusMinistrySchedules, useSaveCampusMinistrySchedule } from "@/hooks/useCampusMinistrySchedules";
import {
  SERVICE_SCHEDULE_MINISTRY_OPTIONS,
  buildDayScheduleDrafts,
  configuredMinistryTypes,
  ministryScheduleIsInherited,
  serviceScheduleMinistryLabel,
  type DayScheduleDraft,
} from "@/lib/campusMinistrySchedule";

function formatTime(timeString: string): string {
  if (!timeString) return "-";
  const [hours, minutes] = timeString.split(":");
  const hour = parseInt(hours, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
}

function formatTimes(times: string[] | null | undefined): string {
  if (!times || times.length === 0) return "-";
  return times.map((time) => formatTime(time)).join(", ");
}

type ServiceScheduleEditorProps = {
  campuses: Campus[];
  campusesLoading: boolean;
  campusId: string | null;
  ministryType: string | null;
  onSelectCampus: (campusId: string) => void;
  onSelectMinistry: (ministryType: string) => void;
  onBack: () => void;
};

export function ServiceScheduleEditor({
  campuses,
  campusesLoading,
  campusId,
  ministryType,
  onSelectCampus,
  onSelectMinistry,
  onBack,
}: ServiceScheduleEditorProps) {
  const selectedMinistry = SERVICE_SCHEDULE_MINISTRY_OPTIONS.some((option) => option.value === ministryType)
    ? ministryType!
    : "weekend";
  const campus = campuses.find((entry) => entry.id === campusId) || null;
  const { data: schedules = [], isLoading: schedulesLoading, isFetched: schedulesFetched, isError } = useCampusMinistrySchedules();
  const saveSchedule = useSaveCampusMinistrySchedule();
  const campusRows = useMemo(
    () => schedules.filter((row) => row.campus_id === campusId),
    [schedules, campusId],
  );
  const savedSignature = useMemo(
    () => JSON.stringify(campusRows.map((row) => [row.ministry_type, row.day_of_week, row.service_times])),
    [campusRows],
  );
  const [drafts, setDrafts] = useState<DayScheduleDraft[]>([]);

  useEffect(() => {
    if (!campus || !schedulesFetched) return;
    setDrafts(buildDayScheduleDrafts({
      ministryType: selectedMinistry,
      campus,
      rows: campusRows,
    }));
  }, [campus, campusRows, schedulesFetched, selectedMinistry, savedSignature]);

  const inherited = ministryScheduleIsInherited(selectedMinistry, campusRows);
  const ministryLabel = serviceScheduleMinistryLabel(selectedMinistry);

  const updateDraft = (day: number, update: (draft: DayScheduleDraft) => DayScheduleDraft) => {
    setDrafts((current) => current.map((draft) => (draft.day === day ? update(draft) : draft)));
  };

  const handleSave = () => {
    if (!campus) return;
    saveSchedule.mutate({
      campusId: campus.id,
      ministryType: selectedMinistry,
      drafts,
    });
  };

  if (!campusId) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="space-y-1">
            <CardTitle className="text-xl font-semibold flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Service Schedule
            </CardTitle>
            <CardDescription>
              Open a campus to set service days and times for any ministry.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {campusesLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : (
            <div className="space-y-3">
              {campuses.map((entry) => {
                const extraMinistries = configuredMinistryTypes(schedules, entry.id);
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => onSelectCampus(entry.id)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-border p-4 text-left transition-colors hover:bg-accent/40"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium text-foreground">{entry.name}</span>
                      <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          {entry.has_saturday_service ? (
                            <Check className="h-3.5 w-3.5 text-green-500" />
                          ) : (
                            <X className="h-3.5 w-3.5 text-muted-foreground/50" />
                          )}
                          Sat {entry.has_saturday_service ? formatTimes(entry.saturday_service_time) : "-"}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          {entry.has_sunday_service ? (
                            <Check className="h-3.5 w-3.5 text-green-500" />
                          ) : (
                            <X className="h-3.5 w-3.5 text-muted-foreground/50" />
                          )}
                          Sun {entry.has_sunday_service ? formatTimes(entry.sunday_service_time) : "-"}
                        </span>
                      </span>
                      {extraMinistries.length > 0 ? (
                        <span className="mt-1 block text-xs text-muted-foreground">
                          Also scheduled: {extraMinistries.map((value) => serviceScheduleMinistryLabel(value)).join(", ")}
                        </span>
                      ) : null}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-xl font-semibold flex items-center gap-2">
              <Settings className="h-5 w-5" />
              {campus?.name || "Campus"}
            </CardTitle>
            <CardDescription>
              Choose a ministry, then set the days and service times for this campus.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={onBack}>
            All campuses
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {campusesLoading || schedulesLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : !campus ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">That campus is not available.</p>
            <Button variant="outline" onClick={onBack}>All campuses</Button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-2 max-w-sm">
              <Label>Ministry</Label>
              <Select value={selectedMinistry} onValueChange={onSelectMinistry}>
                <SelectTrigger>
                  <CompactSelectValue label={ministryLabel} placeholder="Ministry" />
                </SelectTrigger>
                <SelectContent>
                  {SERVICE_SCHEDULE_MINISTRY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {inherited ? (
                <p className="text-xs text-muted-foreground">
                  {ministryLabel} is using the Weekend Services days until you save a schedule for it.
                </p>
              ) : null}
              {isError ? (
                <p className="text-xs text-destructive">
                  Saved ministry schedules could not be loaded. Apply the latest database migration, then reload this page.
                </p>
              ) : null}
            </div>

            <div className="space-y-4">
              {drafts.map((draft) => (
                <div key={draft.day} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant={draft.enabled ? "destructive" : "outline"}
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={() => updateDraft(draft.day, (current) => ({ ...current, enabled: !current.enabled }))}
                        aria-label={draft.enabled ? `Remove ${draft.label}` : `Add ${draft.label}`}
                      >
                        {draft.enabled ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                      </Button>
                      <span className={`text-sm font-medium ${draft.enabled ? "text-foreground" : "text-muted-foreground"}`}>
                        {draft.label}
                      </span>
                    </div>
                    {draft.enabled ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => updateDraft(draft.day, (current) => ({
                          ...current,
                          times: [...current.times, current.day === 0 ? "11:30" : "18:00"],
                        }))}
                      >
                        <Plus className="h-3 w-3" />
                        Add Time
                      </Button>
                    ) : null}
                  </div>
                  {draft.enabled ? (
                    <div className="ml-9 space-y-2">
                      {draft.times.map((time, index) => (
                        <div key={`${draft.day}-${index}`} className="flex items-center gap-2">
                          <Input
                            type="time"
                            value={time}
                            onChange={(event) => updateDraft(draft.day, (current) => {
                              const times = [...current.times];
                              times[index] = event.target.value;
                              return { ...current, times };
                            })}
                            className="w-[130px]"
                          />
                          {draft.times.length > 1 ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => updateDraft(draft.day, (current) => ({
                                ...current,
                                times: current.times.filter((_, timeIndex) => timeIndex !== index),
                              }))}
                              aria-label={`Remove ${draft.label} time`}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="ml-9 text-xs text-muted-foreground italic">No service</p>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-end border-t border-border pt-4">
              <Button onClick={handleSave} disabled={saveSchedule.isPending}>
                {saveSchedule.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
