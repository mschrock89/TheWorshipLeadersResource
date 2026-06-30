import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { format } from "date-fns";
import { CalendarDays, ExternalLink, Loader2, MapPinned, MessageCircle, Tent, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { MessageInput } from "@/components/chat/MessageInput";
import { useAuth } from "@/hooks/useAuth";
import { useCampuses, useUserCampuses } from "@/hooks/useCampuses";
import { useActiveCampMode, useCampContentSections } from "@/hooks/useCampMode";
import { useChatMessages } from "@/hooks/useChatMessages";
import { useEvents } from "@/hooks/useEvents";
import { useTeamSchedule } from "@/hooks/useTeamSchedule";
import { useLastReadAt, useUnreadMessages } from "@/hooks/useUnreadMessages";
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

export default function CampMode() {
  const resourceAppKey = getCurrentResourceAppKey();
  const { user, isLeader } = useAuth();
  const { data: activeCamp, isLoading: campLoading } = useActiveCampMode();
  const { data: sections = [], isLoading: sectionsLoading } = useCampContentSections(activeCamp?.id);
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
  );
  const { markAsRead, setViewingChat } = useUnreadMessages(activeCamp?.id);
  const { lastReadAt } = useLastReadAt(selectedCampusId, "student_camp", activeCamp?.id);
  const {
    messages,
    isLoading: chatLoading,
    sendMessage,
    editMessage,
    deleteMessage,
    toggleReaction,
    currentUserId,
  } = useChatMessages(selectedCampusId, "student_camp", activeCamp?.id);

  useEffect(() => {
    if (!activeCamp?.id || !selectedCampusId) return;
    setViewingChat(selectedCampusId, "student_camp");
    markAsRead(selectedCampusId, "student_camp");
    return () => setViewingChat(null, null);
  }, [activeCamp?.id, markAsRead, selectedCampusId, setViewingChat]);

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
    <div className="container max-w-6xl space-y-6 py-6">
      <section className="overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,0.25),transparent_34%),linear-gradient(135deg,rgba(20,29,35,0.98),rgba(10,15,19,0.98))] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.30)] sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
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

          <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[360px]">
            <Card className="border-white/10 bg-white/5">
              <CardContent className="flex items-center gap-3 p-4">
                <Users className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-medium">Shared Apps</p>
                  <p className="text-xs text-muted-foreground">
                    {activeCamp.resource_app_keys.includes("students_ms") ? "MS" : ""}
                    {activeCamp.resource_app_keys.length > 1 ? " + " : ""}
                    {activeCamp.resource_app_keys.includes("students_hs") ? "HS" : ""}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-white/10 bg-white/5">
              <CardContent className="flex items-center gap-3 p-4">
                <MapPinned className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-medium">Campuses</p>
                  <p className="text-xs text-muted-foreground">{availableCampuses.length || "All"} participating</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <Tabs defaultValue="info" className="space-y-5">
        <TabsList className="h-auto flex-wrap justify-start gap-2 rounded-2xl border border-white/10 bg-card/80 p-2">
          <TabsTrigger value="info">Info</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="feed">Feed</TabsTrigger>
          <TabsTrigger value="chat">Chat</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="space-y-4">
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
        </TabsContent>

        <TabsContent value="schedule" className="space-y-4">
          {availableCampuses.length > 1 ? (
            <div className="max-w-sm">
              <Select value={selectedCampusId || ""} onValueChange={setSelectedCampusId}>
                <SelectTrigger>
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

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarDays className="h-5 w-5 text-primary" />
                  Camp Calendar
                </CardTitle>
                <CardDescription>Events linked to this camp instance.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {eventsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading events...
                  </div>
                ) : campEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No camp events linked yet.</p>
                ) : (
                  campEvents.map((event) => (
                    <div key={event.id} className="rounded-xl border border-border p-4">
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
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Tent className="h-5 w-5 text-primary" />
                  Service Schedule
                </CardTitle>
                <CardDescription>{selectedCampus?.name || "Camp"} student camp team schedule.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {campSchedule.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No student camp team schedule rows found yet.</p>
                ) : (
                  campSchedule.map((entry) => (
                    <div key={entry.id} className="rounded-xl border border-border p-4">
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
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="feed">
          <Feed
            campInstanceId={activeCamp.id}
            heading="CAMP FEED"
            composerDescription="Share camp encouragement, reminders, scripture, or media with everyone in Camp Mode."
            emptyAdminMessage="Publish the first Camp Feed post."
            emptyReaderMessage="Camp Feed posts from leaders will appear here."
          />
        </TabsContent>

        <TabsContent value="chat" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <MessageCircle className="h-5 w-5 text-primary" />
                    Camp Chat
                  </CardTitle>
                  <CardDescription>Shared chat for this camp across MS and HS.</CardDescription>
                </div>
                {availableCampuses.length > 1 ? (
                  <Select value={selectedCampusId || ""} onValueChange={setSelectedCampusId}>
                    <SelectTrigger className="sm:w-[240px]">
                      <SelectValue placeholder="Choose campus" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableCampuses.map((campus) => (
                        <SelectItem key={campus.id} value={campus.id}>{campus.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="min-h-[360px] space-y-3 rounded-2xl border border-border bg-muted/20 p-4">
                {chatLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading camp chat...
                  </div>
                ) : messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No camp chat messages yet.</p>
                ) : (
                  messages.map((message, index) => (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      isOwnMessage={message.user_id === currentUserId}
                      currentUserId={currentUserId}
                      showHeader={index === 0 || messages[index - 1]?.user_id !== message.user_id}
                      onToggleReaction={toggleReaction}
                      onEditMessage={editMessage}
                      onDeleteMessage={deleteMessage}
                    />
                  ))
                )}
                {lastReadAt ? (
                  <p className="pt-2 text-center text-xs text-muted-foreground">
                    Last read {format(new Date(lastReadAt), "MMM d, h:mm a")}
                  </p>
                ) : null}
              </div>

              <MessageInput
                onSendMessage={sendMessage}
                campusName={selectedCampus?.name || "Camp Chat"}
                campusId={selectedCampusId}
                ministryType="student_camp"
              />
              {!isLeader ? (
                <p className="text-xs text-muted-foreground">
                  Leaders may use this for shared camp coordination and announcements.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
