import { useEffect, useRef, useCallback } from "react";
import { useStemPlayer } from "@/hooks/useStemPlayer";
import { StemType } from "@/hooks/useSetlistStems";

interface StemWaveformProps {
  stemType: StemType;
  color: string;
  /** Called when user clicks the waveform to seek */
  onSeek?: (seconds: number) => void;
}

const WAVEFORM_SAMPLES = 300;

export function StemWaveform({ stemType, color, onSeek }: StemWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { currentTime, duration, audioBuffers } = useStemPlayer();

  // Pre-compute peak data from the AudioBuffer
  const peakDataRef = useRef<Float32Array | null>(null);
  const audioBuffer = audioBuffers.current[stemType];

  const computePeaks = useCallback(() => {
    const buffer = audioBuffer;
    if (!buffer) return;

    const channelData = buffer.getChannelData(0);
    const samplesPerSlice = Math.floor(channelData.length / WAVEFORM_SAMPLES);
    const peaks = new Float32Array(WAVEFORM_SAMPLES);

    for (let i = 0; i < WAVEFORM_SAMPLES; i++) {
      let max = 0;
      const start = i * samplesPerSlice;
      for (let j = 0; j < samplesPerSlice; j++) {
        const abs = Math.abs(channelData[start + j]);
        if (abs > max) max = abs;
      }
      peaks[i] = max;
    }
    peakDataRef.current = peaks;
  }, [audioBuffer]);

  // Re-compute peaks when buffer changes
  useEffect(() => {
    computePeaks();
  }, [computePeaks]);

  // Draw on every currentTime change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    const peaks = peakDataRef.current;
    if (!peaks) {
      // No buffer yet — draw an empty flat line
      ctx.strokeStyle = `${color}30`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
      return;
    }

    const progress = duration > 0 ? currentTime / duration : 0;
    const playedWidth = progress * width;

    const barWidth = width / WAVEFORM_SAMPLES;
    const mid = height / 2;

    for (let i = 0; i < WAVEFORM_SAMPLES; i++) {
      const x = i * barWidth;
      const barH = Math.max(2, peaks[i] * height * 0.85);
      const isPlayed = x < playedWidth;

      ctx.fillStyle = isPlayed ? color : `${color}40`;
      ctx.beginPath();
      ctx.roundRect(x + 0.5, mid - barH / 2, Math.max(1, barWidth - 1), barH, 1);
      ctx.fill();
    }

    // Playhead line
    if (duration > 0) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(playedWidth, 0);
      ctx.lineTo(playedWidth, height);
      ctx.stroke();
    }
  }, [currentTime, duration, color]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!onSeek || duration === 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      onSeek(ratio * duration);
    },
    [onSeek, duration]
  );

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={48}
      className="w-full h-full"
      style={{ cursor: onSeek ? "pointer" : "default" }}
      onClick={handleClick}
    />
  );
}
