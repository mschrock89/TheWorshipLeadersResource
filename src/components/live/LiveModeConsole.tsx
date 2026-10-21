import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ArrowLeft, Loader2, Radio, Settings2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { MINISTRY_TYPES } from "@/lib/constants";
import { cn } from "@/lib/cn";
import { isListenerHosting, isLiveStation, LIVE_STATIONS, liveChatRoomOf, liveStationLabel, liveStationUsesPreServicePlayer, readLiveStation, readTalkbackBindings, TALKBACK_TRANSCRIPT_ENABLED, writeLiveStation, writeTalkbackBindingStore, type LiveChatRoom, type LiveStation } from "@/lib/liveMode";
import {
  applyAudioRoutingDefault,
  markRoutingDefaultApplied,
  readAudioRoutingDefault,
  routingDefaultAlreadyApplied,
  sessionRoutingIdentities,
  writeAudioChannelCount,
  writeAudioInterfaceId,
} from "@/lib/audioRouting";
import {
  findMidiCueItem,
  formatMidiCueLabel,
  midiCueMatches,
  notesWithMidiCue,
  parseNoteMidi,
  readMidiFollowSettings,
  writeMidiFollowSettings,
  type FlowMidiCue,
  type MidiFollowSettings,
  type MidiNoteEvent,
} from "@/lib/serviceFlowMidi";
import { requestSoftwareMidiAccess, startMidiCapture, type MidiInputInfo } from "@/lib/midiCapture";
import { createInputAudioContext } from "@/lib/systemAudioInputs";
import { useLiveModeAccess } from "@/hooks/useCanOpenLiveMode";
import { useLiveSession } from "@/hooks/useLiveSession";
import { useSongMapCues } from "@/hooks/useSongMapCues";
import { useSaveServiceFlowItem, useServiceFlow, useServiceFlowItems } from "@/hooks/useServiceFlow";
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
  findPreRollItem,
  formatClockTime,
  listScheduledServiceTimes,
  liveClockAnchorApplies,
  localClockSeconds,
  measureServiceFlowSpan,
  normalizeClockSource,
  PRE_ROLL_FIRE_MINUTE,
  preRollFireSeconds,
  preRollLeadSeconds,
  resolveLiveServiceStartTime,
  serviceStartBoundaryItem,
} from "@/components/service-flow/serviceFlowClock";
import { localServiceTimestamp } from "@/lib/preServicePlaylist";
import { useEndServiceAmbientTrack } from "@/hooks/useEndServiceAmbientTrack";
import { usePreServicePlaylist } from "@/hooks/usePreServicePlaylist";
import { AudioRoutingPage } from "./AudioRoutingPage";
import { TalkbackBoard, TalkbackChat } from "./TalkbackBoard";
import { TalkbackSetupSheet } from "./TalkbackSetupSheet";
import { findFlowCue, LiveServiceFlowPanel } from "./LiveServiceFlowPanel";
import { LiveNotesPanel } from "./LiveNotesPanel";
import { SongMapBar } from "./SongMapBar";
import { EndServiceAmbientPlayer } from "./EndServiceAmbientPlayer";
import { PreServicePlayer } from "./PreServicePlayer";

type LiveModeConsoleProps = {
  campusId: string;
  campusName: string;
  ministryType: string;
  serviceDate: string;
  customServiceId: string | null;
  draftSetId: string | null;
};

type DockTab = "flow" | "chat" | "notes";

export function LiveModeConsole({
  campusId,
  campusName,
  ministryType,
  serviceDate,
  customServiceId,
  draftSetId,
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
  const [followCues, setFollowCues] = useState(true);
  const [midiSettings, setMidiSettings] = useState<MidiFollowSettings>(readMidiFollowSettings);
  const [midiInputs, setMidiInputs] = useState<MidiInputInfo[]>([]);
  const [midiStatus, setMidiStatus] = useState<"idle" | "listening" | "error">("idle");
  const [midiMessage, setMidiMessage] = useState<string | null>(null);
  const [lastMidi, setLastMidi] = useState<MidiNoteEvent | null>(null);
  const [songMapRun, setSongMapRun] = useState<{ itemId: string; startedAt: number } | null>(null);
  const [midiFit, setMidiFit] = useState<"channel" | "none" | "paused" | null>(null);
  const [midiMenuOpened, setMidiMenuOpened] = useState(false);
  const saveFlowItem = useSaveServiceFlowItem();
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
  const songItemIds = useMemo(
    () => items.filter((item) => item.item_type === "song").map((item) => item.id),
    [items],
  );
  const songMap = useSongMapCues(flow?.id || null, songItemIds);
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
  const playlist = usePreServicePlaylist({
    campusId,
    station,
    serviceDate,
    enabled: !videoOnly && liveStationUsesPreServicePlayer(station),
  });
  const ambientTrack = useEndServiceAmbientTrack({
    campusId,
    station,
    enabled: !videoOnly && liveStationUsesPreServicePlayer(station),
  });
  const flowSpan = useMemo(() => measureServiceFlowSpan(items), [items]);
  const playlistLeadSeconds = useMemo(() => {
    if (playlist.durationMs <= 0) return 0;
    const fireLead = scheduledServiceTimes.reduce((max, time) => {
      const seconds = clockSourceToSeconds(time);
      if (seconds == null) return max;
      return Math.max(max, preRollLeadSeconds(seconds));
    }, 0);
    return Math.ceil(playlist.durationMs / 1000) + fireLead;
  }, [playlist.durationMs, scheduledServiceTimes]);
  const selectionSpan = useMemo(
    () => ({
      preServiceSeconds: Math.max(flowSpan.preServiceSeconds, playlistLeadSeconds),
      serviceDurationSeconds: flowSpan.serviceDurationSeconds,
    }),
    [flowSpan, playlistLeadSeconds],
  );
  const startTime = useMemo(
    () =>
      resolveLiveServiceStartTime({
        scheduledTimes: scheduledServiceTimes,
        savedStartTime: flow?.start_time,
        nowSeconds: localClockSeconds(now),
        serviceDate,
        today: localDateIso(now),
        span: selectionSpan,
      }),
    [flow?.start_time, now, scheduledServiceTimes, selectionSpan, serviceDate],
  );
  const boundaryItem = useMemo(() => serviceStartBoundaryItem(items), [items]);
  const preRollItem = useMemo(() => findPreRollItem(items), [items]);
  const [preRollCueAt, setPreRollCueAt] = useState<number | null>(null);
  const [preServiceRestartAt, setPreServiceRestartAt] = useState<number | null>(null);
  const [endServicePlayAt, setEndServicePlayAt] = useState<number | null>(null);
  const [ambientFadeAt, setAmbientFadeAt] = useState<number | null>(null);
  const preRollItemIdRef = useRef<string | null>(null);
  preRollItemIdRef.current = preRollItem?.id ?? null;
  const markPreRollCueRef = useRef<(at: number) => void>(() => {});
  markPreRollCueRef.current = (at: number) => setPreRollCueAt(at);
  const liveBoundaryStart =
    live.clockAnchor && boundaryItem && live.clockAnchor.itemId === boundaryItem.id
      ? live.clockAnchor.startedAtSeconds
      : null;
  const anchorServiceStart =
    liveBoundaryStart != null && boundaryItem
      ? liveBoundaryStart + (boundaryItem.duration_seconds || 0)
      : null;
  const anchorApplies =
    anchorServiceStart != null &&
    liveClockAnchorApplies(anchorServiceStart, startTime, scheduledServiceTimes);
  const scheduledStartSeconds = clockSourceToSeconds(startTime);
  const plannedPreRollStart =
    preRollItem && scheduledStartSeconds != null ? preRollFireSeconds(scheduledStartSeconds) : null;
  const serviceTimeLabel =
    anchorApplies && liveBoundaryStart != null && preRollItem
      ? formatClockTime(liveBoundaryStart)
      : anchorApplies && anchorServiceStart != null
        ? formatClockTime(anchorServiceStart)
        : plannedPreRollStart != null
          ? formatClockTime(plannedPreRollStart)
          : startTime
            ? formatClockTime(scheduledStartSeconds ?? 0)
            : null;
  const preRollAtMs =
    plannedPreRollStart == null ? null : localServiceTimestamp(serviceDate, plannedPreRollStart);
  const localTimeLabel = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
  const clockTimes = useMemo(
    () =>
      buildServiceFlowClockTimes(items, startTime, {
        boundaryStartedAtSeconds: anchorApplies ? liveBoundaryStart : null,
        preRollFireMinute: PRE_ROLL_FIRE_MINUTE,
      }),
    [anchorApplies, items, liveBoundaryStart, startTime],
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
    if (videoOnly) return;
    const sessionId = live.session?.id;
    if (!sessionId || live.isLoading || live.channels.length === 0) return;
    const saved = readAudioRoutingDefault();
    if (!saved || routingDefaultAlreadyApplied(sessionId, saved.savedAt)) return;
    writeTalkbackBindingStore(applyAudioRoutingDefault(saved, sessionRoutingIdentities(live.channels)));
    writeAudioInterfaceId(saved.deviceId);
    if (saved.channelCount) writeAudioChannelCount(saved.channelCount);
    markRoutingDefaultApplied(sessionId, saved.savedAt);
    setBindingRevision((value) => value + 1);
  }, [live.channels, live.isLoading, live.session?.id, videoOnly]);

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
    if (!TALKBACK_TRANSCRIPT_ENABLED || !listening) return;
    void live.claimListener(station);
  }, [listening, live.claimListener, station]);

  useEffect(() => {
    if (!TALKBACK_TRANSCRIPT_ENABLED || !listening) return;
    const timer = window.setInterval(() => {
      void heartbeatListener();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [heartbeatListener, listening]);

  const sawOwnClaim = useRef(false);
  useEffect(() => {
    if (!TALKBACK_TRANSCRIPT_ENABLED || !listening) {
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

  const flowTrack = useRef({
    currentId: null as string | null,
    setItem: (_itemId: string) => {},
    publish: (_cue: { itemId: string | null; progress: number; label: string; at: number }) => {},
  });
  const flowItemsRef = useRef(items);
  flowItemsRef.current = items;
  const midiSettingsRef = useRef(midiSettings);
  midiSettingsRef.current = midiSettings;
  const publishClockAnchorRef = useRef(live.publishClockAnchor);
  publishClockAnchorRef.current = live.publishClockAnchor;
  const followRef = useRef(followCues);
  followRef.current = followCues;
  const hasMidiCues = items.some((item) => item.item_type !== "header");
  const midiAvailable = typeof navigator.requestMIDIAccess === "function";
  const listenMidi = midiMenuOpened || (midiAvailable && hasMidiCues);
  flowTrack.current.currentId = live.session?.current_item_id || null;
  flowTrack.current.setItem = (itemId) => {
    void live.setCurrentItem(itemId);
  };
  flowTrack.current.publish = live.publishFlowCue;

  useEffect(() => {
    if (!listenMidi) {
      setMidiStatus("idle");
      setMidiMessage(null);
      return;
    }
    let active = true;
    const stop = startMidiCapture({
      inputId: midiSettings.inputId,
      onInputs: (inputs) => {
        if (active) setMidiInputs(inputs);
      },
      onStatus: (status, message) => {
        if (!active) return;
        setMidiStatus(status);
        setMidiMessage(message || null);
      },
      onNote: (event) => {
        if (!active) return;
        setLastMidi(event);
        const settings = midiSettingsRef.current;
        if (event.channel !== settings.channel) {
          setMidiFit("channel");
          return;
        }
        const preServiceHit =
          settings.preServiceCue != null && midiCueMatches(settings.preServiceCue, event, settings.channel);
        const endServiceHit =
          settings.endServiceCue != null && midiCueMatches(settings.endServiceCue, event, settings.channel);
        if (preServiceHit) {
          const at = Date.now();
          setPreServiceRestartAt(at);
          setPreRollCueAt(null);
          setAmbientFadeAt(at);
        }
        if (endServiceHit) setEndServicePlayAt(Date.now());
        const match = findMidiCueItem(flowItemsRef.current, event, settings.channel);
        if (!match) {
          setMidiFit(preServiceHit || endServiceHit ? null : "none");
          return;
        }
        if (match.item_type === "song") {
          setSongMapRun({ itemId: match.id, startedAt: Date.now() });
        }
        if (preRollItemIdRef.current && match.id === preRollItemIdRef.current) {
          markPreRollCueRef.current(Date.now());
        }
        const boundary = serviceStartBoundaryItem(flowItemsRef.current);
        if (boundary && match.id === boundary.id) {
          publishClockAnchorRef.current({
            itemId: boundary.id,
            startedAtSeconds: localClockSeconds(new Date()),
            at: Date.now(),
          });
        }
        if (TALKBACK_TRANSCRIPT_ENABLED && !followRef.current) {
          setMidiFit("paused");
          return;
        }
        setMidiFit(null);
        const state = flowTrack.current;
        const cue = parseNoteMidi(match.notes);
        if (state.currentId !== match.id) {
          state.currentId = match.id;
          state.setItem(match.id);
        }
        if (cue) {
          state.publish({
            itemId: match.id,
            progress: 0,
            label: `MIDI ${formatMidiCueLabel(cue)}`,
            at: Date.now(),
          });
        }
      },
    });
    return () => {
      active = false;
      stop();
    };
  }, [listenMidi, midiSettings.inputId]);

  useEffect(() => {
    const anchor = live.clockAnchor;
    if (!anchor) return;
    const timer = window.setInterval(() => {
      publishClockAnchorRef.current({
        itemId: anchor.itemId,
        startedAtSeconds: anchor.startedAtSeconds,
        at: anchor.at,
      });
    }, 4000);
    return () => window.clearInterval(timer);
  }, [live.clockAnchor]);

  useEffect(() => {
    const cue = live.flowCue;
    if (!preRollItem || !cue || cue.itemId !== preRollItem.id) return;
    if (Date.now() - cue.at > 10_000) return;
    setPreRollCueAt((current) => current ?? cue.at);
  }, [live.flowCue, preRollItem]);

  const sessionItemId = live.session?.current_item_id ?? null;
  const lastSessionItemId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const previous = lastSessionItemId.current;
    lastSessionItemId.current = sessionItemId;
    if (previous === undefined || previous === sessionItemId) return;
    if (preRollItem && sessionItemId === preRollItem.id) {
      setPreRollCueAt((current) => current ?? Date.now());
    }
  }, [preRollItem, sessionItemId]);

  useEffect(() => {
    if (preRollCueAt == null || !preRollItem || sessionItemId === preRollItem.id) return;
    if (Date.now() - preRollCueAt < 10_000) return;
    setPreRollCueAt(null);
  }, [preRollCueAt, preRollItem, sessionItemId]);

  const hostActive = isListenerHosting(live.session, now.getTime());
  const hostStation = isLiveStation(live.session?.listener_station) ? live.session.listener_station : null;
  const weAreHost = listening && live.session?.listener_client_id === live.clientId;
  const followingHost =
    hostActive && !weAreHost && hostStation ? liveStationLabel(hostStation) : null;

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
          <div className="flex items-center gap-2 px-2 py-1.5">
            <Link to={calendarHref} aria-label="Back to calendar" className="rounded-md p-1.5 hover:bg-muted">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">Live</p>
            <LiveNowTitle
              campusName={campusName}
              serviceTimeLabel={serviceTimeLabel}
              localTimeLabel={localTimeLabel}
            />
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

  const flowCue = live.flowCue;
  const cueIsFresh = !!flowCue && now.getTime() - flowCue.at < 2500;
  const flowProgress = cueIsFresh && flowCue?.itemId === live.session?.current_item_id ? flowCue.progress : null;
  const publishedMidi = cueIsFresh && flowCue?.label?.startsWith("MIDI ") ? flowCue.label : null;
  const midiHeard = lastMidi
    ? `MIDI ${formatMidiCueLabel({ note: lastMidi.note, velocity: lastMidi.velocity })}`
    : null;
  const midiReadout =
    listenMidi
      ? midiStatus === "error"
        ? midiMessage || "MIDI needs a check"
        : midiHeard
          ? `${midiHeard}${
              midiFit === "channel"
                ? ` on channel ${lastMidi?.channel}`
                : midiFit === "none"
                  ? " · no matching line"
                  : midiFit === "paused"
                    ? " · follow is off"
                    : ""
            }`
          : midiStatus === "listening"
            ? "MIDI waiting"
            : null
      : publishedMidi;
  const assignMidi = async (itemId: string, cue: FlowMidiCue | null) => {
    const item = items.find((entry) => entry.id === itemId);
    if (!item || !flow?.id) throw new Error("That line is not ready to save.");
    await saveFlowItem.mutateAsync({
      id: item.id,
      service_flow_id: flow.id,
      item_type: item.item_type,
      title: item.title,
      duration_seconds: item.duration_seconds,
      sequence_order: item.sequence_order,
      song_id: item.song_id,
      song_key: item.song_key,
      vocalist_id: item.vocalist_id,
      notes: notesWithMidiCue(item.notes, cue),
    });
  };
  const updateMidiSettings = (settings: MidiFollowSettings) => {
    setMidiSettings(settings);
    writeMidiFollowSettings(settings);
  };
  const currentItem = items.find((item) => item.id === live.session?.current_item_id) || null;
  const currentSong = currentItem?.item_type === "song" ? currentItem : null;

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background text-foreground">
      <header className="shrink-0 border-b border-border bg-card">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <Link to={calendarHref} aria-label="Back to calendar" className="rounded-md p-1.5 hover:bg-muted">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">Live</p>
          <LiveNowTitle
            campusName={campusName}
            serviceTimeLabel={serviceTimeLabel}
            localTimeLabel={localTimeLabel}
            trailing={
              <div className="flex items-center gap-2 overflow-x-auto">
            <div
              className="flex shrink-0 items-center gap-1 rounded-xl border border-primary/35 bg-primary/10 p-1 shadow-sm"
              role="group"
              aria-label="Live position"
            >
              <span className="px-2 text-[10px] font-extrabold uppercase tracking-[0.16em] text-primary">
                Position
              </span>
              <div className="flex rounded-lg bg-background/70 p-0.5">
                {LIVE_STATIONS.map((option) => {
                  const isActive = station === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => {
                        setStation(option);
                        writeLiveStation(option);
                      }}
                      className={cn(
                        "relative rounded-md px-3 py-1.5 text-sm font-bold transition-all",
                        isActive
                          ? "bg-primary text-primary-foreground shadow-md ring-1 ring-primary"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <span className="flex items-center gap-1.5">
                        {isActive ? (
                          <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground shadow-[0_0_0_2px_hsl(var(--primary-foreground)/0.2)]" />
                        ) : null}
                        {liveStationLabel(option)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            {TALKBACK_TRANSCRIPT_ENABLED ? (
              <>
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
                    void live.claimListener(station);
                  }}
                >
                  <Radio className={cn("h-4 w-4", listening && "text-primary")} />
                  {listening ? "Stop" : "Listen"}
                </Button>
                {followingHost ? (
                  <div
                    className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 text-sm font-semibold text-primary"
                    aria-live="polite"
                  >
                    <Radio className="h-4 w-4 text-primary" />
                    Following {followingHost}
                  </div>
                ) : null}
                <Button
                  type="button"
                  variant={followCues ? "secondary" : "outline"}
                  className="h-10"
                  onClick={() => setFollowCues((value) => !value)}
                >
                  {followCues ? "Following" : "Follow"}
                </Button>
              </>
            ) : null}
            {TALKBACK_TRANSCRIPT_ENABLED ? (
              <Button type="button" variant="outline" size="icon" aria-label="Talkback setup" onClick={() => setSetupOpen(true)}>
                <Settings2 className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
            }
          />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        {liveStationUsesPreServicePlayer(station) ? (
          <>
            <PreServicePlayer
              station={station}
              year={playlist.year}
              trimester={playlist.trimester}
              serviceYear={playlist.serviceYear}
              serviceTrimester={playlist.serviceTrimester}
              tracks={playlist.tracks}
              isLoading={playlist.isLoading}
              schemaMissing={playlist.schemaMissing}
              uploading={playlist.uploading}
              uploadLabel={playlist.uploadLabel}
              preRollAtMs={preRollAtMs}
              preRollLabel={plannedPreRollStart == null ? null : formatClockTime(plannedPreRollStart)}
              fadeAt={preRollCueAt}
              restartAt={preServiceRestartAt}
              onPeriodChange={playlist.setPeriod}
              onUpload={playlist.uploadFiles}
              onRemove={playlist.removeTrack}
              onMove={playlist.moveTrack}
            />
            <EndServiceAmbientPlayer
              track={ambientTrack.track}
              isLoading={ambientTrack.isLoading}
              schemaMissing={ambientTrack.schemaMissing}
              playAt={endServicePlayAt}
              fadeAt={ambientFadeAt}
            />
          </>
        ) : null}
        <div className="relative shrink-0 overflow-hidden border-b border-primary/50 bg-gradient-to-r from-primary/20 via-primary/10 to-card px-5 py-4 shadow-[inset_4px_0_0_hsl(var(--primary)),0_8px_24px_hsl(var(--primary)/0.08)]">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-primary via-primary/40 to-transparent" />
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
            <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary))]" />
            <span>
              {ministryLabel} · {serviceLabel}
            {TALKBACK_TRANSCRIPT_ENABLED
              ? weAreHost
                ? " · This screen is listening"
                : followingHost
                  ? ` · Following ${followingHost}`
                  : ""
              : ""}
            </span>
          </p>
          {currentSong && currentSong.duration_seconds ? (
            <SongMapBar
              key={`${currentSong.id}:${songMapRun?.itemId === currentSong.id ? songMapRun.startedAt : "waiting"}`}
              title={cue.currentTitle || "Cue the service flow"}
              durationSeconds={currentSong.duration_seconds}
              startedAt={songMapRun?.itemId === currentSong.id ? songMapRun.startedAt : null}
              cues={songMap.cues.filter((entry) => entry.serviceFlowItemId === currentSong.id)}
              schemaMissing={songMap.schemaMissing}
              onSave={(draft) =>
                songMap.saveCue({
                  ...draft,
                  serviceFlowItemId: currentSong.id,
                })
              }
              onDelete={songMap.deleteCue}
            />
          ) : (
            <p className="mt-2 text-3xl font-extrabold leading-tight tracking-tight drop-shadow-sm">
              {cue.currentTitle || "Cue the service flow"}
            </p>
          )}
          {cue.nextTitle ? (
            <p className="mt-1.5 truncate text-base font-medium text-muted-foreground">Next · {cue.nextTitle}</p>
          ) : null}
          {midiReadout ? (
            <p
              className={cn(
                "mt-1 text-sm font-semibold tabular-nums",
                midiStatus === "error" && listenMidi ? "text-destructive" : "text-primary",
              )}
            >
              {midiReadout}
            </p>
          ) : null}
        </div>
        <div className={cn("flex min-h-0 flex-1 flex-col", TALKBACK_TRANSCRIPT_ENABLED && "landscape:flex-row")}>
          {TALKBACK_TRANSCRIPT_ENABLED ? (
            <section className="flex min-h-0 flex-[1.35] flex-col landscape:flex-1">
              {live.isLoading ? (
                <div className="flex flex-1 items-center justify-center py-6">
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
          ) : null}

          <section
            className={cn(
              "flex min-h-0 flex-1 flex-col border-border",
              TALKBACK_TRANSCRIPT_ENABLED
                ? "h-[42dvh] min-h-[16rem] border-t landscape:h-auto landscape:w-[min(28rem,46%)] landscape:border-l landscape:border-t-0"
                : "border-t-0",
            )}
          >
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
              serviceStartItemId={boundaryItem?.id || null}
              currentItemId={live.session?.current_item_id || null}
              progress={flowProgress}
              isLoading={flowLoading || (!!flow?.id && itemsLoading)}
              midiSettings={midiSettings}
              midiInputs={midiInputs}
              midiStatus={midiStatus}
              midiMessage={midiMessage}
              lastMidi={lastMidi}
              onOpenMidi={() => {
                requestSoftwareMidiAccess();
                setMidiMenuOpened(true);
              }}
              onMidiSettings={updateMidiSettings}
              onAssignMidi={assignMidi}
              onSelect={(itemId) => {
                if (itemId && itemId === preRollItem?.id) setPreRollCueAt(Date.now());
                const state = flowTrack.current;
                state.currentId = itemId;
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
      </div>

      {routingOpen ? (
        <AudioRoutingPage
          sessionId={live.session?.id || null}
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
        onColorsChange={() => setBindingRevision((value) => value + 1)}
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
  trailing,
}: {
  campusName: string;
  serviceTimeLabel: string | null;
  localTimeLabel: string;
  trailing?: ReactNode;
}) {
  return (
    <>
      <h1 className="min-w-0 flex-1 truncate text-sm font-semibold leading-tight text-foreground">
        <span className="font-medium text-muted-foreground">You are live @</span> {campusName}
        {serviceTimeLabel ? (
          <>
            <span className="font-medium text-muted-foreground"> for the </span>
            <span className="tabular-nums text-primary">{serviceTimeLabel}</span>
          </>
        ) : null}
      </h1>
      {trailing}
      <div className="shrink-0 rounded-lg border border-border bg-background px-2.5 py-1.5 text-right">
        <p className="text-[11.7px] font-semibold uppercase leading-none tracking-[0.14em] text-muted-foreground">Local</p>
        <p className="mt-0.5 text-[18.2px] font-bold tabular-nums leading-none">{localTimeLabel}</p>
      </div>
    </>
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
