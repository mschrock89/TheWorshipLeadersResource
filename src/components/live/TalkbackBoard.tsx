import { useEffect, useMemo, useState } from "react";
import { Mic, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { resolveTalkbackBinding } from "@/lib/liveMode";
import { startTalkbackCapture } from "@/lib/talkbackCapture";
import { transcribeTalkbackChunk } from "@/lib/transcribeTalkback";
import type { LiveTalkbackChannel, LiveTalkbackLine } from "@/hooks/useLiveSession";

type TalkbackBoardProps = {
  channels: LiveTalkbackChannel[];
  lines: LiveTalkbackLine[];
  listening: boolean;
  audioContext: AudioContext | null;
  bindingRevision: number;
  onTranscript: (channelId: string, text: string) => void;
  onOpenSetup: () => void;
};

type ChannelStatus = {
  phase: "listening" | "hearing" | "error" | "idle";
  message?: string;
  level: number;
};

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

  const linesByChannel = useMemo(() => {
    const grouped = new Map<string, LiveTalkbackLine[]>();
    for (const line of lines) {
      const bucket = grouped.get(line.channel_id) || [];
      bucket.push(line);
      grouped.set(line.channel_id, bucket);
    }
    return grouped;
  }, [lines]);

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
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
      {armed.length === 0 && (
        <button
          type="button"
          onClick={onOpenSetup}
          className="flex w-full items-center gap-3 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-3 text-left"
        >
          <Settings2 className="h-5 w-5 shrink-0 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Open audio routing and match each board input to a talkback name.
          </span>
        </button>
      )}
      {channels.map((channel) => {
        const history = linesByChannel.get(channel.id) || [];
        const recent = history.slice(-3);
        const latest = recent[recent.length - 1];
        const channelStatus = status[channel.id];
        const binding = armed.find((entry) => entry.id === channel.id);
        const level = Math.min(1, (channelStatus?.level || 0) / 0.18);
        return (
          <article
            key={channel.id}
            className={cn(
              "rounded-2xl border bg-card px-4 py-3",
              channelStatus?.phase === "hearing" ? "border-primary" : "border-border",
            )}
            aria-live="polite"
          >
            <div className="flex items-center gap-3">
              <h2 className="min-w-0 flex-1 truncate text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
                {channel.label}
              </h2>
              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-75"
                  style={{ width: `${Math.round(level * 100)}%` }}
                />
              </div>
              <span
                className={cn(
                  "h-2.5 w-2.5 rounded-full",
                  channelStatus?.phase === "hearing"
                    ? "bg-primary"
                    : channelStatus?.phase === "error"
                      ? "bg-destructive"
                      : listening && binding
                        ? "bg-emerald-500"
                        : "bg-muted-foreground/30",
                )}
              />
            </div>
            {channelStatus?.phase === "error" && channelStatus.message ? (
              <p className="mt-2 text-sm text-destructive">{channelStatus.message}</p>
            ) : latest ? (
              <div className="mt-2 space-y-1">
                {recent.slice(0, -1).map((line) => (
                  <p key={line.id} className="truncate text-sm text-muted-foreground">
                    {line.transcript}
                  </p>
                ))}
                <p className="text-xl font-semibold leading-snug text-foreground sm:text-2xl">
                  {latest.transcript}
                </p>
              </div>
            ) : (
              <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                <Mic className="h-4 w-4" />
                {binding ? `Input ${binding.channelIndex + 1}` : "No input assigned"}
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}
