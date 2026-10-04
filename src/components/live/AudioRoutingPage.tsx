import { useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  patchInput,
  readAudioInterfaceId,
  routingRows,
  SMPTE_ROUTE_ID,
  writeAudioInterfaceId,
} from "@/lib/audioRouting";
import { readTalkbackBindings, writeTalkbackBindingStore } from "@/lib/liveMode";
import { createInputAudioContext, listSystemAudioInputs, probeInputChannelCount, type SystemAudioInput } from "@/lib/systemAudioInputs";
import type { LiveTalkbackChannel } from "@/hooks/useLiveSession";

type AudioRoutingPageProps = {
  channels: LiveTalkbackChannel[];
  onClose: () => void;
  onBindingsChange: () => void;
};

export function AudioRoutingPage({ channels, onClose, onBindingsChange }: AudioRoutingPageProps) {
  const [inputs, setInputs] = useState<SystemAudioInput[]>([]);
  const [deviceId, setDeviceId] = useState(readAudioInterfaceId() || "");
  const [channelCount, setChannelCount] = useState<number | null>(null);
  const [busy, setBusy] = useState<"list" | "probe" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  const targets = [
    ...channels.map((channel) => ({
      id: channel.id,
      positionSlot: channel.position_slot,
    })),
    { id: SMPTE_ROUTE_ID, positionSlot: null },
  ];
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

  const assign = (channelIndex: number, talkbackId: string) => {
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
          Inputs come from this Mac’s Audio MIDI Setup and Sound settings. Pick the interface that receives the sound board, assign talkback names, and assign Timecode to the input that carries SMPTE. ProPresenter and Playback can both feed that same input. Only one of them should be sending at a time.
        </p>

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
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {inputs.length > 0 ? (
          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Interface</span>
            <Select
              value={deviceId}
              onValueChange={(value) => {
                const context = createInputAudioContext();
                void context.resume();
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

        {rows.length > 0 ? (
          <ul className="space-y-2" data-revision={revision}>
            {rows.map((row) => (
              <li key={row.inputNumber} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2">
                <span className="w-16 shrink-0 text-lg font-bold tabular-nums">In {row.inputNumber}</span>
                <Select value={row.talkbackId || "unused"} onValueChange={(value) => assign(row.channelIndex, value)}>
                  <SelectTrigger aria-label={`Input ${row.inputNumber} talkback`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unused">Unused</SelectItem>
                    <SelectItem value={SMPTE_ROUTE_ID}>Timecode</SelectItem>
                    {channels.map((channel) => (
                      <SelectItem key={channel.id} value={channel.id}>
                        {channel.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
