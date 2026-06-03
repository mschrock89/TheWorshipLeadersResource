import { useEffect, useRef, useCallback } from "react";
import { useStemPlayer } from "@/hooks/useStemPlayer";

interface StemMixWaveformProps {
  onSeek: (seconds: number) => void;
}

const WAVEFORM_SAMPLES = 300;
// Only examine every Nth sample per bucket — gives accurate peaks at ~1% of the cost
const STRIDE = 128;

export function StemMixWaveform({ onSeek }: StemMixWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { currentTime, duration, audioBuffers, loadStates } = useStemPlayer();
  const peakDataRef = useRef<Float32Array | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const computePeaks = useCallback(() => {
    // Defer off the render cycle so we never block the UI thread
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const buffers = Object.values(audioBuffers.current).filter(
        (b): b is AudioBuffer => !!b
      );
      if (buffers.length === 0) {
        peakDataRef.current = null;
        return;
      }

      const maxLen = Math.max(...buffers.map((b) => b.length));
      const samplesPerSlice = Math.floor(maxLen / WAVEFORM_SAMPLES);
      const peaks = new Float32Array(WAVEFORM_SAMPLES);

      for (let i = 0; i < WAVEFORM_SAMPLES; i++) {
        const start = i * samplesPerSlice;
        let sum = 0;
        let count = 0;
        for (const buffer of buffers) {
          const ch = buffer.getChannelData(0);
          let max = 0;
          // Stride through the slice instead of every sample
          for (let j = 0; j < samplesPerSlice; j += STRIDE) {
            const idx = start + j;
            if (idx >= ch.length) break;
            const abs = Math.abs(ch[idx]);
            if (abs > max) max = abs;
          }
          sum += max;
          count++;
        }
        peaks[i] = count > 0 ? sum / count : 0;
      }

      // Normalize
      let maxPeak = 0;
      for (let i = 0; i < peaks.length; i++) if (peaks[i] > maxPeak) maxPeak = peaks[i];
      if (maxPeak > 0) for (let i = 0; i < peaks.length; i++) peaks[i] /= maxPeak;

      peakDataRef.current = peaks;
    }, 50);
  }, [audioBuffers]);

  // Recompute when stems finish loading; stable loadStates ref avoids infinite loops
  const loadedCount = Object.values(loadStates).filter((s) => s === "ready").length;
  useEffect(() => {
    computePeaks();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedCount]);

  // Redraw on every time tick
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const progress = duration > 0 ? currentTime / duration : 0;
    const playedX = progress * W;
    const peaks = peakDataRef.current;
    const mid = H / 2;

    // Resolve --primary CSS var to a concrete hsl() string for canvas use
    const primaryHsl = getComputedStyle(document.documentElement)
      .getPropertyValue("--primary")
      .trim();
    // primaryHsl is "H S% L%" — wrap it
    const primarySolid = `hsl(${primaryHsl})`;
    const primaryFaded = `hsla(${primaryHsl}, 0.45)`;

    if (!peaks) {
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, mid);
      ctx.lineTo(W, mid);
      ctx.stroke();
    } else {
      const barW = W / WAVEFORM_SAMPLES;

      // Unplayed gradient
      const unplayedGrad = ctx.createLinearGradient(0, 0, 0, H);
      unplayedGrad.addColorStop(0, "rgba(255,255,255,0.08)");
      unplayedGrad.addColorStop(0.5, "rgba(255,255,255,0.18)");
      unplayedGrad.addColorStop(1, "rgba(255,255,255,0.08)");

      // Played gradient
      const playedGrad = ctx.createLinearGradient(0, 0, 0, H);
      playedGrad.addColorStop(0, primaryFaded);
      playedGrad.addColorStop(0.5, primarySolid);
      playedGrad.addColorStop(1, primaryFaded);

      for (let i = 0; i < WAVEFORM_SAMPLES; i++) {
        const x = i * barW;
        const barH = Math.max(2, peaks[i] * H * 0.82);
        ctx.fillStyle = x < playedX ? playedGrad : unplayedGrad;
        ctx.beginPath();
        ctx.roundRect(x + 0.5, mid - barH / 2, Math.max(1, barW - 1.5), barH, 1.5);
        ctx.fill();
      }
    }

    // Playhead
    if (duration > 0 && playedX > 0) {
      ctx.strokeStyle = "rgba(255,255,255,0.75)";
      ctx.lineWidth = 1.5;
      ctx.shadowColor = "rgba(255,255,255,0.4)";
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.moveTo(playedX, 0);
      ctx.lineTo(playedX, H);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }, [currentTime, duration]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (duration === 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = Math.max(0, Math.min((e.clientX - rect.left) / rect.width, 1));
      onSeek(ratio * duration);
    },
    [onSeek, duration]
  );

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={52}
      className="w-full h-full cursor-pointer"
      onClick={handleClick}
    />
  );
}
