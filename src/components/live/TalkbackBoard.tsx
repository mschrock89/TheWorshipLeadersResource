import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { MessageSquare, Mic, Send, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/cn";
import { resolveTalkbackBinding } from "@/lib/liveMode";
import { startTalkbackCapture } from "@/lib/talkbackCapture";
import { transcribeTalkbackChunk } from "@/lib/transcribeTalkback";
import type { LiveChatMessage, LiveTalkbackChannel, LiveTalkbackLine } from "@/hooks/useLiveSession";

type TalkbackBoardProps = {
  channels: LiveTalkbackChannel[];
  lines: LiveTalkbackLine[];
  listening: boolean;
  audioContext: AudioContext | null;
  bindingRevision: number;
  onTranscript: (channelId: string, text: string) => void;
  onOpenSetup: () => void;
};

type TranscriptChatProps = {
  variant: "transcript";
  channels: LiveTalkbackChannel[];
  lines: LiveTalkbackLine[];
  bindingRevision: number;
};

type TypedChatProps = {
  variant: "typed";
  messages: LiveChatMessage[];
  currentUserId?: string | null;
  onSend: (body: string) => void;
  title?: string;
  subtitle?: string;
  placeholder?: string;
};

type TalkbackChatProps = TranscriptChatProps | TypedChatProps;

type ChannelStatus = {
  phase: "listening" | "hearing" | "error" | "idle";
  message?: string;
  level: number;
};

const SPEAKER_TONES = [
  { bubble: "border-sky-400/35 bg-sky-400/15", name: "text-sky-300", dot: "bg-sky-400" },
  { bubble: "border-amber-400/35 bg-amber-400/15", name: "text-amber-300", dot: "bg-amber-400" },
  { bubble: "border-emerald-400/35 bg-emerald-400/15", name: "text-emerald-300", dot: "bg-emerald-400" },
  { bubble: "border-violet-400/35 bg-violet-400/15", name: "text-violet-300", dot: "bg-violet-400" },
  { bubble: "border-rose-400/35 bg-rose-400/15", name: "text-rose-300", dot: "bg-rose-400" },
  { bubble: "border-cyan-400/35 bg-cyan-400/15", name: "text-cyan-300", dot: "bg-cyan-400" },
  { bubble: "border-orange-400/35 bg-orange-400/15", name: "text-orange-300", dot: "bg-orange-400" },
  { bubble: "border-fuchsia-400/35 bg-fuchsia-400/15", name: "text-fuchsia-300", dot: "bg-fuchsia-400" },
] as const;

function speakerTone(index: number) {
  return SPEAKER_TONES[index % SPEAKER_TONES.length];
}

function messageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return format(date, "h:mm a");
}

export function TalkbackChat(props: TalkbackChatProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const [draft, setDraft] = useState("");
  const typed = props.variant === "typed";
  const chatTitle = props.variant === "typed" ? props.title || "Live chat" : "Talkback";
  const chatSubtitle =
    props.variant === "typed"
      ? props.subtitle || "Typed messages for this service."
      : "Transcriptions for this service.";
  const chatPlaceholder = props.variant === "typed" ? props.placeholder || "Message this service" : "";
  const profilesQuery = useQuery({
    queryKey: ["basic-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_basic_profiles");
      if (error) throw error;
      return data || [];
    },
    enabled: typed,
    staleTime: 5 * 60 * 1000,
  });
  const names = useMemo(() => {
    return new Map((profilesQuery.data || []).map((profile) => [profile.id, profile.full_name || "Team"]));
  }, [profilesQuery.data]);
  const channelById = useMemo(() => {
    if (props.variant !== "transcript") return new Map<string, { channel: LiveTalkbackChannel; index: number }>();
    return new Map(props.channels.map((channel, index) => [channel.id, { channel, index }]));
  }, [props]);
  const inputNumbers = useMemo(() => {
    const numbers = new Map<string, number>();
    if (props.variant !== "transcript") return numbers;
    for (const channel of props.channels) {
      const binding = resolveTalkbackBinding(channel.id, channel.position_slot);
      if (binding?.deviceId) numbers.set(channel.id, binding.channelIndex + 1);
    }
    return numbers;
  }, [props]);
  const feed = useMemo(() => {
    if (props.variant === "transcript") {
      return props.lines
        .map((line) => ({
          kind: "mic" as const,
          id: line.id,
          at: line.created_at,
          channelId: line.channel_id,
          text: line.transcript,
        }))
        .sort((left, right) => left.at.localeCompare(right.at) || left.id.localeCompare(right.id));
    }
    return props.messages
      .map((message) => ({
        kind: "person" as const,
        id: message.id,
        at: message.created_at,
        userId: message.user_id,
        text: message.body,
      }))
      .sort((left, right) => left.at.localeCompare(right.at) || left.id.localeCompare(right.id));
  }, [props]);
  const latestId = feed[feed.length - 1]?.id;
  const currentUserId = props.variant === "typed" ? props.currentUserId : null;

  useEffect(() => {
    const node = scroller.current;
    if (!node || !stickToBottom.current) return;
    node.scrollTop = node.scrollHeight;
  }, [latestId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-border px-3 py-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">
          {chatTitle}
        </p>
        <p className="text-xs text-muted-foreground">
          {chatSubtitle}
        </p>
      </div>
      <div
        ref={scroller}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3"
        aria-live="polite"
        onScroll={(event) => {
          const node = event.currentTarget;
          stickToBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
        }}
      >
        {feed.length === 0 ? (
          <div className="flex h-full min-h-32 flex-col items-center justify-center gap-2 px-4 text-center text-muted-foreground">
            {typed ? <MessageSquare className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            <p className="text-sm">
              {typed
                ? "Typed messages for this service show up here."
                : "Talkback transcriptions for this service show up here."}
            </p>
          </div>
        ) : (
          feed.map((entry) => {
            const stamp = messageTime(entry.at);
            if (entry.kind === "person") {
              const own = entry.userId === currentUserId;
              return (
                <article key={entry.id} className={cn("flex", own ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[min(40rem,85%)] rounded-2xl px-3.5 py-2.5",
                      own ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                    )}
                  >
                    {own ? null : (
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                        {names.get(entry.userId) || "Team"}
                      </p>
                    )}
                    <p className="mt-0.5 whitespace-pre-wrap text-base leading-snug">{entry.text}</p>
                    {stamp ? (
                      <time className={cn("mt-1 block text-[10px]", own ? "text-primary-foreground/70" : "text-muted-foreground")}>
                        {stamp}
                      </time>
                    ) : null}
                  </div>
                </article>
              );
            }
            const match = channelById.get(entry.channelId);
            const tone = match ? speakerTone(match.index) : null;
            const label = match?.channel.label || "Input";
            const inputNumber = inputNumbers.get(entry.channelId);
            return (
              <article key={entry.id} className="flex justify-start">
                <div
                  className={cn(
                    "max-w-[min(40rem,100%)] rounded-2xl rounded-tl-md border px-3.5 py-2.5",
                    tone?.bubble || "border-border bg-muted",
                  )}
                >
                  <div className="flex items-baseline gap-3">
                    <p className={cn("text-[11px] font-bold uppercase tracking-[0.14em]", tone?.name || "text-muted-foreground")}>
                      {label}
                      {inputNumber ? (
                        <span className="ml-2 font-semibold normal-case tracking-normal opacity-80">Input {inputNumber}</span>
                      ) : null}
                    </p>
                    {stamp ? <time className="ml-auto shrink-0 text-[10px] text-muted-foreground">{stamp}</time> : null}
                  </div>
                  <p className="mt-1 text-lg font-medium leading-snug text-foreground sm:text-xl">{entry.text}</p>
                </div>
              </article>
            );
          })
        )}
      </div>
      {props.variant === "typed" ? (
        <form
          className="flex items-end gap-2 border-t border-border p-3"
          onSubmit={(event) => {
            event.preventDefault();
            const body = draft.trim();
            if (!body) return;
            props.onSend(body);
            setDraft("");
          }}
        >
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            rows={2}
            placeholder={chatPlaceholder}
            aria-label="Live chat message"
            className="min-h-[3rem] flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-base outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button type="submit" size="icon" className="h-11 w-11" aria-label="Send" disabled={!draft.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      ) : null}
    </div>
  );
}

export function TalkbackBoard({
  channels,
  lines,
  listening,
  audioContext,
  bindingRevision,
  onTranscript,
  onOpenSetup,
}: TalkbackBoardProps) {
  const [status, setStatus] = useState<Record<string, ChannelStatus>>({});

  const armed = useMemo(() => {
    return channels.flatMap((channel) => {
      const binding = resolveTalkbackBinding(channel.id, channel.position_slot);
      if (!binding?.deviceId) return [];
      return [{ id: channel.id, deviceId: binding.deviceId, channelIndex: binding.channelIndex }];
    });
  }, [bindingRevision, channels]);

  const armedKey = armed.map((channel) => `${channel.id}:${channel.deviceId}:${channel.channelIndex}`).join("|");

  useEffect(() => {
    if (!listening || !audioContext || armed.length === 0) {
      setStatus({});
      return;
    }
    return startTalkbackCapture({
      audioContext,
      channels: armed,
      transcribe: transcribeTalkbackChunk,
      onTranscript,
      onLevel: (channelId, level) => {
        setStatus((current) => ({
          ...current,
          [channelId]: { ...current[channelId], phase: current[channelId]?.phase || "listening", level },
        }));
      },
      onStatus: (channelId, phase, message) => {
        setStatus((current) => ({
          ...current,
          [channelId]: { level: current[channelId]?.level || 0, phase, message },
        }));
      },
    });
  }, [armed, armedKey, audioContext, listening, onTranscript]);

  if (channels.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-lg font-semibold">No talkback positions yet</p>
        <Button type="button" onClick={onOpenSetup}>
          Add positions
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {armed.length === 0 && (
        <button
          type="button"
          onClick={onOpenSetup}
          className="mx-3 mt-3 flex shrink-0 items-center gap-3 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-3 text-left"
        >
          <Settings2 className="h-5 w-5 shrink-0 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Open audio routing and match each board input to a talkback name.
          </span>
        </button>
      )}

      <div className="flex shrink-0 gap-2 overflow-x-auto px-3 py-3">
        {channels.map((channel, index) => {
          const channelStatus = status[channel.id];
          const binding = armed.find((entry) => entry.id === channel.id);
          const level = Math.min(1, (channelStatus?.level || 0) / 0.06);
          const tone = speakerTone(index);
          const hearing = channelStatus?.phase === "hearing";
          return (
            <div
              key={channel.id}
              className={cn(
                "min-w-[8.5rem] shrink-0 rounded-xl border px-3 py-2",
                hearing ? "border-primary bg-primary/10" : "border-border bg-card",
              )}
            >
              <div className="flex items-center gap-2">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", tone.dot)} />
                <p className="min-w-0 flex-1 truncate text-xs font-bold uppercase tracking-[0.12em] text-foreground">
                  {channel.label}
                </p>
                <span
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    hearing
                      ? "bg-primary"
                      : channelStatus?.phase === "error"
                        ? "bg-destructive"
                        : listening && binding
                          ? "bg-emerald-500"
                          : "bg-muted-foreground/30",
                  )}
                />
              </div>
              <p className="mt-1 truncate text-[11px] text-muted-foreground">
                {binding ? `Input ${binding.channelIndex + 1}` : "No input assigned"}
              </p>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-75"
                  style={{ width: `${Math.round(level * 100)}%` }}
                />
              </div>
              {channelStatus?.phase === "error" && channelStatus.message ? (
                <p className="mt-1 line-clamp-2 text-[11px] text-destructive">{channelStatus.message}</p>
              ) : null}
            </div>
          );
        })}
      </div>

      <TalkbackChat variant="transcript" channels={channels} lines={lines} bindingRevision={bindingRevision} />
    </div>
  );
}
