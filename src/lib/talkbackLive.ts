import { supabase } from "@/integrations/supabase/client";
import { downsampleMono, encodePcm16Base64 } from "./talkbackPcm.ts";
import { talkbackFunctionUrl } from "./transcribeTalkback.ts";

const LIVE_RATE = 24000;
const SOCKET_URL = "wss://api.openai.com/v1/realtime?intent=transcription";
const PROMPT =
  "Worship production talkback. Short cues from stage positions to front of house and monitors, such as more click, vocals up, ready for the bridge, kill the pad.";

type LiveHandlers = {
  onPartial: (channelId: string, text: string) => void;
  onFinal: (channelId: string, text: string) => void;
  fallback: (channelId: string, wav: Blob) => Promise<void>;
};

type WaitingTurn = {
  wav: Blob | null;
  handled: boolean;
  timer: number;
};

type ChannelState = {
  socket: WebSocket | null;
  connecting: boolean;
  ready: boolean;
  failed: boolean;
  stopped: boolean;
  pending: Float32Array[];
  hadAudio: boolean;
  finishing: boolean;
  wav: Blob | null;
  partials: Map<string, string>;
  waiting: WaitingTurn[];
  earlyFinal: string | null;
  skipCompletions: number;
  readyTimer: number;
};

type LiveEvent = {
  type?: string;
  delta?: string;
  transcript?: string;
  item_id?: string;
  error?: { code?: string; message?: string };
};

function blankChannel(): ChannelState {
  return {
    socket: null,
    connecting: false,
    ready: false,
    failed: false,
    stopped: false,
    pending: [],
    hadAudio: false,
    finishing: false,
    wav: null,
    partials: new Map(),
    waiting: [],
    earlyFinal: null,
    skipCompletions: 0,
    readyTimer: 0,
  };
}

function parseLiveEvent(data: unknown): LiveEvent | null {
  if (typeof data !== "string") return null;
  try {
    const payload = JSON.parse(data) as LiveEvent;
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
}

async function fetchTalkbackLiveToken(): Promise<{ value: string; expiresAt: number } | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  const response = await fetch(talkbackFunctionUrl("talkback-live-session"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  const payload = (await response.json().catch(() => null)) as { token?: string; expires_at?: number } | null;
  if (!response.ok || !payload?.token) return null;
  return { value: payload.token, expiresAt: Number(payload.expires_at) || 0 };
}

export function startTalkbackLive(handlers: LiveHandlers) {
  let stopped = false;
  let disabled = false;
  let token: { value: string; expiresAt: number } | null = null;
  let tokenTask: Promise<string | null> | null = null;
  const channels = new Map<string, ChannelState>();

  const ensure = (channelId: string) => {
    let state = channels.get(channelId);
    if (!state) {
      state = blankChannel();
      channels.set(channelId, state);
    }
    return state;
  };

  const send = (state: ChannelState, payload: unknown) => {
    if (state.socket?.readyState !== WebSocket.OPEN) return false;
    state.socket.send(JSON.stringify(payload));
    return true;
  };

  const finishTurn = (channelId: string, state: ChannelState, transcript: string) => {
    if (state.skipCompletions > 0) {
      state.skipCompletions -= 1;
      return;
    }
    const turn = state.waiting[0];
    if (!turn || turn.handled) return;
    turn.handled = true;
    window.clearTimeout(turn.timer);
    state.waiting.shift();
    const text = transcript.trim();
    if (text) handlers.onFinal(channelId, text);
    else handlers.onPartial(channelId, "");
  };

  const fallbackTurn = (channelId: string, state: ChannelState, wav: Blob | null) => {
    if (stopped || state.stopped || !wav || wav.size < 1500) return;
    void handlers.fallback(channelId, wav).catch(() => undefined);
  };

  const failWaiting = (channelId: string, state: ChannelState) => {
    const pending = state.waiting.splice(0);
    for (const turn of pending) {
      if (turn.handled) continue;
      turn.handled = true;
      window.clearTimeout(turn.timer);
      fallbackTurn(channelId, state, turn.wav);
    }
  };

  const flush = (channelId: string, state: ChannelState) => {
    if (stopped || state.stopped || state.failed || !state.ready) return;
    if (state.pending.length) {
      const chunks = state.pending;
      state.pending = [];
      for (const chunk of chunks) {
        const audio = encodePcm16Base64(chunk);
        if (!audio) continue;
        if (send(state, { type: "input_audio_buffer.append", audio })) state.hadAudio = true;
        else state.pending.push(chunk);
      }
    }
    if (!state.finishing) return;
    const wav = state.wav;
    state.finishing = false;
    state.wav = null;
    if (!state.hadAudio) {
      fallbackTurn(channelId, state, wav);
      return;
    }
    if (!send(state, { type: "input_audio_buffer.commit" })) {
      fallbackTurn(channelId, state, wav);
      state.hadAudio = false;
      return;
    }
    state.hadAudio = false;
    const turn: WaitingTurn = { wav, handled: false, timer: 0 };
    turn.timer = window.setTimeout(() => {
      if (turn.handled || stopped || state.stopped) return;
      turn.handled = true;
      state.skipCompletions += 1;
      state.waiting = state.waiting.filter((entry) => entry !== turn);
      fallbackTurn(channelId, state, wav);
    }, 6000);
    state.waiting.push(turn);
    if (state.earlyFinal !== null) {
      const transcript = state.earlyFinal;
      state.earlyFinal = null;
      finishTurn(channelId, state, transcript);
    }
  };

  const mint = () => {
    if (disabled) return Promise.resolve(null);
    if (token && token.expiresAt * 1000 > Date.now() + 60_000) return Promise.resolve(token.value);
    if (!tokenTask) {
      tokenTask = fetchTalkbackLiveToken()
        .then((next) => {
          token = next;
          if (!next) disabled = true;
          return next?.value || null;
        })
        .catch(() => {
          disabled = true;
          return null;
        })
        .finally(() => {
          tokenTask = null;
        });
    }
    return tokenTask;
  };

  const connect = async (channelId: string, state: ChannelState) => {
    if (stopped || disabled || state.failed || state.stopped || state.connecting || state.socket) return;
    state.connecting = true;
    const secret = await mint();
    state.connecting = false;
    if (stopped || state.stopped) return;
    if (!secret || state.failed) {
      state.failed = true;
      if (state.finishing) {
        const wav = state.wav;
        state.finishing = false;
        state.wav = null;
        fallbackTurn(channelId, state, wav);
      }
      failWaiting(channelId, state);
      return;
    }

    let socket: WebSocket;
    try {
      socket = new WebSocket(SOCKET_URL, ["realtime", `openai-insecure-api-key.${secret}`]);
    } catch {
      state.failed = true;
      if (state.finishing) {
        const wav = state.wav;
        state.finishing = false;
        state.wav = null;
        fallbackTurn(channelId, state, wav);
      }
      return;
    }
    state.socket = socket;

    socket.onopen = () => {
      if (state.socket !== socket) return;
      send(state, {
        type: "session.update",
        session: {
          type: "transcription",
          audio: {
            input: {
              format: { type: "audio/pcm", rate: LIVE_RATE },
              transcription: {
                model: "gpt-live-transcribe",
                prompt: PROMPT,
                languages: ["en"],
                delay: "minimal",
              },
              turn_detection: null,
            },
          },
        },
      });
      state.readyTimer = window.setTimeout(() => {
        if (state.socket !== socket || state.ready) return;
        state.ready = true;
        flush(channelId, state);
      }, 800);
    };

    socket.onmessage = (event) => {
      if (state.socket !== socket) return;
      const message = parseLiveEvent(event.data);
      if (!message?.type) return;
      if (message.type === "session.updated" || message.type === "transcription_session.updated") {
        window.clearTimeout(state.readyTimer);
        state.ready = true;
        flush(channelId, state);
        return;
      }
      if (message.type === "conversation.item.input_audio_transcription.delta") {
        const itemId = message.item_id || "open";
        const delta = message.delta || "";
        if (!delta) return;
        const next = `${state.partials.get(itemId) || ""}${delta}`;
        state.partials.set(itemId, next);
        handlers.onPartial(channelId, next);
        return;
      }
      if (message.type === "conversation.item.input_audio_transcription.completed") {
        const itemId = message.item_id || "";
        const transcript = message.transcript || (itemId ? state.partials.get(itemId) : "") || "";
        if (itemId) state.partials.delete(itemId);
        if (!state.waiting.length) {
          state.earlyFinal = transcript;
          if (transcript.trim()) handlers.onPartial(channelId, transcript);
          return;
        }
        finishTurn(channelId, state, transcript);
        return;
      }
      if (message.type === "error") {
        const detail = `${message.error?.code || ""} ${message.error?.message || ""}`;
        if (/model|invalid_api_key|unknown_parameter/i.test(detail)) disabled = true;
        state.failed = true;
        window.clearTimeout(state.readyTimer);
        try {
          socket.close();
        } catch {
          // The socket is already closing.
        }
        if (state.finishing) {
          const wav = state.wav;
          state.finishing = false;
          state.wav = null;
          fallbackTurn(channelId, state, wav);
        }
        failWaiting(channelId, state);
      }
    };

    socket.onclose = () => {
      window.clearTimeout(state.readyTimer);
      if (state.socket === socket) state.socket = null;
      state.ready = false;
      state.connecting = false;
      if (stopped || state.stopped) return;
      if (state.finishing) {
        const wav = state.wav;
        state.finishing = false;
        state.wav = null;
        fallbackTurn(channelId, state, wav);
      }
      failWaiting(channelId, state);
    };
  };

  return {
    warm(channelIds: string[]) {
      if (stopped || disabled) return;
      void mint();
      for (const channelId of channelIds) void connect(channelId, ensure(channelId));
    },
    push(channelId: string, samples: Float32Array, sampleRate: number) {
      if (stopped || disabled || samples.length === 0) return;
      const state = ensure(channelId);
      if (state.failed || state.stopped) return;
      const converted = downsampleMono(samples, sampleRate, LIVE_RATE);
      state.pending.push(converted === samples ? new Float32Array(samples) : converted);
      if (!state.socket && !state.connecting) void connect(channelId, state);
      flush(channelId, state);
    },
    end(channelId: string, wav: Blob) {
      if (stopped) return;
      const state = ensure(channelId);
      if (disabled || state.failed || (!state.hadAudio && state.pending.length === 0 && !state.connecting && !state.socket)) {
        fallbackTurn(channelId, state, wav);
        return;
      }
      state.wav = wav;
      state.finishing = true;
      if (!state.socket && !state.connecting) void connect(channelId, state);
      flush(channelId, state);
    },
    stop() {
      stopped = true;
      for (const state of channels.values()) {
        state.stopped = true;
        window.clearTimeout(state.readyTimer);
        for (const turn of state.waiting) window.clearTimeout(turn.timer);
        state.waiting = [];
        try {
          state.socket?.close();
        } catch {
          // The socket is already closed.
        }
        state.socket = null;
      }
      channels.clear();
    },
  };
}

export type TalkbackLiveSession = ReturnType<typeof startTalkbackLive>;
