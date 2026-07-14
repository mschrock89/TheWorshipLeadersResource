import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { format } from "date-fns";
import { CalendarDays, Download, ExternalLink, FileText, Loader2, MapPinned, Paperclip, Tent, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useCampuses, useUserCampuses } from "@/hooks/useCampuses";
import {
  type CampAttachment,
  getCampAttachmentUrl,
  useActiveCampMode,
  useCampAttachments,
  useCampContentSections,
} from "@/hooks/useCampMode";
import { useEvents } from "@/hooks/useEvents";
import { useTeamSchedule } from "@/hooks/useTeamSchedule";
import { normalizeSessionSetMinistryType } from "@/lib/constants";
import { getCurrentResourceAppKey, isStudentResourceAppKey } from "@/lib/resourceApp";
import Feed from "@/pages/Feed";

function formatDateRange(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";
  if (startDate === endDate) return format(start, "MMM d, yyyy");
  return `${format(start, "MMM d")} - ${format(end, "MMM d, yyyy")}`;
}

function timeLabel(startTime?: string | null, endTime?: string | null) {
  if (!startTime && !endTime) return "All day";
  if (startTime && endTime) return `${startTime.slice(0, 5)} - ${endTime.slice(0, 5)}`;
  return (startTime || endTime || "").slice(0, 5);
}

function isImageAttachment(attachment: CampAttachment) {
  return (attachment.mime_type || "").startsWith("image/");
}

function CampAttachmentCard({ attachment }: { attachment: CampAttachment }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!isImageAttachment(attachment)) return;
    getCampAttachmentUrl(attachment.file_path)
      .then((url) => {
        if (!cancelled) setSignedUrl(url);
      })
      .catch(() => {
        if (!cancelled) setSignedUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [attachment]);

  const handleOpen = async () => {
    setIsResolving(true);
    try {
      const url = signedUrl || (await getCampAttachmentUrl(attachment.file_path));
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      setIsResolving(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      {isImageAttachment(attachment) && signedUrl ? (
        <button type="button" onClick={handleOpen} className="block w-full">
          <img
            src={signedUrl}
            alt={attachment.title}
            className="max-h-96 w-full object-contain bg-black/20"
            loading="lazy"
          />
        </button>
      ) : null}
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div className="flex min-w-0 items-center gap-3">
          {isImageAttachment(attachment) ? (
            <MapPinned className="h-5 w-5 shrink-0 text-primary" />
          ) : (
            <FileText className="h-5 w-5 shrink-0 text-primary" />
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{attachment.title}</p>
            <p className="truncate text-xs text-muted-foreground">{attachment.file_name}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleOpen} disabled={isResolving}>
          {isResolving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          Open
        </Button>
      </CardContent>
    </Card>
  );
}

export default function CampMode() {
  const resourceAppKey = getCurrentResourceAppKey();
  const { user } = useAuth();
  const { data: activeCamp, isLoading: campLoading } = useActiveCampMode();
  const { data: sections = [], isLoading: sectionsLoading } = useCampContentSections(activeCamp?.id);
  const { data: attachments = [], isLoading: attachmentsLoading } = useCampAttachments(activeCamp?.id);
  const { data: allCampuses = [] } = useCampuses();
  const { data: userCampuses = [] } = useUserCampuses(user?.id);
  const { data: events = [], isLoading: eventsLoading } = useEvents();
  const [selectedCampusId, setSelectedCampusId] = useState<string | null>(null);

  const campCampusIds = useMemo(() => new Set(activeCamp?.campus_ids || []), [activeCamp?.campus_ids]);
  const availableCampuses = useMemo(() => {
    if (!activeCamp) return [];
    if (campCampusIds.size > 0) {
      return allCampuses.filter((campus) => campCampusIds.has(campus.id));
    }
    const byId = new Map<string, (typeof allCampuses)[number]>();
    userCampuses.forEach((entry) => {
      if (entry.campuses?.id) byId.set(entry.campuses.id, entry.campuses);
    });
    return Array.from(byId.values());
  }, [activeCamp, allCampuses, campCampusIds, userCampuses]);

  useEffect(() => {
    if (selectedCampusId && availableCampuses.some((campus) => campus.id === selectedCampusId)) return;
    setSelectedCampusId(availableCampuses[0]?.id || null);
  }, [availableCampuses, selectedCampusId]);

  const selectedCampus = availableCampuses.find((campus) => campus.id === selectedCampusId) || null;
  const { data: teamSchedule = [] } = useTeamSchedule(
    undefined,
    selectedCampusId,
    activeCamp ? ["students_hs", "students_ms", "worship"] : undefined,
    activeCamp
      ? {
          startDate: activeCamp.start_date,
          endDate: activeCamp.end_date,
        }
      : undefined,
  );
  const campEvents = useMemo(
    () =>
      events
        .filter((event) => event.camp_instance_id === activeCamp?.id)
        .sort((a, b) => `${a.event_date} ${a.start_time || ""}`.localeCompare(`${b.event_date} ${b.start_time || ""}`)),
    [activeCamp?.id, events],
  );

  const campSchedule = useMemo(
    () =>
      teamSchedule
        .filter((entry) => normalizeSessionSetMinistryType(entry.ministry_type) === "student_camp")
        .sort((a, b) => `${a.schedule_date} ${a.time_of_day || ""}`.localeCompare(`${b.schedule_date} ${b.time_of_day || ""}`)),
    [teamSchedule],
  );

  if (!isStudentResourceAppKey(resourceAppKey)) {
    return <Navigate to="/" replace />;
  }

  if (campLoading) {
    return (
      <div className="container flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!activeCamp) {
    return (
      <div className="container max-w-4xl py-8">
        <Card>
          <CardHeader>
            <CardTitle>Camp Mode is not active</CardTitle>
            <CardDescription>
              A student pastor can activate Camp Mode from Admin Tools when camp is ready.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="-mx-4 -my-6 min-h-[calc(100dvh-3.5rem)] overflow-x-hidden bg-background sm:mx-0 sm:my-0 sm:min-h-0">
      <section className="overflow-hidden border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,0.25),transparent_34%),linear-gradient(135deg,rgba(20,29,35,0.98),rgba(10,15,19,0.98))] px-5 py-7 sm:rounded-[28px] sm:border sm:p-8 sm:shadow-[0_24px_70px_rgba(0,0,0,0.30)]">
        <div className="space-y-5">
          <div className="space-y-4">
            <Badge className="w-fit gap-2 rounded-full px-3 py-1">
              <Tent className="h-4 w-4" />
              Camp Mode
            </Badge>
            <div>
              <h1 className="font-display text-4xl font-black uppercase tracking-[0.12em] text-foreground sm:text-6xl">
                {activeCamp.name}
              </h1>
              <p className="mt-3 text-muted-foreground">{formatDateRange(activeCamp.start_date, activeCamp.end_date)}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <span>
                {activeCamp.resource_app_keys.includes("students_ms") ? "MS" : ""}
                {activeCamp.resource_app_keys.length > 1 ? " + " : ""}
                {activeCamp.resource_app_keys.includes("students_hs") ? "HS" : ""}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <MapPinned className="h-4 w-4 text-primary" />
              <span>{availableCampuses.length || "All"} participating campuses</span>
            </div>
          </div>
        </div>
      </section>

      <Tabs defaultValue="info" className="space-y-0">
        <TabsList className="grid h-auto w-full grid-cols-3 rounded-none border-b border-white/10 bg-card/95 p-1.5 backdrop-blur sm:mt-5 sm:w-fit sm:rounded-2xl sm:border">
          <TabsTrigger value="info" className="rounded-xl py-2.5">Info</TabsTrigger>
          <TabsTrigger value="schedule" className="rounded-xl py-2.5">Schedule</TabsTrigger>
          <TabsTrigger value="feed" className="rounded-xl py-2.5">Feed</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="mt-0 space-y-4 px-4 py-5 sm:px-0">
          {sectionsLoading ? (
            <Card>
              <CardContent className="flex items-center gap-3 p-6 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading camp info...
              </CardContent>
            </Card>
          ) : sections.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>No camp info yet</CardTitle>
                <CardDescription>Published camp details will appear here.</CardDescription>
              </CardHeader>
            </Card>
          ) : (
            sections.map((section) => (
              <Card key={section.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle>{section.title}</CardTitle>
                      <CardDescription className="capitalize">{section.audience}</CardDescription>
                    </div>
                    {section.link_url ? (
                      <Button asChild variant="outline" size="sm">
                        <a href={section.link_url} target="_blank" rel="noreferrer">
                          Open <ExternalLink className="ml-2 h-4 w-4" />
                        </a>
                      </Button>
                    ) : null}
                  </div>
                </CardHeader>
                {section.body ? (
                  <CardContent>
                    <p className="whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{section.body}</p>
                  </CardContent>
                ) : null}
              </Card>
            ))
          )}

          {attachmentsLoading ? null : attachments.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 pt-2">
                <Paperclip className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Camp Map &amp; Files</h2>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {attachments.map((attachment) => (
                  <CampAttachmentCard key={attachment.id} attachment={attachment} />
                ))}
              </div>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="schedule" className="mt-0">
          {availableCampuses.length > 1 ? (
            <div className="border-b border-border px-4 py-4 sm:px-0">
              <Select value={selectedCampusId || ""} onValueChange={setSelectedCampusId}>
                <SelectTrigger className="w-full sm:max-w-sm">
                  <SelectValue placeholder="Choose campus" />
                </SelectTrigger>
                <SelectContent>
                  {availableCampuses.map((campus) => (
                    <SelectItem key={campus.id} value={campus.id}>{campus.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="divide-y divide-border border-b border-border bg-card/25 lg:grid lg:grid-cols-2 lg:divide-x lg:divide-y-0 sm:mt-5 sm:overflow-hidden sm:rounded-2xl sm:border">
            <section className="px-4 py-6 sm:p-6">
              <div className="mb-5">
                <h2 className="flex items-center gap-2 text-xl font-semibold">
                  <CalendarDays className="h-5 w-5 text-primary" />
                  Camp Calendar
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">Events linked to this camp.</p>
              </div>
              <div className="divide-y divide-border">
                {eventsLoading ? (
                  <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading events...
                  </div>
                ) : campEvents.length === 0 ? (
                  <p className="py-4 text-sm text-muted-foreground">No camp events linked yet.</p>
                ) : (
                  campEvents.map((event) => (
                    <div key={event.id} className="py-4 first:pt-0 last:pb-0">
                      <p className="font-medium">{event.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {format(new Date(`${event.event_date}T00:00:00`), "EEE, MMM d")} • {timeLabel(event.start_time, event.end_time)}
                      </p>
                      {event.description ? (
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">{event.description}</p>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="px-4 py-6 sm:p-6">
              <div className="mb-5">
                <h2 className="flex items-center gap-2 text-xl font-semibold">
                  <Tent className="h-5 w-5 text-primary" />
                  Service Schedule
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selectedCampus?.name || "Camp"} student camp team schedule.
                </p>
              </div>
              <div className="divide-y divide-border">
                {campSchedule.length === 0 ? (
                  <p className="py-4 text-sm text-muted-foreground">No student camp team schedule rows found yet.</p>
                ) : (
                  campSchedule.map((entry) => (
                    <div key={entry.id} className="py-4 first:pt-0 last:pb-0">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{entry.worship_teams?.name || "Scheduled Team"}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {format(new Date(`${entry.schedule_date}T00:00:00`), "EEE, MMM d")}
                            {entry.time_of_day ? ` • ${entry.time_of_day}` : ""}
                          </p>
                        </div>
                        <Badge variant="outline">{entry.resource_app_key?.replace("students_", "").toUpperCase() || "Worship"}</Badge>
                      </div>
                      {entry.notes ? <p className="mt-2 text-sm text-muted-foreground">{entry.notes}</p> : null}
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </TabsContent>

        <TabsContent value="feed" className="mt-0">
          <Feed
            campInstanceId={activeCamp.id}
            heading="CAMP FEED"
            composerDescription="Share camp encouragement, reminders, scripture, or media with everyone in Camp Mode."
            emptyAdminMessage="Publish the first Camp Feed post."
            emptyReaderMessage="Camp Feed posts from leaders will appear here."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
