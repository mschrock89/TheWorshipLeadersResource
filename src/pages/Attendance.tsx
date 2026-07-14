import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Crosshair,
  MapPin,
  Navigation,
  Radio,
  Settings2,
  Users,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useUserCampuses } from "@/hooks/useCampuses";
import {
  AttendanceCampus,
  useAttendanceCampuses,
  useAttendancePresence,
  useUpdateAttendanceCampusSettings,
} from "@/hooks/useAttendance";
import { useAttendanceTracking } from "@/components/attendance/AttendanceTrackingContext";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";

function formatMeters(value: number | null) {
  if (value === null || Number.isNaN(value)) return "Unknown";
  if (value >= 1000) return `${(value / 1000).toFixed(1)} km`;
  return `${Math.round(value)} m`;
}

function getInitials(name: string | null | undefined) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function CampusSettingsForm({ campus }: { campus: AttendanceCampus | null }) {
  const updateSettings = useUpdateAttendanceCampusSettings();
  const [enabled, setEnabled] = useState(false);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [radius, setRadius] = useState("150");

  useEffect(() => {
    setEnabled(Boolean(campus?.attendance_enabled));
    setLatitude(campus?.geofence_latitude?.toString() || "");
    setLongitude(campus?.geofence_longitude?.toString() || "");
    setRadius((campus?.geofence_radius_meters || 150).toString());
  }, [campus]);

  const canSave = Boolean(campus?.id) && (!enabled || (latitude.trim() && longitude.trim() && radius.trim()));

  const handleSave = () => {
    if (!campus || !canSave) return;
    updateSettings.mutate({
      campusId: campus.id,
      enabled,
      latitude: latitude.trim() ? Number(latitude) : null,
      longitude: longitude.trim() ? Number(longitude) : null,
      radiusMeters: Math.max(25, Math.min(5000, Number(radius) || 150)),
    });
  };

  if (!campus) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Settings2 className="h-5 w-5 text-primary" />
          Campus Geofence
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 p-4">
          <div>
            <Label className="text-sm font-medium">Enable automatic attendance</Label>
            <p className="mt-1 text-sm text-muted-foreground">Students assigned to this campus can be checked in by location.</p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="attendance-latitude">Latitude</Label>
            <Input
              id="attendance-latitude"
              inputMode="decimal"
              placeholder="35.000000"
              value={latitude}
              onChange={(event) => setLatitude(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="attendance-longitude">Longitude</Label>
            <Input
              id="attendance-longitude"
              inputMode="decimal"
              placeholder="-90.000000"
              value={longitude}
              onChange={(event) => setLongitude(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="attendance-radius">Radius meters</Label>
            <Input
              id="attendance-radius"
              inputMode="numeric"
              placeholder="150"
              value={radius}
              onChange={(event) => setRadius(event.target.value)}
            />
          </div>
        </div>

        <Button onClick={handleSave} disabled={!canSave || updateSettings.isPending} className="gap-2">
          <Crosshair className="h-4 w-4" />
          Save Geofence
        </Button>
      </CardContent>
    </Card>
  );
}

export default function Attendance() {
  const { user, canManageTeam } = useAuth();
  const { data: campuses = [] } = useAttendanceCampuses();
  const { data: userCampuses = [] } = useUserCampuses(user?.id);
  const tracking = useAttendanceTracking();
  const [selectedCampusId, setSelectedCampusId] = useState("");

  const availableCampuses = useMemo(() => {
    if (canManageTeam) return campuses;
    const assigned = new Set(userCampuses.map((entry) => entry.campus_id));
    return campuses.filter((campus) => assigned.has(campus.id));
  }, [campuses, canManageTeam, userCampuses]);

  useEffect(() => {
    if (!selectedCampusId && availableCampuses[0]?.id) {
      setSelectedCampusId(availableCampuses[0].id);
    }
  }, [availableCampuses, selectedCampusId]);

  const selectedCampus = availableCampuses.find((campus) => campus.id === selectedCampusId) || null;
  const { data: presence = [], isLoading: presenceLoading } = useAttendancePresence(
    canManageTeam ? selectedCampusId : null,
  );

  const hasConfiguredCampus = tracking.configuredCampuses.length > 0;
  const statusIsGood = tracking.status === "on-site";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground md:text-4xl">Attendance</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Location-based check-in for students and live on-site counts for campus leaders.
          </p>
        </div>

        {availableCampuses.length > 1 && (
          <Select value={selectedCampusId} onValueChange={setSelectedCampusId}>
            <SelectTrigger className="w-full sm:w-[260px]">
              <MapPin className="mr-2 h-4 w-4 text-muted-foreground" />
              <SelectValue placeholder="Select campus" />
            </SelectTrigger>
            <SelectContent>
              {availableCampuses.map((campus) => (
                <SelectItem key={campus.id} value={campus.id}>
                  {campus.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <Alert>
        <Navigation className="h-4 w-4" />
        <AlertTitle>Location privacy</AlertTitle>
        <AlertDescription>
          The app uses your device location to decide whether you are inside a campus geofence. Attendance records save
          check-in time, last seen time, distance, and accuracy, not a trail of raw coordinates.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Radio className="h-5 w-5 text-primary" />
              Student Check-In
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-col gap-4 rounded-lg border border-border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-foreground">Automatic location check-in</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Keep this on and the app will check you in when it sees you on campus.
                </p>
              </div>
              <Switch
                checked={tracking.enabled}
                onCheckedChange={tracking.setEnabled}
                disabled={!hasConfiguredCampus && !tracking.enabled}
              />
            </div>

            {!hasConfiguredCampus && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>No campus geofence yet</AlertTitle>
                <AlertDescription>An admin needs to add coordinates for your assigned campus first.</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div
                className={cn(
                  "rounded-lg border p-4",
                  statusIsGood ? "border-emerald-500/40 bg-emerald-500/10" : "border-border bg-card",
                )}
              >
                <div className="flex items-center gap-2">
                  {statusIsGood ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  ) : (
                    <Clock className="h-5 w-5 text-muted-foreground" />
                  )}
                  <p className="font-medium">{statusIsGood ? "Checked in" : "Not checked in"}</p>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{tracking.statusMessage}</p>
              </div>

              <div className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-primary" />
                  <p className="font-medium">{tracking.activeCampusName || tracking.nearestCampusName || "Campus"}</p>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Distance: {formatMeters(tracking.distanceMeters)} · Accuracy: {formatMeters(tracking.accuracyMeters)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5 text-primary" />
              Live Count
            </CardTitle>
          </CardHeader>
          <CardContent>
            {canManageTeam ? (
              <div>
                <p className="text-5xl font-bold text-foreground">{presenceLoading ? "..." : presence.length}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Students seen in the last 10 minutes at {selectedCampus?.name || "this campus"}.
                </p>
              </div>
            ) : (
              <div>
                <p className="text-2xl font-semibold text-foreground">
                  {tracking.activeCampusName ? "You are on site" : "Waiting for campus"}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Leaders will see your check-in once your device reports inside the geofence.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {canManageTeam && (
        <>
          <CampusSettingsForm campus={selectedCampus} />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3 text-lg">
                <span>On Site Now</span>
                <Badge variant="secondary">{presence.length} active</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {presence.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active check-ins for this campus yet.</p>
              ) : (
                <div className="divide-y divide-border">
                  {presence.map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between gap-4 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary">
                          {getInitials(entry.profiles?.full_name)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">{entry.profiles?.full_name || "Student"}</p>
                          <p className="text-sm text-muted-foreground">
                            Checked in {formatDistanceToNow(new Date(entry.checked_in_at), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                      <div className="shrink-0 text-right text-sm text-muted-foreground">
                        <p>{formatMeters(entry.distance_meters)}</p>
                        <p>Seen {formatDistanceToNow(new Date(entry.last_seen_at), { addSuffix: true })}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
