import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ArrowLeft, AudioLines, Loader2, Radio, Settings2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { CompactSelectValue } from "@/components/ui/compact-select-value";
import { MINISTRY_TYPES, SET_PLANNER_MINISTRY_OPTIONS } from "@/lib/constants";
import { cn } from "@/lib/cn";
import { isFohListenerHosting, liveChatRoomOf, liveStationLabel, readLiveStation, readTalkbackBindings, writeLiveStation, type LiveChatRoom, type LiveStation } from "@/lib/liveMode";
import { readAudioChannelCount, readAudioInterfaceId, readSmpteListens, type SmpteSource } from "@/lib/audioRouting";
import { formatSmpte, LtcDecoder, smpteSortKey } from "@/lib/smpteLtc";
import {
  buildTimecodeWindows,
  followTimecodeItem,
  matchTimecodeWindow,
  videoSlotForItem,
  type TimecodeWindow,
} from "@/lib/serviceFlowTimecode";
import { startSmpteCapture } from "@/lib/smpteCapture";
import { createInputAudioContext } from "@/lib/systemAudioInputs";
import { useLiveModeAccess } from "@/hooks/useCanOpenLiveMode";
import { useLiveSession } from "@/hooks/useLiveSession";
import { useServiceFlow, useServiceFlowItems } from "@/hooks/useServiceFlow";
import { useCampuses } from "@/hooks/useCampuses";
import { useScheduledTeamForDate } from "@/hooks/useScheduledTeamForDate";
import { useTeamRosterForDate } from "@/hooks/useTeamRosterForDate";
import { useTeachingWeekForDate } from "@/hooks/useTeachingSchedule";
import { useServiceTimeOverrides } from "@/hooks/useServiceTimeOverrides";
import {
  buildResolvedServiceFlowTitles,
  buildScheduledRoleNames,
} from "@/components/service-flow/resolveServiceFlowPlaceholders";
import { supabase } from "@/integrations/supabase/client";
import {
  buildServiceFlowClockTimes,
  clockSourceToSeconds,
  formatClockTime,
  listScheduledServiceTimes,
  localClockSeconds,
  measureServiceFlowSpan,
  normalizeClockSource,
  selectServiceTimeForLocalClock,
} from "@/components/service-flow/serviceFlowClock";
import { AudioRoutingPage, SmpteInputSelect } from "./AudioRoutingPage";
import { TalkbackBoard, TalkbackChat } from "./TalkbackBoard";
import { TalkbackSetupSheet } from "./TalkbackSetupSheet";
import { findFlowCue, LiveServiceFlowPanel } from "./LiveServiceFlowPanel";
import { LiveNotesPanel } from "./LiveNotesPanel";

type LiveModeConsoleProps = {
  campusId: string;
  campusName: string;
  campuses: Array<{ id: string; name: string }>;
  ministryType: string;
  serviceDate: string;
  customServiceId: string | null;
  draftSetId: string | null;
  onScopeChange: (patch: { campusId?: string; ministryType?: string; serviceDate?: string }) => void;
};

type DockTab = "flow" | "chat" | "notes";

export function LiveModeConsole({
  campusId,
  campusName,
  campuses,
  ministryType,
  serviceDate,
  customServiceId,
  draftSetId,
  onScopeChange,
}: LiveModeConsoleProps) {
  const queryClient = useQueryClient();
  const access = useLiveModeAccess(campusId);
  const videoOnly = access.audience === "video";
  const live = useLiveSession({
    campusId,
    ministryType,
    serviceDate,
    customServiceId,
    draftSetId,
    enabled: access.canOpen && !access.isLoading,
    talkback: !videoOnly,
    notes: !videoOnly,
    chatRoom: videoOnly ? "video" : null,
  });
  const [station, setStation] = useState<LiveStation>(() => readLiveStation());
  const [listening, setListening] = useState(false);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [routingOpen, setRoutingOpen] = useState(false);
  const [bindingRevision, setBindingRevision] = useState(0);
  const [followTimecode, setFollowTimecode] = useState(true);
  const [smpteStatus, setSmpteStatus] = useState<"idle" | "listening" | "locked" | "error">("idle");
  const [smpteLabel, setSmpteLabel] = useState<string | null>(null);
  const [tab, setTab] = useState<DockTab>("flow");
  const [chatRoom, setChatRoom] = useState<LiveChatRoom>("production");
  const [now, setNow] = useState(() => new Date());

  const flowDraftId = draftSetId || live.session?.draft_set_id || null;
  const { data: flow, isLoading: flowLoading } = useServiceFlow(
    campusId,
    ministryType,
    serviceDate,
    flowDraftId,
    customServiceId,
  );
  const { data: items = [], isLoading: itemsLoading } = useServiceFlowItems(flow?.id || null);
  const rosterDate = useMemo(() => {
    const [year, month, day] = serviceDate.split("-").map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
  }, [serviceDate]);
  const { data: teachingWeek } = useTeachingWeekForDate(campusId, ministryType, serviceDate);
  const { data: scheduledTeam } = useScheduledTeamForDate(rosterDate, campusId, ministryType);
  const { data: scheduledRoster = [] } = useTeamRosterForDate(
    rosterDate,
    scheduledTeam?.teamId,
    ministryType,
    campusId,
  );
  const { data: speakerTeam } = useScheduledTeamForDate(rosterDate, campusId, "speaker");
  const { data: speakerRoster = [] } = useTeamRosterForDate(
    rosterDate,
    speakerTeam?.teamId,
    "speaker",
    campusId,
  );
  const combinedScheduledRoster = useMemo(() => {
    if (ministryType === "speaker" || speakerRoster.length === 0) return scheduledRoster;
    const seen = new Set(
      scheduledRoster.map((member) => member.userId || member.memberName.toLowerCase()),
    );
    return [
      ...scheduledRoster,
      ...speakerRoster.filter((member) => {
        const key = member.userId || member.memberName.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }),
    ];
  }, [ministryType, scheduledRoster, speakerRoster]);
  const scheduledRoleNames = useMemo(
    () => buildScheduledRoleNames(combinedScheduledRoster),
    [combinedScheduledRoster],
  );
  const resolvedTitles = useMemo(
    () =>
      buildResolvedServiceFlowTitles(items, scheduledRoleNames, {
        announcerName: teachingWeek?.announcer_name,
        teacherName: teachingWeek?.teacher_name,
      }),
    [items, scheduledRoleNames, teachingWeek?.announcer_name, teachingWeek?.teacher_name],
  );
  const { data: campusesWithTimes = [] } = useCampuses();
  const { data: serviceTimeOverrides = [] } = useServiceTimeOverrides({
    campusId,
    startDate: serviceDate,
    endDate: serviceDate,
  });
  const { data: customServiceStartTime = null } = useQuery({
    queryKey: ["custom-service-start-time", customServiceId],
    enabled: !!customServiceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custom_services")
        .select("start_time")
        .eq("id", customServiceId!)
        .maybeSingle();
      if (error) throw error;
      return normalizeClockSource(data?.start_time) || null;
    },
  });
  const scheduledServiceTimes = useMemo(
    () =>
      listScheduledServiceTimes({
        customServiceStartTime,
        serviceDate,
        ministryType,
        campusId,
        campus: campusesWithTimes.find((campus) => campus.id === campusId),
        overrides: serviceTimeOverrides,
      }),
    [campusesWithTimes, campusId, customServiceStartTime, ministryType, serviceDate, serviceTimeOverrides],
  );
  const flowSpan = useMemo(() => measureServiceFlowSpan(items), [items]);
  const startTime = useMemo(() => {
    const saved = normalizeClockSource(flow?.start_time);
    const viewingToday = serviceDate === localDateIso(now);
    if (scheduledServiceTimes.length > 1 && viewingToday) {
      return selectServiceTimeForLocalClock(scheduledServiceTimes, localClockSeconds(now), flowSpan);
    }
    if (saved) return saved;
    return scheduledServiceTimes[0] || null;
  }, [flow?.start_time, flowSpan, now, scheduledServiceTimes, serviceDate]);
  const serviceTimeLabel = startTime
    ? formatClockTime(clockSourceToSeconds(startTime) ?? 0)
    : null;
  const localTimeLabel = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
  const clockTimes = useMemo(
    () => buildServiceFlowClockTimes(items, startTime),
    [items, startTime],
  );
  const cue = findFlowCue(items, live.session?.current_item_id || null, resolvedTitles);
  const ministryLabel =
    MINISTRY_TYPES.find((option) => option.value === ministryType)?.label || "Service";
  const serviceLabel = format(parseISO(`${serviceDate}T00:00:00`), "EEE, MMM d");

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: ["service-flow"] });
      void queryClient.invalidateQueries({ queryKey: ["service-flow-items"] });
      void queryClient.invalidateQueries({ queryKey: ["service-time-overrides"] });
      void queryClient.invalidateQueries({ queryKey: ["campuses"] });
      void queryClient.invalidateQueries({ queryKey: ["custom-service-start-time"] });
      void queryClient.invalidateQueries({ queryKey: ["team-roster-for-date"] });
      void queryClient.invalidateQueries({ queryKey: ["scheduled-team-for-date"] });
      void queryClient.invalidateQueries({ queryKey: ["teaching-week"] });
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [queryClient]);

  const listeningRef = useRef(listening);
  listeningRef.current = listening;
  const audioContextRef = useRef(audioContext);
  audioContextRef.current = audioContext;

  const releaseListener = live.releaseListener;
  const heartbeatListener = live.heartbeatListener;

  const stopListening = () => {
    setListening(false);
    void audioContextRef.current?.close();
    setAudioContext(null);
    void releaseListener();
  };

  useEffect(() => {
    if (station === "foh" || !listeningRef.current) return;
    setListening(false);
    void audioContextRef.current?.close();
    setAudioContext(null);
    void releaseListener();
  }, [releaseListener, station]);

  useEffect(() => {
    if (!listening || station !== "foh") return;
    const timer = window.setInterval(() => {
      void heartbeatListener();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [heartbeatListener, listening, station]);

  const sawOwnClaim = useRef(false);
  useEffect(() => {
    if (!listening) {
      sawOwnClaim.current = false;
      return;
    }
    const listenerId = live.session?.listener_client_id;
    if (listenerId === live.clientId) {
      sawOwnClaim.current = true;
      return;
    }
    if (sawOwnClaim.current && listenerId) {
      sawOwnClaim.current = false;
      setListening(false);
      void audioContext?.close();
      setAudioContext(null);
    }
  }, [audioContext, listening, live.clientId, live.session?.listener_client_id]);

  const timecodeTrack = useRef({
    follow: false,
    windows: [] as TimecodeWindow[],
    fps: 30,
    currentId: null as string | null,
    suppressItemId: null as string | null,
    lastSend: 0,
    lastUi: 0,
    lastFrameAt: 0,
    lastBySource: { propresenter: 0, playback: 0 } as Record<SmpteSource, number>,
    labels: { propresenter: null, playback: null } as Record<SmpteSource, string | null>,
    setItem: (_itemId: string) => {},
    publish: (_cue: { itemId: string | null; progress: number; label: string; fps: number; at: number }) => {},
  });
  const flowItemsRef = useRef(items);
  flowItemsRef.current = items;
  timecodeTrack.current.follow = followTimecode && station === "foh";
  timecodeTrack.current.windows = buildTimecodeWindows(items, timecodeTrack.current.fps);
  timecodeTrack.current.currentId = live.session?.current_item_id || null;
  timecodeTrack.current.setItem = (itemId) => {
    void live.setCurrentItem(itemId);
  };
  timecodeTrack.current.publish = live.publishTimecode;
  const isTimecodeHost =
    listening &&
    station === "foh" &&
    live.session?.listener_client_id === live.clientId;

  useEffect(() => {
    if (!isTimecodeHost || !audioContext) {
      setSmpteStatus("idle");
      setSmpteLabel(null);
      return;
    }
    const listens = readSmpteListens(readTalkbackBindings());
    if (listens.length === 0) {
      setSmpteStatus("error");
      setSmpteLabel("Choose the ProPresenter and Playback SMPTE inputs.");
      return;
    }
    let active = true;
    const decoders = new Map<SmpteSource, { decoder: LtcDecoder; rate: number }>();
    setSmpteStatus("listening");
    setSmpteLabel(null);
    const paintLabels = () => {
      const labels = timecodeTrack.current.labels;
      const parts = [
        labels.propresenter ? `ProP ${labels.propresenter}` : "",
        labels.playback ? `Playback ${labels.playback}` : "",
      ].filter(Boolean);
      setSmpteLabel(parts.join(" · ") || null);
    };
    const stop = startSmpteCapture({
      audioContext,
      listens,
      onStatus: (status, message) => {
        if (!active) return;
        if (status === "error") {
          setSmpteStatus("error");
          setSmpteLabel(message || "Could not open a SMPTE input.");
          return;
        }
        setSmpteStatus((current) => (current === "locked" ? current : "listening"));
      },
      onSamples: (source, samples, sampleRate) => {
        if (!active) return;
        const existing = decoders.get(source);
        const entry = !existing || existing.rate !== sampleRate
          ? { decoder: new LtcDecoder(sampleRate), rate: sampleRate }
          : existing;
        if (entry !== existing) decoders.set(source, entry);
        const stamp = entry.decoder.push(samples);
        if (!stamp) return;
        const state = timecodeTrack.current;
        const nowMs = performance.now();
        state.lastFrameAt = nowMs;
        state.lastBySource[source] = nowMs;
        if (stamp.fps !== state.fps) {
          state.fps = stamp.fps;
          state.windows = buildTimecodeWindows(flowItemsRef.current, stamp.fps);
        }
        const key = smpteSortKey(stamp, stamp.fps);
        const scoped = state.windows.filter((window) => window.source === source);
        const match = matchTimecodeWindow(scoped, key);
        const decision = state.follow
          ? followTimecodeItem(flowItemsRef.current, state.windows, state, key, stamp.fps, source)
          : null;
        if (decision) state.suppressItemId = decision.suppressItemId;
        const label = formatSmpte(stamp);
        state.labels[source] = label;
        const itemChanged = Boolean(decision?.changed && decision.itemId);
        if (itemChanged && decision?.itemId) {
          state.currentId = decision.itemId;
          state.setItem(decision.itemId);
        }
        if (nowMs - state.lastUi > 80) {
          state.lastUi = nowMs;
          setSmpteStatus("locked");
          paintLabels();
        }
        if (state.follow && (itemChanged || nowMs - state.lastSend > 200)) {
          state.lastSend = nowMs;
          state.publish({
            itemId: match?.itemId ?? null,
            progress: match?.progress ?? 0,
            label,
            fps: stamp.fps,
            at: Date.now(),
          });
        }
      },
    });
    const watch = window.setInterval(() => {
      const state = timecodeTrack.current;
      if (!active || !state.lastFrameAt) return;
      const nowMs = performance.now();
      let cleared = false;
      for (const source of ["propresenter", "playback"] as const) {
        if (!state.labels[source] || nowMs - state.lastBySource[source] <= 1500) continue;
        state.labels[source] = null;
        cleared = true;
      }
      if (cleared) paintLabels();
      if (nowMs - state.lastFrameAt > 1500) {
        setSmpteStatus((current) => (current === "locked" ? "listening" : current));
      }
    }, 400);
    return () => {
      active = false;
      window.clearInterval(watch);
      stop();
    };
  }, [audioContext, bindingRevision, isTimecodeHost]);

  const videoSlotRef = useRef<{
    itemId: string;
    nextItemId: string;
    startedAt: number;
    durationMs: number;
  } | null>(null);
  useEffect(() => {
    if (!isTimecodeHost || !followTimecode || station !== "foh") {
      videoSlotRef.current = null;
      return;
    }
    const slot = videoSlotForItem(items, live.session?.current_item_id || null);
    if (!slot) return;
    const existing = videoSlotRef.current;
    if (!existing || existing.itemId !== slot.itemId) {
      videoSlotRef.current = {
        itemId: slot.itemId,
        nextItemId: slot.nextItemId,
        startedAt: performance.now(),
        durationMs: slot.durationSeconds * 1000,
      };
    } else {
      existing.nextItemId = slot.nextItemId;
      existing.durationMs = slot.durationSeconds * 1000;
    }
    const pending = videoSlotRef.current;
    const remaining = pending.durationMs - (performance.now() - pending.startedAt);
    const timer = window.setTimeout(() => {
      const state = timecodeTrack.current;
      if (!state.follow || state.currentId !== pending.itemId) return;
      state.suppressItemId = pending.itemId;
      state.currentId = pending.nextItemId;
      state.setItem(pending.nextItemId);
    }, Math.max(0, remaining));
    return () => window.clearTimeout(timer);
  }, [followTimecode, isTimecodeHost, items, live.session?.current_item_id, station]);

  const fohHosting = isFohListenerHosting(live.session, now.getTime());

  const calendarHref = `/calendar?date=${serviceDate}&campus=${campusId}&ministry=${ministryType}`;
  const activeChatRoom: LiveChatRoom = videoOnly ? "video" : chatRoom;
  const chatMessages = live.chatMessages.filter((message) => liveChatRoomOf(message) === activeChatRoom);
  const dockTabs = (
    videoOnly
      ? [
          ["flow", "Flow"],
          ["chat", "Chat"],
        ]
      : [
          ["flow", "Flow"],
          ["chat", "Chat"],
          ["notes", "Notes"],
        ]
  ) as Array<[DockTab, string]>;

  if (access.isLoading) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!access.canOpen) {
    return (
      <StatusScreen
        title="Live is for admins, production, and video"
        body="Admins and production or video volunteers at this campus can open it."
        href={calendarHref}
      />
    );
  }

  if (live.schemaMissing) {
    return (
      <StatusScreen
        title="Live Mode needs a database update"
        body="Apply the latest migration, then reload this screen."
        href={calendarHref}
      />
    );
  }
  if (live.accessDenied) {
    return (
      <StatusScreen
        title="Live is for admins, production, and video"
        body="Admins and production or video volunteers at this campus can open it."
        href={calendarHref}
      />
    );
  }

  if (videoOnly) {
    const videoMessages = live.chatMessages.filter((message) => message.room === "video");
    return (
      <div className="fixed inset-0 z-40 flex flex-col bg-background text-foreground">
        <header className="shrink-0 border-b border-border bg-card">
          <div className="flex items-center gap-2 px-3 py-2">
            <Link to={calendarHref} aria-label="Back to calendar" className="rounded-md p-2 hover:bg-muted">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">Live</p>
          </div>
          <LiveNowTitle
            campusName={campusName}
            serviceTimeLabel={serviceTimeLabel}
            localTimeLabel={localTimeLabel}
          />
          <div className="flex gap-2 overflow-x-auto px-3 pb-2">
            {campuses.length > 1 ? (
              <Select value={campusId} onValueChange={(value) => onScopeChange({ campusId: value })}>
                <SelectTrigger className="h-9 w-40 shrink-0" aria-label={campusName || "Campus"}>
                  <CompactSelectValue label={campuses.find((campus) => campus.id === campusId)?.name || campusName} placeholder="Campus" />
                </SelectTrigger>
                <SelectContent>
                  {campuses.map((campus) => (
                    <SelectItem key={campus.id} value={campus.id}>
                      {campus.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <input
              type="date"
              value={serviceDate}
              aria-label="Service date"
              onChange={(event) => {
                if (event.target.value) onScopeChange({ serviceDate: event.target.value });
              }}
              className="h-9 shrink-0 rounded-md border border-input bg-background px-2 text-sm"
            />
            <Select value={ministryType} onValueChange={(value) => onScopeChange({ ministryType: value })}>
              <SelectTrigger className="h-9 w-44 shrink-0" aria-label={SET_PLANNER_MINISTRY_OPTIONS.find((option) => option.value === ministryType)?.label || "Service"}>
                <CompactSelectValue
                  label={SET_PLANNER_MINISTRY_OPTIONS.find((option) => option.value === ministryType)?.label}
                  placeholder="Service"
                />
              </SelectTrigger>
              <SelectContent>
                {SET_PLANNER_MINISTRY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </header>
        <div className="shrink-0 border-b border-border px-3">
          <div className="inline-flex h-12 items-center border-b-2 border-primary text-sm font-semibold">
            Video
          </div>
        </div>
        <TalkbackChat
          variant="typed"
          messages={videoMessages}
          currentUserId={live.currentUserId}
          title="Video"
          subtitle="Shared with production for this service."
          placeholder="Message video"
          onSend={(body) => {
            void live.sendChatMessage(body, "video");
          }}
        />
      </div>
    );
  }

  const timecodeCue = live.timecodeCue;
  const cueIsFresh = !!timecodeCue && now.getTime() - timecodeCue.at < 2500;
  const flowProgress = cueIsFresh && timecodeCue?.itemId === live.session?.current_item_id ? timecodeCue.progress : null;
  const hasTimecodeCues = buildTimecodeWindows(items, timecodeTrack.current.fps).length > 0;
  const timecodeHint =
    listening && station === "foh" && !hasTimecodeCues && items.some((item) => item.item_type !== "header")
      ? "Add TC 01:00:00:00 to a line note so SMPTE can move the highlight."
      : null;
  const smpteReadout =
    station === "foh" && listening
      ? smpteStatus === "locked" && smpteLabel
        ? `SMPTE ${smpteLabel}`
        : smpteStatus === "error"
          ? smpteLabel || "SMPTE input needs a check"
          : smpteStatus === "listening"
            ? "SMPTE waiting"
            : null
      : cueIsFresh && timecodeCue?.label
        ? `SMPTE ${timecodeCue.label}`
        : null;

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background text-foreground">
      <header className="shrink-0 border-b border-border bg-card">
        <div className="flex items-center gap-2 px-3 py-2">
          <Link to={calendarHref} aria-label="Back to calendar" className="rounded-md p-2 hover:bg-muted">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">Live</p>
          <div className="ml-auto flex items-center gap-2 overflow-x-auto">
            <div className="flex rounded-lg bg-muted p-0.5">
              {(["foh", "mon"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setStation(option);
                    writeLiveStation(option);
                  }}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-bold",
                    station === option ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
                  )}
                >
                  {liveStationLabel(option)}
                </button>
              ))}
            </div>
            {station === "foh" ? (
              <Button
                type="button"
                variant={listening ? "secondary" : "default"}
                className="h-10"
                onClick={() => {
                  if (listening) {
                    stopListening();
                    return;
                  }
                  const context = createInputAudioContext();
                  void context.resume();
                  setAudioContext(context);
                  setListening(true);
                  void live.claimListener();
                }}
              >
                <Radio className={cn("h-4 w-4", listening && "text-primary")} />
                {listening ? "Stop" : "Listen"}
              </Button>
            ) : (
              <div
                className={cn(
                  "inline-flex h-10 shrink-0 items-center gap-2 rounded-md border px-3 text-sm font-semibold",
                  fohHosting ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground",
                )}
                aria-live="polite"
              >
                <Radio className={cn("h-4 w-4", fohHosting && "text-primary")} />
                {fohHosting ? "Following FOH" : "Waiting for FOH"}
              </div>
            )}
            {station === "foh" ? (
              <Button
                type="button"
                variant={followTimecode ? "secondary" : "outline"}
                className="h-10"
                onClick={() => setFollowTimecode((value) => !value)}
              >
                {followTimecode ? "Following" : "Follow"}
              </Button>
            ) : null}
            {station === "foh" && !readAudioInterfaceId() ? (
              <Button type="button" variant="outline" className="h-10 shrink-0" onClick={() => setRoutingOpen(true)}>
                SMPTE inputs
              </Button>
            ) : null}
            {station === "foh" && readAudioInterfaceId()
              ? (["propresenter", "playback"] as const).map((source) => (
                  <SmpteInputSelect
                    key={source}
                    source={source}
                    channels={live.channels}
                    channelCount={readAudioChannelCount()}
                    deviceId={readAudioInterfaceId()}
                    revision={bindingRevision}
                    labeled
                    onAssigned={() => setBindingRevision((value) => value + 1)}
                    className="h-10 w-40 shrink-0"
                  />
                ))
              : null}
            <Button type="button" variant="outline" size="icon" aria-label="Audio routing" onClick={() => setRoutingOpen(true)}>
              <AudioLines className="h-4 w-4" />
            </Button>
            <Button type="button" variant="outline" size="icon" aria-label="Talkback setup" onClick={() => setSetupOpen(true)}>
              <Settings2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <LiveNowTitle
          campusName={campusName}
          serviceTimeLabel={serviceTimeLabel}
          localTimeLabel={localTimeLabel}
        />
        <div className="flex gap-2 overflow-x-auto px-3 pb-2">
          {campuses.length > 1 ? (
            <Select value={campusId} onValueChange={(value) => onScopeChange({ campusId: value })}>
              <SelectTrigger className="h-9 w-40 shrink-0" aria-label={campusName || "Campus"}>
                <CompactSelectValue label={campuses.find((campus) => campus.id === campusId)?.name || campusName} placeholder="Campus" />
              </SelectTrigger>
              <SelectContent>
                {campuses.map((campus) => (
                  <SelectItem key={campus.id} value={campus.id}>
                    {campus.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <input
            type="date"
            value={serviceDate}
            aria-label="Service date"
            onChange={(event) => {
              if (event.target.value) onScopeChange({ serviceDate: event.target.value });
            }}
            className="h-9 shrink-0 rounded-md border border-input bg-background px-2 text-sm"
          />
          <Select value={ministryType} onValueChange={(value) => onScopeChange({ ministryType: value })}>
            <SelectTrigger className="h-9 w-44 shrink-0" aria-label={SET_PLANNER_MINISTRY_OPTIONS.find((option) => option.value === ministryType)?.label || "Service"}>
              <CompactSelectValue
                label={SET_PLANNER_MINISTRY_OPTIONS.find((option) => option.value === ministryType)?.label}
                placeholder="Service"
              />
            </SelectTrigger>
            <SelectContent>
              {SET_PLANNER_MINISTRY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col landscape:flex-row">
        <section className="flex min-h-0 flex-[1.35] flex-col landscape:flex-1">
          <div className="shrink-0 border-b border-border px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {ministryLabel} · {serviceLabel}
              {station === "mon"
                ? fohHosting
                  ? " · Following FOH"
                  : ""
                : listening
                  ? " · This screen is listening"
                  : fohHosting
                    ? " · FOH is listening"
                    : ""}
            </p>
            <p className="mt-1 text-2xl font-bold leading-tight">
              {cue.currentTitle || "Cue the service flow"}
            </p>
            {cue.nextTitle ? (
              <p className="mt-1 truncate text-sm text-muted-foreground">Next · {cue.nextTitle}</p>
            ) : null}
            {smpteReadout ? (
              <p
                className={cn(
                  "mt-1 text-sm font-semibold tabular-nums",
                  smpteStatus === "error" && station === "foh" ? "text-destructive" : "text-primary",
                )}
              >
                {smpteReadout}
              </p>
            ) : null}
          </div>
          {live.isLoading ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <TalkbackBoard
              channels={live.channels}
              lines={live.lines}
              listening={listening}
              audioContext={audioContext}
              bindingRevision={bindingRevision}
              onTranscript={live.addLine}
              onOpenSetup={() => setRoutingOpen(true)}
            />
          )}
        </section>

        <section className="flex h-[42dvh] min-h-[16rem] flex-col border-t border-border landscape:h-auto landscape:min-h-0 landscape:w-[min(28rem,46%)] landscape:flex-1 landscape:border-l landscape:border-t-0">
          <div className="grid shrink-0 grid-cols-3 border-b border-border">
            {dockTabs.map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                className={cn(
                  "h-12 text-sm font-semibold",
                  tab === value ? "text-foreground" : "text-muted-foreground",
                  tab === value && "border-b-2 border-primary",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === "flow" ? (
            <LiveServiceFlowPanel
              items={items}
              titles={resolvedTitles}
              clockTimes={clockTimes}
              currentItemId={live.session?.current_item_id || null}
              progress={flowProgress}
              timecodeHint={timecodeHint}
              isLoading={flowLoading || (!!flow?.id && itemsLoading)}
              onSelect={(itemId) => {
                void live.setCurrentItem(itemId);
              }}
            />
          ) : null}
          {tab === "chat" ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex shrink-0 gap-1 border-b border-border px-3 py-2">
                  {(["production", "video"] as const).map((room) => (
                    <button
                      key={room}
                      type="button"
                      onClick={() => setChatRoom(room)}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-sm font-semibold",
                        chatRoom === room ? "bg-muted text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {room === "production" ? "Production" : "Video"}
                    </button>
                  ))}
                </div>
              <TalkbackChat
                variant="typed"
                messages={chatMessages}
                currentUserId={live.currentUserId}
                title={activeChatRoom === "video" ? "Video" : "Production"}
                subtitle={
                  activeChatRoom === "video"
                    ? "Shared with the video team. Separate from production chat."
                    : "Production chat for this service."
                }
                placeholder={activeChatRoom === "video" ? "Message video and production" : "Message production"}
                onSend={(body) => {
                  void live.sendChatMessage(body, activeChatRoom);
                }}
              />
            </div>
          ) : null}
          {tab === "notes" ? <LiveNotesPanel notes={live.notes} onSave={live.saveNotes} /> : null}
        </section>
      </div>

      {routingOpen ? (
        <AudioRoutingPage
          channels={live.channels}
          onClose={() => {
            setRoutingOpen(false);
            setBindingRevision((value) => value + 1);
          }}
          onBindingsChange={() => setBindingRevision((value) => value + 1)}
        />
      ) : null}

      <TalkbackSetupSheet
        open={setupOpen}
        channels={live.channels}
        onOpenChange={setSetupOpen}
        onOpenRouting={() => setRoutingOpen(true)}
        onAddChannel={(label) => {
          void live.addChannel(label);
        }}
        onRenameChannel={(channelId, label) => {
          void live.renameChannel(channelId, label);
        }}
        onRemoveChannel={(channelId) => {
          void live.removeChannel(channelId);
        }}
        onClearLines={() => {
          void live.clearLines();
        }}
      />
    </div>
  );
}

function localDateIso(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function LiveNowTitle({
  campusName,
  serviceTimeLabel,
  localTimeLabel,
}: {
  campusName: string;
  serviceTimeLabel: string | null;
  localTimeLabel: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 pb-3">
      <h1 className="min-w-0 text-lg font-semibold leading-snug tracking-tight text-foreground sm:text-xl">
        <span className="font-medium text-muted-foreground">You are live @</span> {campusName}
        {serviceTimeLabel ? (
          <>
            <span className="font-medium text-muted-foreground"> for the </span>
            <span className="tabular-nums text-primary">{serviceTimeLabel}</span>
          </>
        ) : null}
      </h1>
      <div className="shrink-0 rounded-xl border border-border bg-background px-3 py-2 text-right shadow-sm">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Local time</p>
        <p className="text-base font-bold tabular-nums leading-none">{localTimeLabel}</p>
      </div>
    </div>
  );
}

function StatusScreen({ title, body, href }: { title: string; body: string; href: string }) {
  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-background px-6 text-center">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="max-w-sm text-muted-foreground">{body}</p>
      <Button asChild>
        <Link to={href}>Back to calendar</Link>
      </Button>
    </div>
  );
}
