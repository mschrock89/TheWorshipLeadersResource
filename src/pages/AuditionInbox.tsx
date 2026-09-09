import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { format, addDays } from "date-fns";
import {
  ArrowLeft,
  CalendarClock,
  Inbox,
  Loader2,
  Mail,
  RefreshCw,
  Send,
  UserPlus,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCampuses, useUserCampuses } from "@/hooks/useCampuses";
import { useUpsertAudition, type AuditionStage, type AuditionTrack } from "@/hooks/useAuditions";
import {
  useAuditionInboxMessages,
  useAuditionInboxReplies,
  useConnectGmailInbox,
  useDisconnectGmailInbox,
  useGmailInboxConnection,
  useMatchedInboxProfiles,
  useSendInboxReply,
  useSyncGmailInbox,
  useUpdateInboxMessage,
  type AuditionInboxMessage,
} from "@/hooks/useAuditionInbox";
import { defaultInboxReply, splitDisplayName, type AuditionInboxStatus } from "@/lib/auditionInbox";
import { getAppUrl } from "@/lib/resourceApps";
import { isCurrentStudentResourceApp } from "@/lib/resourceApp";
import { CreateAuditionCandidateDialog } from "@/components/team/CreateAuditionCandidateDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

type InboxTab = "review" | "replied" | "scheduled" | "dismissed" | "all";

function formatTime(time: string | null): string {
  if (!time) return "";
  const [hours, minutes] = time.split(":");
  const hour = Number(hours);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${suffix}`;
}

function statusLabel(status: AuditionInboxStatus) {
  switch (status) {
    case "new":
      return "New";
    case "reviewed":
      return "Reviewed";
    case "replied":
      return "Replied";
    case "scheduled":
      return "Scheduled";
    case "dismissed":
      return "Dismissed";
  }
}

function matchesTab(status: AuditionInboxStatus, tab: InboxTab) {
  if (tab === "all") return true;
  if (tab === "review") return status === "new" || status === "reviewed";
  return status === tab;
}

export default function AuditionInbox() {
  const { user, canManageTeam, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const isStudentApp = isCurrentStudentResourceApp();
  const pageLabel = isStudentApp ? "On Boarding Inbox" : "Audition Inbox";
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: connection, isLoading: connectionLoading } = useGmailInboxConnection(user?.id);
  const { data: messages = [], isLoading: messagesLoading } = useAuditionInboxMessages(user?.id);
  const connectGmail = useConnectGmailInbox();
  const disconnectGmail = useDisconnectGmailInbox(user?.id);
  const syncInbox = useSyncGmailInbox(user?.id);
  const sendReply = useSendInboxReply(user?.id);
  const updateMessage = useUpdateInboxMessage(user?.id);
  const upsertAudition = useUpsertAudition();
  const { data: campuses = [] } = useCampuses();
  const { data: assignedCampusRows = [] } = useUserCampuses(user?.id);

  const [tab, setTab] = useState<InboxTab>("review");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [candidateDialogOpen, setCandidateDialogOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleCandidateId, setScheduleCandidateId] = useState<string | null>(null);
  const [auditionDate, setAuditionDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [stage, setStage] = useState<AuditionStage>("pre_audition");
  const [track, setTrack] = useState<AuditionTrack>("vocalist");
  const [campusId, setCampusId] = useState("");
  const [notes, setNotes] = useState("");

  const assignedCampusIds = useMemo(
    () => Array.from(new Set(assignedCampusRows.map((row) => row.campus_id))),
    [assignedCampusRows],
  );
  const availableCampuses = useMemo(
    () => campuses.filter((campus) => assignedCampusIds.includes(campus.id)),
    [campuses, assignedCampusIds],
  );

  const filtered = useMemo(
    () => messages.filter((message) => matchesTab(message.status, tab)),
    [messages, tab],
  );
  const selected = filtered.find((message) => message.id === selectedId) || filtered[0] || null;
  const { data: replies = [] } = useAuditionInboxReplies(selected?.id || null);
  const profileMap = useMatchedInboxProfiles(messages.map((message) => message.from_email));
  const matchedProfile = selected ? profileMap.data?.[selected.from_email.toLowerCase()] : undefined;
  const nameParts = selected ? splitDisplayName(selected.from_name, selected.from_email) : { firstName: "", lastName: "" };

  const counts = useMemo(
    () => ({
      review: messages.filter((message) => message.status === "new" || message.status === "reviewed").length,
      replied: messages.filter((message) => message.status === "replied").length,
      scheduled: messages.filter((message) => message.status === "scheduled").length,
      dismissed: messages.filter((message) => message.status === "dismissed").length,
      all: messages.length,
    }),
    [messages],
  );

  useEffect(() => {
    if (availableCampuses.length === 0) return;
    if (!campusId || !availableCampuses.some((campus) => campus.id === campusId)) {
      setCampusId(availableCampuses[0].id);
    }
  }, [availableCampuses, campusId]);

  useEffect(() => {
    const connected = searchParams.get("gmail_connected") === "1";
    const oauthError = searchParams.get("error");
    if (!connected && !oauthError) return;

    const next = new URLSearchParams(searchParams);
    next.delete("gmail_connected");
    next.delete("error");
    setSearchParams(next, { replace: true });

    if (oauthError) {
      toast({
        title: "Gmail connection failed",
        description: oauthError.replace(/_/g, " "),
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Gmail connected", description: "Syncing interest emails now." });
    syncInbox.mutate();
  }, [searchParams, setSearchParams, syncInbox, toast]);

  useEffect(() => {
    if (!selected) {
      setReplyBody("");
      return;
    }
    setReplyBody(defaultInboxReply({ firstName: nameParts.firstName, isStudentApp }));
    if (selected.status === "new") {
      updateMessage.mutate({ id: selected.id, status: "reviewed" });
    }
    // Only auto-mark when the selected message changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  if (authLoading) return null;
  if (!user) return <Navigate to="/auth" replace />;
  if (!canManageTeam) return <Navigate to="/dashboard" replace />;

  const openSchedule = (candidateId: string) => {
    setScheduleCandidateId(candidateId);
    setStage("pre_audition");
    setTrack("vocalist");
    setAuditionDate(format(addDays(new Date(), 7), "yyyy-MM-dd"));
    setStartTime("");
    setEndTime("");
    setNotes(selected?.subject || "");
    setScheduleOpen(true);
  };

  const saveSchedule = async () => {
    if (!scheduleCandidateId || !auditionDate || !campusId || !selected) return;
    const saved = await upsertAudition.mutateAsync({
      candidate_id: scheduleCandidateId,
      campus_id: campusId,
      audition_date: auditionDate,
      start_time: startTime || null,
      end_time: endTime || null,
      stage,
      candidate_track: track,
      notes: notes || null,
      status: "scheduled",
    });
    await updateMessage.mutateAsync({
      id: selected.id,
      status: "scheduled",
      candidate_user_id: scheduleCandidateId,
      audition_id: saved.id,
    });
    const dateLabel = format(new Date(`${auditionDate}T00:00:00`), "EEE, MMM d");
    setReplyBody(
      defaultInboxReply({
        firstName: nameParts.firstName,
        isStudentApp,
        scheduled: {
          dateLabel,
          timeLabel: formatTime(startTime || null),
          stageLabel: isStudentApp
            ? stage === "pre_audition"
              ? "Pre-On Boarding"
              : "On Boarding"
            : stage === "pre_audition"
              ? "Pre-Audition"
              : "Audition",
        },
      }),
    );
    setScheduleOpen(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2 text-muted-foreground">
          <Link to="/auditions">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {isStudentApp ? "On Boarding" : "Auditions"}
          </Link>
        </Button>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Inbox className="h-6 w-6" />
          {pageLabel}
        </h1>
        <p className="text-sm text-muted-foreground">
          Connect Gmail and we will pull in emails about auditions, the worship team, or serving so you can reply, add a candidate, and schedule from one place.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Gmail</CardTitle>
          <CardDescription>
            Read-only scan plus send-as-you for replies. This is separate from Google Calendar. Enable the Gmail API on the same Google Cloud OAuth client and add the Gmail read/send scopes on the consent screen.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            {connectionLoading ? (
              <p className="text-muted-foreground">Checking connection...</p>
            ) : connection ? (
              <div className="space-y-1">
                <p>
                  Connected as <span className="font-medium">{connection.email_address}</span>
                </p>
                <p className="text-muted-foreground">
                  {connection.last_synced_at
                    ? `Last synced ${format(new Date(connection.last_synced_at), "MMM d, yyyy h:mm a")}`
                    : "Not synced yet"}
                </p>
                {connection.last_sync_error && (
                  <p className="text-destructive">{connection.last_sync_error}</p>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">Gmail is not connected yet.</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {connection ? (
              <>
                <Button onClick={() => syncInbox.mutate()} disabled={syncInbox.isPending}>
                  {syncInbox.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Sync now
                </Button>
                <Button variant="outline" onClick={() => disconnectGmail.mutate()} disabled={disconnectGmail.isPending}>
                  Disconnect
                </Button>
              </>
            ) : (
              <Button onClick={() => connectGmail.mutate(getAppUrl("/audition-inbox"))} disabled={connectGmail.isPending}>
                {connectGmail.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                Connect Gmail
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {!connection ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Connect the Gmail inbox where interest emails arrive. We will sort messages that mention auditions, the worship team, or serving, and drop them here for review.
          </CardContent>
        </Card>
      ) : (
        <>
          <Tabs value={tab} onValueChange={(value) => setTab(value as InboxTab)}>
            <TabsList className="flex flex-wrap h-auto gap-1">
              <TabsTrigger value="review">Needs review ({counts.review})</TabsTrigger>
              <TabsTrigger value="replied">Replied ({counts.replied})</TabsTrigger>
              <TabsTrigger value="scheduled">Scheduled ({counts.scheduled})</TabsTrigger>
              <TabsTrigger value="dismissed">Dismissed ({counts.dismissed})</TabsTrigger>
              <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="grid gap-4 lg:grid-cols-[minmax(280px,360px)_1fr]">
            <Card className="overflow-hidden">
              <ScrollArea className="h-[70vh]">
                {messagesLoading ? (
                  <p className="p-4 text-sm text-muted-foreground">Loading inbox...</p>
                ) : filtered.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">No emails in this view.</p>
                ) : (
                  <div className="divide-y">
                    {filtered.map((message) => (
                      <button
                        key={message.id}
                        type="button"
                        onClick={() => setSelectedId(message.id)}
                        className={`w-full p-4 text-left transition-colors ${
                          selected?.id === message.id ? "bg-muted" : "hover:bg-muted/50"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium leading-tight">
                            {message.from_name || message.from_email}
                          </p>
                          <Badge variant={message.status === "new" ? "default" : "outline"} className="shrink-0">
                            {statusLabel(message.status)}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm line-clamp-1">{message.subject || "(no subject)"}</p>
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{message.snippet}</p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {format(new Date(message.received_at), "MMM d, yyyy h:mm a")}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </Card>

            {selected ? (
              <MessageDetail
                message={selected}
                replies={replies}
                matchedProfile={matchedProfile}
                nameParts={nameParts}
                isStudentApp={isStudentApp}
                replyBody={replyBody}
                setReplyBody={setReplyBody}
                sending={sendReply.isPending}
                onSend={() => sendReply.mutate({ messageId: selected.id, body: replyBody })}
                onDismiss={() => updateMessage.mutate({ id: selected.id, status: "dismissed" })}
                onAddCandidate={() => setCandidateDialogOpen(true)}
                onSchedule={() => {
                  if (matchedProfile?.id) {
                    openSchedule(matchedProfile.id);
                    return;
                  }
                  if (selected.candidate_user_id) {
                    openSchedule(selected.candidate_user_id);
                    return;
                  }
                  setCandidateDialogOpen(true);
                }}
              />
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-sm text-muted-foreground">
                  Select an email to review it.
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}

      <CreateAuditionCandidateDialog
        open={candidateDialogOpen}
        onOpenChange={setCandidateDialogOpen}
        campuses={availableCampuses}
        initialFirstName={nameParts.firstName}
        initialLastName={nameParts.lastName}
        initialEmail={selected?.from_email || ""}
        onCreated={(result) => {
          if (selected && result?.userId) {
            updateMessage.mutate({
              id: selected.id,
              candidate_user_id: result.userId,
            });
            openSchedule(result.userId);
          }
        }}
      />

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isStudentApp ? "Schedule On Boarding" : "Schedule Audition"}</DialogTitle>
            <DialogDescription>
              {selected?.from_name || selected?.from_email} • {availableCampuses.find((campus) => campus.id === campusId)?.name || "Campus"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={auditionDate} onChange={(event) => setAuditionDate(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Stage</Label>
              <Select value={stage} onValueChange={(value) => setStage(value as AuditionStage)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pre_audition">{isStudentApp ? "Pre-On Boarding" : "Pre-Audition"}</SelectItem>
                  <SelectItem value="audition">{isStudentApp ? "On Boarding" : "Audition"}</SelectItem>
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
              <Select value={campusId} onValueChange={setCampusId}>
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
              <Input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>End Time</Label>
              <Input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Input value={notes} onChange={(event) => setNotes(event.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveSchedule} disabled={upsertAudition.isPending || !auditionDate || !campusId}>
              {upsertAudition.isPending ? "Saving..." : "Save Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MessageDetail({
  message,
  replies,
  matchedProfile,
  nameParts,
  isStudentApp,
  replyBody,
  setReplyBody,
  sending,
  onSend,
  onDismiss,
  onAddCandidate,
  onSchedule,
}: {
  message: AuditionInboxMessage;
  replies: Array<{ id: string; body_text: string; sent_at: string }>;
  matchedProfile?: { id: string; full_name: string | null; isCandidate: boolean };
  nameParts: { firstName: string; lastName: string };
  isStudentApp: boolean;
  replyBody: string;
  setReplyBody: (value: string) => void;
  sending: boolean;
  onSend: () => void;
  onDismiss: () => void;
  onAddCandidate: () => void;
  onSchedule: () => void;
}) {
  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">{message.subject || "(no subject)"}</CardTitle>
            <CardDescription>
              {message.from_name ? `${message.from_name} <${message.from_email}>` : message.from_email}
              {" · "}
              {format(new Date(message.received_at), "EEE, MMM d, yyyy h:mm a")}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {matchedProfile ? (
              <Button size="sm" onClick={onSchedule}>
                <CalendarClock className="mr-2 h-4 w-4" />
                Schedule
              </Button>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={onAddCandidate}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Add candidate
                </Button>
                <Button size="sm" onClick={onSchedule}>
                  <CalendarClock className="mr-2 h-4 w-4" />
                  Add & schedule
                </Button>
              </>
            )}
            <Button size="sm" variant="ghost" onClick={onDismiss}>
              Dismiss
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {message.matched_keywords.map((keyword) => (
            <Badge key={keyword} variant="secondary">
              {keyword}
            </Badge>
          ))}
          {matchedProfile && (
            <Badge variant="outline">
              {matchedProfile.isCandidate ? "Existing candidate" : `Existing user: ${matchedProfile.full_name || "profile"}`}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="whitespace-pre-wrap rounded-lg border bg-muted/30 p-4 text-sm leading-relaxed">
          {message.body_text || message.snippet || "No message body was available."}
        </div>

        {replies.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium">Sent replies</h3>
            {replies.map((reply) => (
              <div key={reply.id} className="rounded-lg border p-3 text-sm">
                <p className="mb-2 text-xs text-muted-foreground">
                  {format(new Date(reply.sent_at), "MMM d, yyyy h:mm a")}
                </p>
                <p className="whitespace-pre-wrap">{reply.body_text}</p>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="inbox-reply">Reply from your Gmail</Label>
          <Textarea
            id="inbox-reply"
            value={replyBody}
            onChange={(event) => setReplyBody(event.target.value)}
            rows={10}
          />
          <div className="flex justify-end">
            <Button onClick={onSend} disabled={sending || !replyBody.trim()}>
              {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Send reply
            </Button>
          </div>
        </div>
        {!matchedProfile && (
          <p className="text-xs text-muted-foreground">
            {nameParts.firstName || "This sender"} is not a {isStudentApp ? "student account" : "candidate"} yet. Add them first, then schedule.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
