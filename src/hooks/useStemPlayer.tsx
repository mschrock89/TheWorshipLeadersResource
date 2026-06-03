import React, {
  createContext,
  useContext,
  useRef,
  useState,
  useCallback,
  useEffect,
} from "react";
import { StemType } from "@/hooks/useSetlistStems";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StemPlayerTrack {
  stemType: StemType;
  audioUrl: string;
  volume: number;       // 0–1 persisted value
  isMuted: boolean;     // persisted mute state
}

type LoadState = "idle" | "loading" | "ready" | "error";

interface StemPlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  loadStates: Record<StemType, LoadState>;
  soloedStem: StemType | null;
  // live mix (may differ from persisted until user saves)
  volumes: Record<StemType, number>;
  mutes: Record<StemType, boolean>;
}

interface StemPlayerContextType extends StemPlayerState {
  loadStems: (tracks: StemPlayerTrack[]) => Promise<void>;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  stop: () => void;
  seekTo: (seconds: number) => void;
  setVolume: (stemType: StemType, value: number) => void;
  setMute: (stemType: StemType, muted: boolean) => void;
  toggleSolo: (stemType: StemType) => void;
  getAnalyserNode: (stemType: StemType) => AnalyserNode | null;
  audioBuffers: React.MutableRefObject<Partial<Record<StemType, AudioBuffer>>>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const StemPlayerContext = createContext<StemPlayerContextType | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function StemPlayerProvider({ children }: { children: React.ReactNode }) {
  const audioCtxRef = useRef<AudioContext | null>(null);
  // Loaded audio buffers keyed by stem type
  const audioBuffers = useRef<Partial<Record<StemType, AudioBuffer>>>({});
  // Active source nodes (replaced on every play/seek)
  const sourceNodes = useRef<Partial<Record<StemType, AudioBufferSourceNode>>>({});
  // Gain nodes — one per stem, persistent across play sessions
  const gainNodes = useRef<Partial<Record<StemType, GainNode>>>({});
  // Analyser nodes for optional visualisation
  const analyserNodes = useRef<Partial<Record<StemType, AnalyserNode>>>({});

  // Track playback offset so we can seek correctly
  const startContextTime = useRef<number>(0);
  const startOffset = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  const [state, setState] = useState<StemPlayerState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    loadStates: {} as Record<StemType, LoadState>,
    soloedStem: null,
    volumes: {} as Record<StemType, number>,
    mutes: {} as Record<StemType, boolean>,
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  // ── helpers ──────────────────────────────────────────────────────────────

  function getOrCreateContext(): AudioContext {
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioContext();
    }
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }

  function stopAllSources() {
    Object.values(sourceNodes.current).forEach((node) => {
      try { node?.stop(); } catch { /* already stopped */ }
    });
    sourceNodes.current = {};
  }

  function effectiveGain(stemType: StemType, soloedStem: StemType | null, mutes: Record<StemType, boolean>, volumes: Record<StemType, number>): number {
    if (soloedStem && soloedStem !== stemType) return 0;
    if (mutes[stemType]) return 0;
    return volumes[stemType] ?? 1;
  }

  // ── rAF time update ──────────────────────────────────────────────────────

  const startRaf = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    const tick = () => {
      const elapsed = ctx.currentTime - startContextTime.current;
      const current = Math.min(startOffset.current + elapsed, stateRef.current.duration);
      setState((prev) => ({ ...prev, currentTime: current }));

      if (current >= stateRef.current.duration && stateRef.current.duration > 0) {
        setState((prev) => ({ ...prev, isPlaying: false, currentTime: prev.duration }));
        stopAllSources();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  function stopRaf() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }

  // ── loadStems ─────────────────────────────────────────────────────────────

  const loadStems = useCallback(async (tracks: StemPlayerTrack[]) => {
    stopAllSources();
    stopRaf();
    setState((prev) => ({
      ...prev,
      isPlaying: false,
      currentTime: 0,
      loadStates: Object.fromEntries(tracks.map((t) => [t.stemType, "loading"])) as Record<StemType, LoadState>,
      volumes: Object.fromEntries(tracks.map((t) => [t.stemType, t.volume])) as Record<StemType, number>,
      mutes: Object.fromEntries(tracks.map((t) => [t.stemType, t.isMuted])) as Record<StemType, boolean>,
      soloedStem: null,
    }));

    const ctx = getOrCreateContext();
    audioBuffers.current = {};

    // Build gain + analyser nodes once per session
    gainNodes.current = {};
    analyserNodes.current = {};
    for (const track of tracks) {
      const gain = ctx.createGain();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      gain.connect(analyser);
      analyser.connect(ctx.destination);
      gainNodes.current[track.stemType] = gain;
      analyserNodes.current[track.stemType] = analyser;
      gain.gain.value = effectiveGain(track.stemType, null, { [track.stemType]: track.isMuted } as Record<StemType, boolean>, { [track.stemType]: track.volume } as Record<StemType, number>);
    }

    // Fetch + decode in parallel
    const results = await Promise.allSettled(
      tracks.map(async (track) => {
        const res = await fetch(track.audioUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const arrayBuffer = await res.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        audioBuffers.current[track.stemType] = audioBuffer;
        setState((prev) => ({
          ...prev,
          loadStates: { ...prev.loadStates, [track.stemType]: "ready" },
        }));
        return { stemType: track.stemType, audioBuffer };
      })
    );

    // Set duration from the longest buffer
    const durations = results
      .filter((r): r is PromiseFulfilledResult<{ stemType: StemType; audioBuffer: AudioBuffer }> => r.status === "fulfilled")
      .map((r) => r.value.audioBuffer.duration);
    const maxDuration = durations.length > 0 ? Math.max(...durations) : 0;

    // Mark failed stems
    results.forEach((result, i) => {
      if (result.status === "rejected") {
        setState((prev) => ({
          ...prev,
          loadStates: { ...prev.loadStates, [tracks[i].stemType]: "error" },
        }));
      }
    });

    setState((prev) => ({ ...prev, duration: maxDuration }));
    startOffset.current = 0;
  }, []);

  // ── play ──────────────────────────────────────────────────────────────────

  const play = useCallback(() => {
    const ctx = getOrCreateContext();
    const { soloedStem, volumes, mutes, duration } = stateRef.current;

    if (duration === 0) return;

    stopAllSources();

    // Always read from startOffset.current — it is set synchronously by seekTo/pause/stop
    // before play() is called, so it is always accurate even when React state hasn't settled.
    const offset = Math.min(startOffset.current, duration);

    for (const [stemTypeStr, buffer] of Object.entries(audioBuffers.current)) {
      const stemType = stemTypeStr as StemType;
      const source = ctx.createBufferSource();
      source.buffer = buffer!;
      const gainNode = gainNodes.current[stemType];
      if (gainNode) {
        source.connect(gainNode);
        gainNode.gain.value = effectiveGain(stemType, soloedStem, mutes, volumes);
      } else {
        source.connect(ctx.destination);
      }
      source.start(0, offset);
      sourceNodes.current[stemType] = source;
    }

    startContextTime.current = ctx.currentTime;

    setState((prev) => ({ ...prev, isPlaying: true }));
    startRaf();
  }, [startRaf]);

  // ── pause ─────────────────────────────────────────────────────────────────

  const pause = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const elapsed = ctx.currentTime - startContextTime.current;
    startOffset.current = Math.min(startOffset.current + elapsed, stateRef.current.duration);
    stopAllSources();
    stopRaf();
    setState((prev) => ({ ...prev, isPlaying: false }));
  }, []);

  // ── togglePlay ────────────────────────────────────────────────────────────

  const togglePlay = useCallback(() => {
    if (stateRef.current.isPlaying) {
      pause();
    } else {
      play();
    }
  }, [play, pause]);

  // ── stop ──────────────────────────────────────────────────────────────────

  const stop = useCallback(() => {
    stopAllSources();
    stopRaf();
    startOffset.current = 0;
    setState((prev) => ({ ...prev, isPlaying: false, currentTime: 0 }));
  }, []);

  // ── seekTo ────────────────────────────────────────────────────────────────

  const seekTo = useCallback((seconds: number) => {
    const wasPlaying = stateRef.current.isPlaying;
    stopAllSources();
    stopRaf();
    startOffset.current = Math.max(0, Math.min(seconds, stateRef.current.duration));
    setState((prev) => ({ ...prev, currentTime: startOffset.current }));
    if (wasPlaying) play();
  }, [play]);

  // ── setVolume ─────────────────────────────────────────────────────────────

  const setVolume = useCallback((stemType: StemType, value: number) => {
    setState((prev) => {
      const volumes = { ...prev.volumes, [stemType]: value };
      const gainNode = gainNodes.current[stemType];
      if (gainNode) {
        gainNode.gain.value = effectiveGain(stemType, prev.soloedStem, prev.mutes, volumes);
      }
      return { ...prev, volumes };
    });
  }, []);

  // ── setMute ───────────────────────────────────────────────────────────────

  const setMute = useCallback((stemType: StemType, muted: boolean) => {
    setState((prev) => {
      const mutes = { ...prev.mutes, [stemType]: muted };
      const gainNode = gainNodes.current[stemType];
      if (gainNode) {
        gainNode.gain.value = effectiveGain(stemType, prev.soloedStem, mutes, prev.volumes);
      }
      return { ...prev, mutes };
    });
  }, []);

  // ── toggleSolo ────────────────────────────────────────────────────────────

  const toggleSolo = useCallback((stemType: StemType) => {
    setState((prev) => {
      const newSolo = prev.soloedStem === stemType ? null : stemType;
      // Update all gain nodes immediately
      for (const [st, gainNode] of Object.entries(gainNodes.current)) {
        if (gainNode) {
          gainNode.gain.value = effectiveGain(st as StemType, newSolo, prev.mutes, prev.volumes);
        }
      }
      return { ...prev, soloedStem: newSolo };
    });
  }, []);

  // ── getAnalyserNode ───────────────────────────────────────────────────────

  const getAnalyserNode = useCallback((stemType: StemType): AnalyserNode | null => {
    return analyserNodes.current[stemType] ?? null;
  }, []);

  // ── cleanup ───────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      stopAllSources();
      stopRaf();
      audioCtxRef.current?.close();
    };
  }, []);

  return (
    <StemPlayerContext.Provider
      value={{
        ...state,
        loadStems,
        play,
        pause,
        togglePlay,
        stop,
        seekTo,
        setVolume,
        setMute,
        toggleSolo,
        getAnalyserNode,
        audioBuffers,
      }}
    >
      {children}
    </StemPlayerContext.Provider>
  );
}

// ─── Consumer hook ────────────────────────────────────────────────────────────

export function useStemPlayer() {
  const ctx = useContext(StemPlayerContext);
  if (!ctx) throw new Error("useStemPlayer must be used within StemPlayerProvider");
  return ctx;
}
