import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { CompactSelectValue } from "@/components/ui/compact-select-value";
import {
  AdminToolCard as Card,
  AdminToolCardContent as CardContent,
  AdminToolCardHeader as CardHeader,
} from "@/components/admin/AdminToolCard";
import { CardDescription, CardTitle } from "@/components/ui/card";
import { DayScheduleFields } from "@/components/admin/DayScheduleFields";
import type { Campus } from "@/hooks/useCampuses";
import { useAttendanceCampuses } from "@/hooks/useAttendance";
import { useCampusMinistrySchedules } from "@/hooks/useCampusMinistrySchedules";
import { useCampusMinistrySet } from "@/hooks/useCampusMinistries";
import { useSaveCampusSetup } from "@/hooks/useCampusSetup";
import { useToast } from "@/hooks/use-toast";
import { ministryUsesCampusWeekendDefaults } from "@/lib/campusMinistrySchedule";
import {
  buildCampusMinistryDrafts,
  campusSetupError,
  type CampusMinistryDraft,
} from "@/lib/campusSetup";

type CampusSetupEditorProps = {
  campuses: Campus[];
  campusId: string | null;
  onBack: () => void;
  onSaved: (campusId: string) => void;
};

export function CampusSetupEditor({ campuses, campusId, onBack, onSaved }: CampusSetupEditorProps) {
  const { toast } = useToast();
  const isNew = !campusId;
  const campus = campuses.find((entry) => entry.id === campusId) || null;
  const schedulesQuery = useCampusMinistrySchedules();
  const ministriesQuery = useCampusMinistrySet(campusId);
  const attendanceQuery = useAttendanceCampuses();
  const saveCampus = useSaveCampusSetup();
  const sourceCampuses = campuses.filter((entry) => entry.id !== campusId);

  const [name, setName] = useState("");
  const [ministries, setMinistries] = useState<CampusMinistryDraft[]>([]);
  const [attendanceEnabled, setAttendanceEnabled] = useState(false);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [radius, setRadius] = useState("150");
  const [copyFromCampusId, setCopyFromCampusId] = useState("");
  const [copyRosterTemplates, setCopyRosterTemplates] = useState(true);
  const [copyServiceFlows, setCopyServiceFlows] = useState(true);
  const [copyNotificationChoices, setCopyNotificationChoices] = useState(true);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  const campusRows = useMemo(
    () => (schedulesQuery.data || []).filter((row) => row.campus_id === campusId),
    [campusId, schedulesQuery.data],
  );
  const savedSignature = useMemo(
    () => JSON.stringify(campusRows.map((row) => [row.ministry_type, row.day_of_week, row.service_times])),
    [campusRows],
  );
  const ministrySignature = useMemo(
    () => (ministriesQuery.enabled ? [...ministriesQuery.enabled].sort().join(",") : ""),
    [ministriesQuery.enabled],
  );
  const attendanceCampus = (attendanceQuery.data || []).find((entry) => entry.id === campusId) || null;
  const ready = isNew
    || (
      Boolean(campus)
      && schedulesQuery.isFetched
      && ministriesQuery.isSuccess
      && attendanceQuery.isSuccess
    );

  useEffect(() => {
    if (!isNew || loadedKey === "new") return;
    setMinistries(buildCampusMinistryDrafts({
      campus: null,
      schedules: [],
      enabledMinistries: null,
      isNew: true,
    }));
    setLoadedKey("new");
  }, [isNew, loadedKey]);

  useEffect(() => {
    if (isNew || !ready || !campus) return;
    const key = `${campus.id}:${savedSignature}:${ministrySignature}:${attendanceCampus?.attendance_enabled}:${attendanceCampus?.geofence_latitude}:${attendanceCampus?.geofence_longitude}`;
    if (loadedKey === key) return;
    setName(campus.name);
    setMinistries(buildCampusMinistryDrafts({
      campus,
      schedules: campusRows,
      enabledMinistries: ministriesQuery.enabled,
      isNew: false,
    }));
    setAttendanceEnabled(Boolean(attendanceCampus?.attendance_enabled));
    setLatitude(attendanceCampus?.geofence_latitude?.toString() || "");
    setLongitude(attendanceCampus?.geofence_longitude?.toString() || "");
    setRadius(String(attendanceCampus?.geofence_radius_meters || 150));
    setLoadedKey(key);
  }, [attendanceCampus, campus, campusRows, isNew, loadedKey, ministriesQuery.enabled, ministrySignature, ready, savedSignature]);

  const defaultCopySourceId = sourceCampuses[0]?.id || "";
  useEffect(() => {
    if (!copyFromCampusId && defaultCopySourceId) {
      setCopyFromCampusId(defaultCopySourceId);
    }
  }, [copyFromCampusId, defaultCopySourceId]);

  const updateMinistry = (ministryType: string, update: (draft: CampusMinistryDraft) => CampusMinistryDraft) => {
    setMinistries((current) => current.map((draft) => (draft.ministryType === ministryType ? update(draft) : draft)));
  };

  const handleSave = () => {
    const error = campusSetupError({
      name,
      ministries,
      attendanceEnabled,
      latitude,
      longitude,
      radius,
      existingNames: campuses.map((entry) => ({ id: entry.id, name: entry.name })),
      campusId,
    });
    if (error) {
      toast({ title: error, variant: "destructive" });
      return;
    }
    saveCampus.mutate({
      campusId,
      name,
      ministries,
      attendanceEnabled,
      latitude,
      longitude,
      radius,
      copyFromCampusId: copyFromCampusId || null,
      copyRosterTemplates,
      copyServiceFlows,
      copyNotificationChoices,
    }, {
      onSuccess: (result) => onSaved(result.campusId),
    });
  };

  if (!isNew && !campuses.some((entry) => entry.id === campusId) && campuses.length > 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Campus not available</CardTitle>
          <CardDescription>That campus could not be found.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={onBack}>All campuses</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-xl font-semibold">
              <Building2 className="h-5 w-5" />
              {isNew ? "Add campus" : name || campus?.name || "Campus"}
            </CardTitle>
            <CardDescription>
              Choose the ministries this campus runs, then set the service days and times for each one.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={onBack}>All campuses</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-8">
        {ministriesQuery.isError ? (
          <p className="text-sm text-destructive">
            Campus ministries could not be loaded. Apply the latest database migration, then reload this page.
          </p>
        ) : !ready ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <>
            <div className="max-w-md space-y-2">
              <Label htmlFor="campus-name">Campus name</Label>
              <Input
                id="campus-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Spring Hill"
              />
            </div>

            <div className="space-y-3">
              <div>
                <Label>Ministries</Label>
                <p className="mt-1 text-sm text-muted-foreground">
                  Checked ministries show up for this campus in Team Builder, Set Builder, the Feed, profiles, gap requests, and live service tools. Weekend-aligned teams can use the weekend days until they need their own.
                </p>
              </div>
              {!isNew && !ministriesQuery.enabled ? (
                <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                  This campus does not have a saved ministry list yet, so every ministry is still available. Saving keeps only the ministries checked below.
                </p>
              ) : null}
              <div className="space-y-3">
                {ministries.map((ministry) => {
                  const canFollowWeekend = ministry.ministryType !== "weekend" && ministryUsesCampusWeekendDefaults(ministry.ministryType);
                  return (
                    <div key={ministry.ministryType} className="rounded-lg border border-border p-4">
                      <label className="flex items-center gap-2 text-sm font-medium">
                        <Checkbox
                          checked={ministry.enabled}
                          onCheckedChange={(checked) => updateMinistry(ministry.ministryType, (current) => ({
                            ...current,
                            enabled: checked === true,
                          }))}
                        />
                        {ministry.label}
                      </label>
                      {ministry.enabled ? (
                        <div className="mt-4 space-y-4">
                          {canFollowWeekend ? (
                            <div className="flex items-center justify-between gap-4">
                              <div>
                                <p className="text-sm font-medium">Use weekend service times</p>
                                <p className="text-xs text-muted-foreground">Turn this off to give {ministry.label} its own days.</p>
                              </div>
                              <Switch
                                checked={ministry.followWeekend}
                                onCheckedChange={(checked) => updateMinistry(ministry.ministryType, (current) => ({
                                  ...current,
                                  followWeekend: checked,
                                }))}
                              />
                            </div>
                          ) : null}
                          {ministry.followWeekend ? (
                            <p className="text-sm text-muted-foreground">Follows the Weekend Services days and times.</p>
                          ) : (
                            <DayScheduleFields
                              drafts={ministry.days}
                              onChange={(day, update) => updateMinistry(ministry.ministryType, (current) => ({
                                ...current,
                                days: current.days.map((draft) => (draft.day === day ? update(draft) : draft)),
                              }))}
                            />
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-4 rounded-lg border border-border p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Student attendance
                  </Label>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Students assigned to this campus can check in when their device is inside this geofence.
                  </p>
                </div>
                <Switch checked={attendanceEnabled} onCheckedChange={setAttendanceEnabled} />
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="campus-latitude">Latitude</Label>
                  <Input
                    id="campus-latitude"
                    inputMode="decimal"
                    placeholder="35.845000"
                    value={latitude}
                    onChange={(event) => setLatitude(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="campus-longitude">Longitude</Label>
                  <Input
                    id="campus-longitude"
                    inputMode="decimal"
                    placeholder="-86.392000"
                    value={longitude}
                    onChange={(event) => setLongitude(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="campus-radius">Radius meters</Label>
                  <Input
                    id="campus-radius"
                    inputMode="numeric"
                    value={radius}
                    onChange={(event) => setRadius(event.target.value)}
                  />
                </div>
              </div>
            </div>

            {isNew && sourceCampuses.length > 0 ? (
              <div className="space-y-4 rounded-lg border border-border p-4">
                <div className="max-w-sm space-y-2">
                  <Label>Copy setup from</Label>
                  <Select value={copyFromCampusId} onValueChange={setCopyFromCampusId}>
                    <SelectTrigger>
                      <CompactSelectValue
                        label={sourceCampuses.find((entry) => entry.id === copyFromCampusId)?.name}
                        placeholder="Choose a campus"
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {sourceCampuses.map((entry) => (
                        <SelectItem key={entry.id} value={entry.id}>{entry.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={copyRosterTemplates} onCheckedChange={(checked) => setCopyRosterTemplates(checked === true)} />
                  Roster templates for the ministries checked above
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={copyServiceFlows} onCheckedChange={(checked) => setCopyServiceFlows(checked === true)} />
                  Service flow templates
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={copyNotificationChoices} onCheckedChange={(checked) => setCopyNotificationChoices(checked === true)} />
                  Leadership notification choices, including Push Notifications by campus
                </label>
                <p className="text-xs text-muted-foreground">
                  People who have not customized notifications keep the default, which is on for every campus. People set to explicit-only get the same checked channels as the campus you copy from.
                </p>
              </div>
            ) : null}

            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                A saved campus is available everywhere a campus can be picked: Calendar, Team Builder, Set Builder, Feed, Chat, Auditions, Teaching Schedule, and Admin notifications.
              </p>
              <p className="flex flex-wrap gap-x-4 gap-y-1">
                <Link className="text-primary underline-offset-4 hover:underline" to="/push-notifications">Push Notifications</Link>
                <Link className="text-primary underline-offset-4 hover:underline" to="/team-builder">Team Builder</Link>
                <Link className="text-primary underline-offset-4 hover:underline" to="/set-planner">Set Builder</Link>
                <Link className="text-primary underline-offset-4 hover:underline" to="/feed">Feed</Link>
                <Link className="text-primary underline-offset-4 hover:underline" to="/pre-service-playlists">Service Audio</Link>
                <Link className="text-primary underline-offset-4 hover:underline" to="/service-scripts">Service Scripts</Link>
              </p>
            </div>

            <div className="flex justify-end border-t border-border pt-4">
              <Button onClick={handleSave} disabled={saveCampus.isPending || ministries.length === 0}>
                {saveCampus.isPending ? "Saving..." : isNew ? "Add campus" : "Save campus"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
