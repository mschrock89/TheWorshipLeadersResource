import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ArrowLeft, AudioLines, Loader2, Radio, Settings2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MINISTRY_TYPES, SET_PLANNER_MINISTRY_OPTIONS } from "@/lib/constants";
import { cn } from "@/lib/cn";
import { liveStationLabel, readLiveStation, writeLiveStation, type LiveStation } from "@/lib/liveMode";
import { useLiveSession } from "@/hooks/useLiveSession";
import { useServiceFlow, useServiceFlowItems } from "@/hooks/useServiceFlow";
import { buildServiceFlowClockTimes } from "@/components/service-flow/serviceFlowClock";
import { AudioRoutingPage } from "./AudioRoutingPage";
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
  const live = useLiveSession({
    campusId,
    ministryType,
    serviceDate,
    customServiceId,
    draftSetId,
  });
  const [station, setStation] = useState<LiveStation>(() => readLiveStation());
  const [listening, setListening] = useState(false);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [routingOpen, setRoutingOpen] = useState(false);
  const [bindingRevision, setBindingRevision] = useState(0);
  const [tab, setTab] = useState<DockTab>("flow");

  const flowDraftId = draftSetId || live.session?.draft_set_id || null;
  const { data: flow, isLoading: flowLoading } = useServiceFlow(
    campusId,
    ministryType,
    serviceDate,
    flowDraftId,
    customServiceId,
  );
  const { data: items = [], isLoading: itemsLoading } = useServiceFlowItems(flow?.id || null);
  const clockTimes = useMemo(
    () => buildServiceFlowClockTimes(items, flow?.start_time),
    [flow?.start_time, items],
  );
  const cue = findFlowCue(items, live.session?.current_item_id || null);
  const ministryLabel =
    MINISTRY_TYPES.find((option) => option.value === ministryType)?.label || "Service";
  const serviceLabel = format(parseISO(`${serviceDate}T00:00:00`), "EEE, MMM d");

  useEffect(() => {
    const timer = window.setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: ["service-flow"] });
      void queryClient.invalidateQueries({ queryKey: ["service-flow-items"] });
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [queryClient]);

  useEffect(() => {
    if (!listening) return;
    const timer = window.setInterval(() => {
      void live.heartbeatListener();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [listening, live.heartbeatListener]);

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

  const remoteListening =
    !!live.session?.listener_client_id &&
    live.session.listener_client_id !== live.clientId &&
    !!live.session.listener_heartbeat &&
    Date.now() - new Date(live.session.listener_heartbeat).getTime() < 20_000;

  const calendarHref = `/calendar?date=${serviceDate}&campus=${campusId}&ministry=${ministryType}`;

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
        title="Live Mode is for the production team"
        body="FOH, MON, and production staff at this campus can open it."
        href={calendarHref}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background text-foreground">
      <header className="shrink-0 border-b border-border bg-card">
        <div className="flex items-center gap-2 px-3 py-2">
          <Link to={calendarHref} aria-label="Back to calendar" className="rounded-md p-2 hover:bg-muted">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">Live</p>
            <p className="truncate text-sm font-semibold">{campusName}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex rounded-lg bg-muted p-0.5">
              {(["foh", "mon"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setStation(option);
                    writeLiveStation(option);
                    if (listening) void live.claimListener(option);
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
            <Button
              type="button"
              variant={listening ? "secondary" : "default"}
              className="h-10"
              onClick={() => {
                if (listening) {
                  setListening(false);
                  void audioContext?.close();
                  setAudioContext(null);
                  void live.releaseListener();
                  return;
                }
                const context = new AudioContext();
                void context.resume();
                setAudioContext(context);
                setListening(true);
                void live.claimListener(station);
              }}
            >
              <Radio className={cn("h-4 w-4", listening && "text-primary")} />
              {listening ? "Stop" : "Listen"}
            </Button>
            <Button type="button" variant="outline" size="icon" aria-label="Audio routing" onClick={() => setRoutingOpen(true)}>
              <AudioLines className="h-4 w-4" />
            </Button>
            <Button type="button" variant="outline" size="icon" aria-label="Talkback setup" onClick={() => setSetupOpen(true)}>
              <Settings2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto px-3 pb-2">
          {campuses.length > 1 ? (
            <Select value={campusId} onValueChange={(value) => onScopeChange({ campusId: value })}>
              <SelectTrigger className="h-9 w-40 shrink-0" aria-label="Campus">
                <SelectValue />
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
            <SelectTrigger className="h-9 w-44 shrink-0" aria-label="Service">
              <SelectValue />
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
              {remoteListening && live.session?.listener_station
                ? ` · ${liveStationLabel(live.session.listener_station === "mon" ? "mon" : "foh")} is listening`
                : listening
                  ? " · This screen is listening"
                  : ""}
            </p>
            <p className="mt-1 text-2xl font-bold leading-tight">
              {cue.currentTitle || "Cue the service flow"}
            </p>
            {cue.nextTitle ? (
              <p className="mt-1 truncate text-sm text-muted-foreground">Next · {cue.nextTitle}</p>
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
            {(
              [
                ["flow", "Flow"],
                ["chat", "Chat"],
                ["notes", "Notes"],
              ] as const
            ).map(([value, label]) => (
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
              clockTimes={clockTimes}
              currentItemId={live.session?.current_item_id || null}
              isLoading={flowLoading || (!!flow?.id && itemsLoading)}
              onSelect={(itemId) => {
                void live.setCurrentItem(itemId);
              }}
            />
          ) : null}
          {tab === "chat" ? (
            <TalkbackChat
              variant="typed"
              messages={live.chatMessages}
              currentUserId={live.currentUserId}
              onSend={(body) => {
                void live.sendChatMessage(body);
              }}
            />
          ) : null}
          {tab === "notes" ? <LiveNotesPanel notes={live.notes} onSave={live.saveNotes} /> : null}
        </section>
      </div>

      {routingOpen ? (
        <AudioRoutingPage
          channels={live.channels}
          onClose={() => setRoutingOpen(false)}
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
