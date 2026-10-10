import { useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChannelColorButton } from "@/components/live/ChannelColorPicker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  assignSmpteInput,
  captureAudioRoutingDefault,
  markRoutingDefaultApplied,
  patchInput,
  PLAYBACK_SMPTE_ROUTE_ID,
  PROPRESENTER_SMPTE_ROUTE_ID,
  readAudioInterfaceId,
  readAudioRoutingDefault,
  readSmpteBinding,
  routingRows,
  sessionRoutingIdentities,
  type SmpteSource,
  visibleSmpteInputCount,
  writeAudioChannelCount,
  writeAudioInterfaceId,
  writeAudioRoutingDefault,
} from "@/lib/audioRouting";
import { cn } from "@/lib/cn";
import { readChannelColorStore, resolveChannelTone } from "@/lib/channelColors";
import { readTalkbackBindings, writeTalkbackBindingStore } from "@/lib/liveMode";
import { createInputAudioContext, listSystemAudioInputs, probeInputChannelCount, type SystemAudioInput } from "@/lib/systemAudioInputs";
import type { LiveTalkbackChannel } from "@/hooks/useLiveSession";

type AudioRoutingPageProps = {
  sessionId: string | null;
  channels: LiveTalkbackChannel[];
  onClose: () => void;
  onBindingsChange: () => void;
};

const SMPTE_SOURCE_NAME: Record<SmpteSource, string> = {
  propresenter: "ProPresenter",
  playback: "Playback",
};

const SMPTE_SOURCE_SHORT: Record<SmpteSource, string> = {
  propresenter: "ProP",
  playback: "Playback",
};

type SmpteInputSelectProps = {
  source: SmpteSource;
  channels: Array<{ id: string; position_slot: string | null }>;
  channelCount: number | null;
  deviceId: string | null;
  revision: number;
  onAssigned: () => void;
  labeled?: boolean;
  className?: string;
};

export function SmpteInputSelect({
  source,
  channels,
  channelCount,
  deviceId,
  revision,
  onAssigned,
  labeled = false,
  className,
}: SmpteInputSelectProps) {
  void revision;
  const binding = deviceId ? readSmpteBinding(readTalkbackBindings(), source) : null;
  const selectedHere = binding && binding.deviceId === deviceId ? binding.channelIndex : null;
  const count = deviceId ? visibleSmpteInputCount(channelCount, selectedHere) : 0;
  const value = selectedHere == null ? "none" : String(selectedHere);

  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (!deviceId) return;
        const store = assignSmpteInput(
          readTalkbackBindings(),
          channels.map((channel) => ({ id: channel.id, positionSlot: channel.position_slot })),
          deviceId,
          next === "none" ? null : Number(next),
        );
        writeTalkbackBindingStore(store);
        onAssigned();
      }}
      disabled={!deviceId}
    >
      <SelectTrigger className={className || "h-9 w-full"} aria-label={`${SMPTE_SOURCE_NAME[source]} SMPTE input`}>
        {labeled ? <span className="mr-2 shrink-0 text-muted-foreground">{SMPTE_SOURCE_SHORT[source]}</span> : null}
        <SelectValue placeholder="Input" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">No input</SelectItem>
        {Array.from({ length: count }, (_, index) => (
          <SelectItem key={index} value={String(index)}>
            In {index + 1}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function assignmentColor(
  channels: LiveTalkbackChannel[],
  talkbackId: string | null,
): { label: string; positionSlot: string | null; fallbackIndex: number } | null {
  if (!talkbackId) return null;
  const index = channels.findIndex((channel) => channel.id === talkbackId);
  if (index >= 0) {
    const channel = channels[index];
    return { label: channel.label, positionSlot: channel.position_slot, fallbackIndex: index };
  }
  if (talkbackId === PLAYBACK_SMPTE_ROUTE_ID) {
    return { label: "Playback SMPTE", positionSlot: null, fallbackIndex: channels.length };
  }
  if (talkbackId === PROPRESENTER_SMPTE_ROUTE_ID) {
    return { label: "ProPresenter SMPTE", positionSlot: null, fallbackIndex: channels.length + 1 };
  }
  return null;
}

function ColorChoice({
  label,
  channelId,
  positionSlot,
  fallbackIndex,
}: {
  label: string;
  channelId: string;
  positionSlot: string | null;
  fallbackIndex: number;
}) {
  const tone = resolveChannelTone(readChannelColorStore(), channelId, positionSlot, fallbackIndex);
  return (
    <span className="flex items-center gap-2">
      <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", tone.dot)} aria-hidden />
      {label}
    </span>
  );
}

export function AudioRoutingPage({ sessionId, channels, onClose, onBindingsChange }: AudioRoutingPageProps) {
  const [inputs, setInputs] = useState<SystemAudioInput[]>([]);
  const [deviceId, setDeviceId] = useState(readAudioInterfaceId() || "");
  const [channelCount, setChannelCount] = useState<number | null>(null);
  const [busy, setBusy] = useState<"list" | "probe" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [defaultSaved, setDefaultSaved] = useState(() => readAudioRoutingDefault() !== null);
  const [justSaved, setJustSaved] = useState(false);

  const identities = sessionRoutingIdentities(channels);
  const targets = identities.map((identity) => ({
    id: identity.id,
    positionSlot: identity.positionSlot,
  }));
  const rows = deviceId && channelCount
    ? routingRows(channelCount, targets, readTalkbackBindings(), deviceId)
    : [];

  const countChannels = async (nextDeviceId: string, context: AudioContext) => {
    setBusy("probe");
    setError(null);
    setChannelCount(null);
    try {
      const count = await probeInputChannelCount(nextDeviceId, context);
      setChannelCount(count);
      writeAudioChannelCount(count);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That input could not be opened.");
    } finally {
      void context.close();
      setBusy(null);
    }
  };

  const readInputs = async (context: AudioContext) => {
    setBusy("list");
    setError(null);
    try {
      const listed = await listSystemAudioInputs(true);
      setInputs(listed);
      const saved = deviceId && listed.some((input) => input.deviceId === deviceId) ? deviceId : listed[0]?.deviceId || "";
      if (!saved) {
        void context.close();
        return;
      }
      setDeviceId(saved);
      writeAudioInterfaceId(saved);
      await countChannels(saved, context);
    } catch (cause) {
      void context.close();
      setError(cause instanceof Error ? cause.message : "Microphone permission was blocked.");
    } finally {
      setBusy(null);
    }
  };

  const saveDefault = () => {
    if (!deviceId) return;
    const saved = captureAudioRoutingDefault(
      readTalkbackBindings(),
      identities,
      deviceId,
      channelCount,
      new Date().toISOString(),
    );
    writeAudioRoutingDefault(saved);
    if (sessionId) markRoutingDefaultApplied(sessionId, saved.savedAt);
    setDefaultSaved(true);
    setJustSaved(true);
  };

  const assign = (channelIndex: number, talkbackId: string) => {
    setJustSaved(false);
    const next = patchInput(
      readTalkbackBindings(),
      targets,
      deviceId,
      channelIndex,
      talkbackId === "unused" ? null : talkbackId,
    );
    writeTalkbackBindingStore(next);
    setRevision((value) => value + 1);
    onBindingsChange();
  };

  const selected = inputs.find((input) => input.deviceId === deviceId);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background text-foreground">
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <button type="button" aria-label="Back to Live Mode" onClick={onClose} className="rounded-md p-2 hover:bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">Audio routing</p>
          <p className="truncate text-sm font-semibold">Match board inputs to talkback and timecode</p>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <p className="text-sm text-muted-foreground">
          Inputs come from this Mac’s Audio MIDI Setup and Sound settings. Pick the interface that receives the sound board, then choose the Playback SMPTE input. Playback moves the songs. ProPresenter moves the other lines with MIDI notes from the service flow MIDI menu. The color beside an input is that talkback’s color on the mixer and in captions.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={() => {
              const context = createInputAudioContext();
              void context.resume();
              void readInputs(context);
            }}
            disabled={busy !== null}
          >
            {busy === "list" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Read system inputs
          </Button>
          <Button type="button" variant="outline" onClick={saveDefault} disabled={!deviceId || busy !== null}>
            Save as default
          </Button>
        </div>
        {justSaved ? (
          <p className="text-sm text-muted-foreground">
            Saved. Every Live session in this browser starts with this routing.
          </p>
        ) : defaultSaved ? (
          <p className="text-sm text-muted-foreground">
            A default is saved. Every Live session in this browser starts with it.
          </p>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {inputs.length > 0 ? (
          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Interface</span>
            <Select
              value={deviceId}
              onValueChange={(value) => {
                const context = createInputAudioContext();
                void context.resume();
                setJustSaved(false);
                setDeviceId(value);
                writeAudioInterfaceId(value);
                void countChannels(value, context);
              }}
            >
              <SelectTrigger aria-label="Audio interface">
                <SelectValue placeholder="Choose an input" />
              </SelectTrigger>
              <SelectContent>
                {inputs.map((input) => (
                  <SelectItem key={input.deviceId} value={input.deviceId}>
                    {input.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        ) : null}

        {busy === "probe" ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Counting inputs on {selected?.label || "this interface"}…
          </p>
        ) : null}

        {channelCount !== null && channelCount <= 2 ? (
          <p className="rounded-xl border border-border bg-muted/40 px-3 py-3 text-sm text-muted-foreground">
            This browser opened {selected?.label || "this interface"} as {channelCount === 1 ? "a single channel" : "a stereo pair"}. In Audio MIDI Setup, set that input to 48 channels at 48 kHz, then reload Live in Safari.
          </p>
        ) : null}

        {deviceId ? (
          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Playback SMPTE
            </span>
            <SmpteInputSelect
              source="playback"
              channels={channels}
              channelCount={channelCount}
              deviceId={deviceId}
              revision={revision}
              onAssigned={() => {
                setJustSaved(false);
                setRevision((value) => value + 1);
                onBindingsChange();
              }}
            />
          </label>
        ) : null}

        {rows.length > 0 ? (
          <ul className="space-y-2" data-revision={revision}>
            {rows.map((row) => {
              const assignment = assignmentColor(channels, row.talkbackId);
              const tone = assignment
                ? resolveChannelTone(
                    readChannelColorStore(),
                    row.talkbackId || "",
                    assignment.positionSlot,
                    assignment.fallbackIndex,
                  )
                : null;
              return (
                <li key={row.inputNumber} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2">
                  {assignment && tone ? (
                    <ChannelColorButton
                      channelId={row.talkbackId || ""}
                      positionSlot={assignment.positionSlot}
                      fallbackIndex={assignment.fallbackIndex}
                      label={assignment.label}
                      onChange={() => {
                        setRevision((value) => value + 1);
                        onBindingsChange();
                      }}
                    />
                  ) : (
                    <span className="h-7 w-7 shrink-0 rounded-full border border-dashed border-border" aria-hidden />
                  )}
                  <span className={cn("w-14 shrink-0 text-lg font-bold tabular-nums", tone?.name)}>
                    In {row.inputNumber}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Select value={row.talkbackId || "unused"} onValueChange={(value) => assign(row.channelIndex, value)}>
                      <SelectTrigger aria-label={`Input ${row.inputNumber} talkback`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unused">Unused</SelectItem>
                        <SelectItem value={PLAYBACK_SMPTE_ROUTE_ID}>
                          <ColorChoice
                            label="Playback SMPTE"
                            channelId={PLAYBACK_SMPTE_ROUTE_ID}
                            positionSlot={null}
                            fallbackIndex={channels.length}
                          />
                        </SelectItem>
                        <SelectItem value={PROPRESENTER_SMPTE_ROUTE_ID}>
                          <ColorChoice
                            label="ProPresenter SMPTE"
                            channelId={PROPRESENTER_SMPTE_ROUTE_ID}
                            positionSlot={null}
                            fallbackIndex={channels.length + 1}
                          />
                        </SelectItem>
                        {channels.map((channel, index) => (
                          <SelectItem key={channel.id} value={channel.id}>
                            <ColorChoice
                              label={channel.label}
                              channelId={channel.id}
                              positionSlot={channel.position_slot}
                              fallbackIndex={index}
                            />
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
