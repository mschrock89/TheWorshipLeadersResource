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

// Shared mix math: a stem is silent when another stem is soloed or it is muted.
function effectiveGain(
  stemType: StemType,
  soloedStem: StemType | null,
  mutes: Record<StemType, boolean>,
  volumes: Record<StemType, number>,
): number {
  if (soloedStem && soloedStem !== stemType) return 0;
  if (mutes[stemType]) return 0;
  return volumes[stemType] ?? 1;
}

// ─── Engine selection ─────────────────────────────────────────────────────────
//
// Decoding every stem into an in-memory AudioBuffer (raw PCM) is fine on desktop
// but is a memory bomb on phones — a handful of full-length stems can exceed
// iOS Safari's per-tab memory limit and crash the page ("A problem repeatedly
// occurred"). On mobile we therefore fall back to a streaming engine that plays
// each stem from a lightweight <audio> element instead of holding decoded PCM.

function detectStreamingEngine(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ reports as desktop Safari but has touch points
    (navigator.platform === "MacIntel" && (navigator.maxTouchPoints ?? 0) > 1);
  const coarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const smallScreen = window.matchMedia?.("(max-width: 1024px)")?.matches ?? false;
  return isIOS || (coarsePointer && smallScreen);
}

// ─── Provider (engine selector) ───────────────────────────────────────────────

export function StemPlayerProvider({ children }: { children: React.ReactNode }) {
  // Resolve once at mount so the chosen engine never swaps underneath the player.
  const [useStreaming] = useState(detectStreamingEngine);
  return useStreaming ? (
    <StreamingStemPlayerProvider>{children}</StreamingStemPlayerProvider>
  ) : (
    <WebAudioStemPlayerProvider>{children}</WebAudioStemPlayerProvider>
  );
}

// ─── Web Audio engine (desktop — sample-accurate, decodes full buffers) ───────

function WebAudioStemPlayerProvider({ children }: { children: React.ReactNode }) {
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

// ─── Streaming engine (mobile/iOS — one <audio> element per stem, low memory) ─

function StreamingStemPlayerProvider({ children }: { children: React.ReactNode }) {
  // One <audio> element per stem. Streamed from network, so memory stays tiny.
  const audioEls = useRef<Partial<Record<StemType, HTMLAudioElement>>>({});
  // The longest stem drives the master clock / playhead.
  const masterStemRef = useRef<StemType | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastSyncRef = useRef<number>(0);

  // Kept only to satisfy the shared context shape — streaming holds no PCM, so the
  // waveform components fall back to a flat seek bar.
  const audioBuffers = useRef<Partial<Record<StemType, AudioBuffer>>>({});

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

  function stopRaf() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }

  function applyEffectiveVolume(
    stemType: StemType,
    soloedStem: StemType | null,
    mutes: Record<StemType, boolean>,
    volumes: Record<StemType, number>,
  ) {
    const el = audioEls.current[stemType];
    if (!el) return;
    el.volume = effectiveGain(stemType, soloedStem, mutes, volumes);
  }

  function getMasterEl(): HTMLAudioElement | null {
    const master = masterStemRef.current;
    if (master && audioEls.current[master]) return audioEls.current[master]!;
    const first = Object.values(audioEls.current).find(Boolean);
    return first ?? null;
  }

  const startRaf = useCallback(() => {
    const tick = () => {
      const master = getMasterEl();
      if (!master) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const current = master.currentTime;
      setState((prev) => ({ ...prev, currentTime: current }));

      // Gentle drift correction — at most ~once per second so we don't glitch.
      const now = performance.now();
      if (stateRef.current.isPlaying && now - lastSyncRef.current > 1000) {
        lastSyncRef.current = now;
        for (const el of Object.values(audioEls.current)) {
          if (!el || el === master || el.ended) continue;
          if (Math.abs(el.currentTime - current) > 0.18) {
            try { el.currentTime = current; } catch { /* not seekable yet */ }
          }
        }
      }

      if (master.ended) {
        setState((prev) => ({ ...prev, isPlaying: false, currentTime: prev.duration }));
        for (const el of Object.values(audioEls.current)) {
          try { el?.pause(); } catch { /* noop */ }
        }
        stopRaf();
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  function teardownElements() {
    for (const el of Object.values(audioEls.current)) {
      if (!el) continue;
      try {
        el.pause();
        el.removeAttribute("src");
        el.load();
      } catch { /* noop */ }
    }
    audioEls.current = {};
    masterStemRef.current = null;
  }

  // ── loadStems ─────────────────────────────────────────────────────────────

  const loadStems = useCallback(async (tracks: StemPlayerTrack[]) => {
    stopRaf();
    teardownElements();

    setState((prev) => ({
      ...prev,
      isPlaying: false,
      currentTime: 0,
      loadStates: Object.fromEntries(tracks.map((t) => [t.stemType, "loading"])) as Record<StemType, LoadState>,
      volumes: Object.fromEntries(tracks.map((t) => [t.stemType, t.volume])) as Record<StemType, number>,
      mutes: Object.fromEntries(tracks.map((t) => [t.stemType, t.isMuted])) as Record<StemType, boolean>,
      soloedStem: null,
      duration: 0,
    }));

    const initialVolumes = Object.fromEntries(tracks.map((t) => [t.stemType, t.volume])) as Record<StemType, number>;
    const initialMutes = Object.fromEntries(tracks.map((t) => [t.stemType, t.isMuted])) as Record<StemType, boolean>;

    const durations: Partial<Record<StemType, number>> = {};
    const recomputeDuration = () => {
      const values = Object.values(durations).filter((d): d is number => typeof d === "number" && isFinite(d));
      const maxDuration = values.length > 0 ? Math.max(...values) : 0;
      // Track which stem is longest so the playhead reaches the end.
      let longest: StemType | null = null;
      let longestVal = -1;
      for (const [st, d] of Object.entries(durations)) {
        if (typeof d === "number" && d > longestVal) {
          longestVal = d;
          longest = st as StemType;
        }
      }
      masterStemRef.current = longest;
      setState((prev) => ({ ...prev, duration: maxDuration }));
    };

    for (const track of tracks) {
      const el = new Audio();
      el.preload = "auto";
      el.crossOrigin = "anonymous";
      el.playsInline = true;
      el.setAttribute("playsinline", "true");
      el.setAttribute("webkit-playsinline", "true");
      el.volume = effectiveGain(track.stemType, null, initialMutes, initialVolumes);

      el.addEventListener("loadedmetadata", () => {
        durations[track.stemType] = el.duration;
        recomputeDuration();
      });
      el.addEventListener("canplay", () => {
        setState((prev) => ({
          ...prev,
          loadStates: { ...prev.loadStates, [track.stemType]: "ready" },
        }));
      });
      el.addEventListener("error", () => {
        setState((prev) => ({
          ...prev,
          loadStates: { ...prev.loadStates, [track.stemType]: "error" },
        }));
      });

      el.src = track.audioUrl;
      audioEls.current[track.stemType] = el;
    }
  }, []);

  // ── play ──────────────────────────────────────────────────────────────────

  const play = useCallback(() => {
    const master = getMasterEl();
    if (!master) return;
    const target = master.currentTime;

    for (const el of Object.values(audioEls.current)) {
      if (!el) continue;
      try {
        if (Math.abs(el.currentTime - target) > 0.05) el.currentTime = target;
      } catch { /* not seekable yet */ }
      void el.play().catch(() => { /* autoplay/gesture failure — ignore */ });
    }

    lastSyncRef.current = performance.now();
    setState((prev) => ({ ...prev, isPlaying: true }));
    startRaf();
  }, [startRaf]);

  // ── pause ─────────────────────────────────────────────────────────────────

  const pause = useCallback(() => {
    for (const el of Object.values(audioEls.current)) {
      try { el?.pause(); } catch { /* noop */ }
    }
    stopRaf();
    setState((prev) => ({ ...prev, isPlaying: false }));
  }, []);

  const togglePlay = useCallback(() => {
    if (stateRef.current.isPlaying) pause();
    else play();
  }, [play, pause]);

  const stop = useCallback(() => {
    for (const el of Object.values(audioEls.current)) {
      if (!el) continue;
      try { el.pause(); el.currentTime = 0; } catch { /* noop */ }
    }
    stopRaf();
    setState((prev) => ({ ...prev, isPlaying: false, currentTime: 0 }));
  }, []);

  const seekTo = useCallback((seconds: number) => {
    const clamped = Math.max(0, Math.min(seconds, stateRef.current.duration));
    for (const el of Object.values(audioEls.current)) {
      try { if (el) el.currentTime = clamped; } catch { /* noop */ }
    }
    setState((prev) => ({ ...prev, currentTime: clamped }));
  }, []);

  const setVolume = useCallback((stemType: StemType, value: number) => {
    setState((prev) => {
      const volumes = { ...prev.volumes, [stemType]: value };
      applyEffectiveVolume(stemType, prev.soloedStem, prev.mutes, volumes);
      return { ...prev, volumes };
    });
  }, []);

  const setMute = useCallback((stemType: StemType, muted: boolean) => {
    setState((prev) => {
      const mutes = { ...prev.mutes, [stemType]: muted };
      applyEffectiveVolume(stemType, prev.soloedStem, mutes, prev.volumes);
      return { ...prev, mutes };
    });
  }, []);

  const toggleSolo = useCallback((stemType: StemType) => {
    setState((prev) => {
      const newSolo = prev.soloedStem === stemType ? null : stemType;
      for (const st of Object.keys(audioEls.current) as StemType[]) {
        applyEffectiveVolume(st, newSolo, prev.mutes, prev.volumes);
      }
      return { ...prev, soloedStem: newSolo };
    });
  }, []);

  const getAnalyserNode = useCallback((): AnalyserNode | null => null, []);

  useEffect(() => {
    return () => {
      stopRaf();
      teardownElements();
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
