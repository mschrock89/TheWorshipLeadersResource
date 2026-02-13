import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, addDays } from "date-fns";
import { CalendarClock, Home, ListChecks, MapPin, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCampuses, useUserCampuses } from "@/hooks/useCampuses";
import { useUpsertAudition, AuditionStage, AuditionTrack } from "@/hooks/useAuditions";
import { POSITION_LABELS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

type QueueAudition = {
  id: string;
  candidate_id: string;
  campus_id: string | null;
  audition_date: string;
  start_time: string | null;
  end_time: string | null;
  stage: AuditionStage;
  candidate_track: AuditionTrack;
  status: "scheduled" | "completed" | "cancelled";
  notes: string | null;
};

type QueueCandidate = {
  id: string;
  full_name: string | null;
  positions: string[] | null;
  campusIds: string[];
  upcomingAudition: QueueAudition | null;
  latestAudition: QueueAudition | null;
};

function formatTime(time: string | null): string {
  if (!time) return "Time TBD";
  const [hours, minutes] = time.split(":");
  const hour = Number(hours);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${suffix}`;
}

function getTrackLabel(track: AuditionTrack | null): string {
  if (track === "vocalist") return "Vocalist";
  if (track === "instrumentalist") return "Instrumentalist";
  return "Not Set";
}

function getStageLabel(stage: AuditionStage | null): string {
  if (stage === "pre_audition") return "Pre-Audition";
  if (stage === "audition") return "Audition";
  return "Unscheduled";
}

export default function Auditions() {
  const { user, canManageTeam, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const upsertAudition = useUpsertAudition();
  const { data: campuses = [] } = useCampuses();
  const { data: assignedCampusRows = [] } = useUserCampuses(user?.id);
  const [selectedCampusId, setSelectedCampusId] = useState<string>("");

  const assignedCampusIds = useMemo(
    () => Array.from(new Set(assignedCampusRows.map((row) => row.campus_id))),
    [assignedCampusRows]
  );
  const availableCampuses = useMemo(
    () => campuses.filter((campus) => assignedCampusIds.includes(campus.id)),
    [campuses, assignedCampusIds]
  );

  useEffect(() => {
    if (availableCampuses.length === 0) return;
    if (!selectedCampusId || !availableCampuses.some((c) => c.id === selectedCampusId)) {
      setSelectedCampusId(availableCampuses[0].id);
    }
  }, [availableCampuses, selectedCampusId]);

  const { data: queue = [], isLoading } = useQuery({
    queryKey: ["audition-queue", selectedCampusId],
    enabled: !!selectedCampusId,
    queryFn: async (): Promise<QueueCandidate[]> => {
      const today = new Date().toISOString().split("T")[0];

      const { data: roleRows, error: roleError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "audition_candidate");
      if (roleError) throw roleError;

      const candidateIds = Array.from(new Set((roleRows || []).map((r) => r.user_id)));
      if (candidateIds.length === 0) return [];

      const { data: profileRows, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, positions")
        .in("id", candidateIds);
      if (profileError) throw profileError;

      const { data: candidateCampuses, error: campusError } = await supabase
        .from("user_campuses")
        .select("user_id, campus_id")
        .in("user_id", candidateIds);
      if (campusError) throw campusError;

      const { data: auditionRows, error: auditionError } = await supabase
        .from("auditions")
        .select("id, candidate_id, campus_id, audition_date, start_time, end_time, stage, candidate_track, status, notes")
        .in("candidate_id", candidateIds)
        .order("audition_date", { ascending: true })
        .order("start_time", { ascending: true, nullsFirst: true });
      if (auditionError) throw auditionError;

      const campusMap = new Map<string, string[]>();
      for (const row of candidateCampuses || []) {
        const existing = campusMap.get(row.user_id) || [];
        existing.push(row.campus_id);
        campusMap.set(row.user_id, existing);
      }

      const result: QueueCandidate[] = (profileRows || [])
        .map((profile) => {
          const allAuditions = (auditionRows || []).filter((a) => a.candidate_id === profile.id);
          const upcoming = allAuditions.find(
            (a) =>
              a.status === "scheduled" &&
              a.audition_date >= today &&
              (!selectedCampusId || a.campus_id === selectedCampusId)
          ) || null;
          const latest = [...allAuditions]
            .sort((a, b) => (a.audition_date < b.audition_date ? 1 : -1))[0] || null;

          return {
            id: profile.id,
            full_name: profile.full_name,
            positions: (profile.positions as string[] | null) || [],
            campusIds: campusMap.get(profile.id) || [],
            upcomingAudition: upcoming as QueueAudition | null,
            latestAudition: latest as QueueAudition | null,
          };
        })
        .filter((candidate) => candidate.campusIds.includes(selectedCampusId))
        .sort((a, b) => {
          if (!a.upcomingAudition && b.upcomingAudition) return -1;
          if (a.upcomingAudition && !b.upcomingAudition) return 1;
          if (!a.upcomingAudition || !b.upcomingAudition) {
            return (a.full_name || "").localeCompare(b.full_name || "");
          }
          return a.upcomingAudition.audition_date.localeCompare(b.upcomingAudition.audition_date);
        });

      return result;
    },
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeCandidate, setActiveCandidate] = useState<QueueCandidate | null>(null);
  const [auditionDate, setAuditionDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [stage, setStage] = useState<AuditionStage>("pre_audition");
  const [track, setTrack] = useState<AuditionTrack>("vocalist");
  const [notes, setNotes] = useState("");

  const needsScheduling = queue.filter((candidate) => !candidate.upcomingAudition);
  const scheduledQueue = queue.filter((candidate) => !!candidate.upcomingAudition);

  if (authLoading) return null;
  if (!user) return <Navigate to="/auth" replace />;
  if (!canManageTeam) return <Navigate to="/dashboard" replace />;

  const openScheduleDialog = (candidate: QueueCandidate) => {
    const existing = candidate.upcomingAudition || candidate.latestAudition;
    setActiveCandidate(candidate);
    setStage(existing?.stage || "pre_audition");
    setTrack(existing?.candidate_track || "vocalist");
    setAuditionDate(existing?.audition_date || format(addDays(new Date(), 7), "yyyy-MM-dd"));
    setStartTime(existing?.start_time || "");
    setEndTime(existing?.end_time || "");
    setNotes(existing?.notes || "");
    setDialogOpen(true);
  };

  const saveAudition = async () => {
    if (!activeCandidate || !auditionDate || !selectedCampusId) return;
    await upsertAudition.mutateAsync({
      id: activeCandidate.upcomingAudition?.id,
      candidate_id: activeCandidate.id,
      campus_id: selectedCampusId,
      audition_date: auditionDate,
      start_time: startTime || null,
      end_time: endTime || null,
      stage,
      candidate_track: track,
      notes: notes || null,
      status: "scheduled",
    });
    await queryClient.invalidateQueries({ queryKey: ["audition-queue"] });
    setDialogOpen(false);
    setActiveCandidate(null);
  };

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
            <BreadcrumbPage>Auditions</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ListChecks className="h-6 w-6" />
            Audition Queue
          </h1>
          <p className="text-sm text-muted-foreground">
            Track candidates in process and schedule upcoming pre-auditions/auditions.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <Select value={selectedCampusId} onValueChange={setSelectedCampusId} disabled={availableCampuses.length === 0}>
            <SelectTrigger className="w-auto min-w-[220px]">
              <SelectValue placeholder="Select Campus" />
            </SelectTrigger>
            <SelectContent>
              {availableCampuses.map((campus) => (
                <SelectItem key={campus.id} value={campus.id}>
                  {campus.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-amber-500" />
              Needs Scheduling
            </CardTitle>
            <CardDescription>{needsScheduling.length} candidate(s)</CardDescription>
          </CardHeader>
          <CardContent>
            {needsScheduling.length === 0 ? (
              <p className="text-sm text-muted-foreground">Everyone in this campus has an upcoming audition scheduled.</p>
            ) : (
              <div className="space-y-3">
                {needsScheduling.map((candidate) => (
                  <div key={candidate.id} className="rounded-lg border p-3 bg-background/60">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="font-medium">{candidate.full_name || "Unnamed Candidate"}</p>
                        <p className="text-sm text-muted-foreground">
                          {candidate.latestAudition?.candidate_track
                            ? getTrackLabel(candidate.latestAudition.candidate_track)
                            : ((candidate.positions?.[0] && POSITION_LABELS[candidate.positions[0]]) || "Track not set")}
                        </p>
                      </div>
                      <Button size="sm" onClick={() => openScheduleDialog(candidate)}>
                        Schedule
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-emerald-500/40 bg-emerald-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-emerald-500" />
              Scheduled Queue
            </CardTitle>
            <CardDescription>{scheduledQueue.length} upcoming</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading queue...</p>
            ) : scheduledQueue.length === 0 ? (
              <p className="text-sm text-muted-foreground">No upcoming auditions scheduled yet.</p>
            ) : (
              <div className="space-y-3">
                {scheduledQueue.map((candidate) => {
                  const upcoming = candidate.upcomingAudition!;
                  return (
                    <div key={candidate.id} className="rounded-lg border p-3 bg-background/60">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="font-medium">{candidate.full_name || "Unnamed Candidate"}</p>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary">{getStageLabel(upcoming.stage)}</Badge>
                            <Badge variant="outline">{getTrackLabel(upcoming.candidate_track)}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(`${upcoming.audition_date}T00:00:00`), "EEE, MMM d, yyyy")} • {formatTime(upcoming.start_time)}
                            {upcoming.end_time ? ` - ${formatTime(upcoming.end_time)}` : ""}
                          </p>
                        </div>
                        <div className="flex flex-col gap-2">
                          <Button size="sm" variant="outline" onClick={() => openScheduleDialog(candidate)}>
                            Reschedule
                          </Button>
                          <Button size="sm" asChild>
                            <Link to={`/set-planner/audition/${candidate.id}`}>Setlist</Link>
                          </Button>
                          <Button size="sm" variant="ghost" asChild>
                            <Link to={`/team/${candidate.id}`}>Profile</Link>
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Audition</DialogTitle>
            <DialogDescription>
              {activeCandidate?.full_name || "Candidate"} • {availableCampuses.find((c) => c.id === selectedCampusId)?.name || "Campus"}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={auditionDate} onChange={(e) => setAuditionDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Stage</Label>
              <Select value={stage} onValueChange={(value) => setStage(value as AuditionStage)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pre_audition">Pre-Audition</SelectItem>
                  <SelectItem value="audition">Audition</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Track</Label>
              <Select value={track} onValueChange={(value) => setTrack(value as AuditionTrack)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vocalist">Vocalist</SelectItem>
                  <SelectItem value="instrumentalist">Instrumentalist</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Campus</Label>
              <Select value={selectedCampusId} onValueChange={setSelectedCampusId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableCampuses.map((campus) => (
                    <SelectItem key={campus.id} value={campus.id}>
                      {campus.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Start Time</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>End Time</Label>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any prep notes for this candidate..." />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveAudition} disabled={upsertAudition.isPending || !auditionDate || !selectedCampusId}>
              {upsertAudition.isPending ? "Saving..." : "Save Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
