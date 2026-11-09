import { useEffect, useMemo, useRef, useState } from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { haptic } from "@/lib/haptics";

const SPARK_COLORS = ["#fde68a", "#67e8f9", "#fb7185", "#c4b5fd", "#ffffff"];

function ScoreFigure({
  label,
  value,
  featured = false,
}: {
  label: string;
  value: number | string;
  featured?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p
        className={`font-display font-semibold leading-none tabular-nums ${
          featured
            ? "text-4xl text-foreground min-[480px]:text-5xl"
            : "text-2xl text-foreground/80 min-[480px]:text-3xl"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

export function GameScoreReadout({
  scoreLabel = "Score",
  score,
  best,
  extras = [],
}: {
  scoreLabel?: string;
  score: number;
  best: number;
  extras?: { label: string; value: number | string }[];
}) {
  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-1 sm:gap-x-6">
      <ScoreFigure label={scoreLabel} value={score} featured />
      <ScoreFigure label="Best" value={best} featured />
      {extras.map((item) => (
        <ScoreFigure key={item.label} label={item.label} value={item.value} />
      ))}
    </div>
  );
}

export function GameOverCelebration({
  score,
  best,
  detail,
  onPlayAgain,
}: {
  score: number;
  best: number;
  detail?: string;
  onPlayAgain: () => void;
}) {
  const previousBestRef = useRef(best);
  const [shownScore, setShownScore] = useState(0);
  const previousBest = previousBestRef.current;
  const isNewBest = score > previousBest && score > 0;

  useEffect(() => {
    haptic(isNewBest ? "heavy" : "medium");
    const start = performance.now();
    const duration = 900;
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - progress) ** 3;
      setShownScore(Math.round(score * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isNewBest, score]);

  const sparks = useMemo(
    () =>
      Array.from({ length: 18 }, (_, index) => {
        const angle = (Math.PI * 2 * index) / 18;
        const distance = 88 + (index % 5) * 26;
        return {
          dx: `${Math.cos(angle) * distance}px`,
          dy: `${Math.sin(angle) * distance}px`,
          delay: `${(index % 6) * 45}ms`,
          color: SPARK_COLORS[index % SPARK_COLORS.length],
          size: 7 + (index % 4) * 3,
        };
      }),
    [],
  );

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 p-4">
      <style>{`
        @keyframes game-card-in {
          0% { transform: translateY(18px) scale(0.9); opacity: 0; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes game-score-in {
          0% { transform: scale(0.2) rotate(-8deg); opacity: 0; }
          60% { transform: scale(1.16) rotate(2deg); opacity: 1; }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes game-spark {
          0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          100% { transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(0.15); opacity: 0; }
        }
        .game-card-in { animation: game-card-in 420ms cubic-bezier(0.16, 1, 0.3, 1) both; }
        .game-score-in { animation: game-score-in 700ms cubic-bezier(0.16, 1, 0.3, 1) both; }
      `}</style>
      <div className="game-card-in relative w-full max-w-sm rounded-3xl border border-white/15 bg-zinc-950/95 px-6 py-7 text-center text-white shadow-2xl">
        <div className="pointer-events-none absolute left-1/2 top-24 h-0 w-0">
          {sparks.map((spark, index) => (
            <span
              key={index}
              className="absolute left-0 top-0 rounded-full"
              style={{
                width: spark.size,
                height: spark.size,
                background: spark.color,
                ["--dx" as string]: spark.dx,
                ["--dy" as string]: spark.dy,
                animation: `game-spark 900ms ${spark.delay} ease-out both`,
              }}
            />
          ))}
        </div>

        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-amber-200">
          {isNewBest ? "New best!" : "Game over"}
        </p>
        <p className="game-score-in mt-3 font-display text-7xl font-semibold leading-none tabular-nums sm:text-8xl">
          {shownScore}
        </p>
        <p className="mt-3 text-base text-white/70">
          Best {isNewBest ? score : previousBest}
          {detail ? ` · ${detail}` : ""}
        </p>
        <Button
          type="button"
          onClick={() => {
            haptic("light");
            onPlayAgain();
          }}
          className="mt-6 h-14 w-full gap-2 rounded-full text-lg font-semibold [&_svg]:size-5"
        >
          <Play />
          Play Again
        </Button>
      </div>
    </div>
  );
}
