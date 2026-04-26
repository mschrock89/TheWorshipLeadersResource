import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { haptic } from "@/lib/haptics";
import { Play, Pause, RotateCcw, Gamepad2, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

type Point = { x: number; y: number };
type Direction = { x: number; y: number };

type LeaderboardRow = {
  user_id: string;
  score: number;
  updated_at: string;
};

type BasicProfile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
};

const BOARD_SIZE = 20;
const INITIAL_SNAKE: Point[] = [
  { x: 10, y: 10 },
  { x: 9, y: 10 },
  { x: 8, y: 10 },
];
const INITIAL_DIRECTION: Direction = { x: 1, y: 0 };

function getRandomFood(excluded: Point[]): Point {
  const blocked = new Set(excluded.map((part) => `${part.x},${part.y}`));

  for (let i = 0; i < 200; i += 1) {
    const candidate = {
      x: Math.floor(Math.random() * BOARD_SIZE),
      y: Math.floor(Math.random() * BOARD_SIZE),
    };

    if (!blocked.has(`${candidate.x},${candidate.y}`)) {
      return candidate;
    }
  }

  return { x: 0, y: 0 };
}

function isOpposite(a: Direction, b: Direction) {
  return a.x === -b.x && a.y === -b.y;
}

function getInitials(name: string | null | undefined) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function DirectionPad({
  onDirection,
  onCenter,
  compact = false,
}: {
  onDirection: (next: Direction) => void;
  onCenter: () => void;
  compact?: boolean;
}) {
  return (
    <div className={`relative mx-auto select-none ${compact ? "h-[205px] w-[205px]" : "h-[250px] w-[250px] sm:h-[320px] sm:w-[320px]"}`}>
      <div className={`absolute rounded-full bg-[radial-gradient(circle,rgba(53,176,229,0.38),rgba(39,116,157,0)_72%)] blur-2xl ${compact ? "inset-5" : "inset-6 sm:inset-8"}`} />

      <svg viewBox="0 0 320 320" className="absolute inset-0 h-full w-full drop-shadow-[0_24px_40px_rgba(30,8,66,0.55)]" aria-hidden="true">
        <defs>
          <linearGradient id="padBodyGradient" x1="160" y1="30" x2="160" y2="290" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#55C0ED" />
            <stop offset="55%" stopColor="#35B0E5" />
            <stop offset="100%" stopColor="#27749D" />
          </linearGradient>
          <linearGradient id="padCenterGradient" x1="160" y1="94" x2="160" y2="226" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#5CCAEF" />
            <stop offset="100%" stopColor="#008DB3" />
          </linearGradient>
        </defs>

        <path
          d="M123 22h74c13 0 24 11 24 24v56h56c13 0 24 11 24 24v68c0 13-11 24-24 24h-56v56c0 13-11 24-24 24h-74c-13 0-24-11-24-24v-56H43c-13 0-24-11-24-24v-68c0-13 11-24 24-24h56V46c0-13 11-24 24-24Z"
          fill="url(#padBodyGradient)"
          stroke="#93D6F1"
          strokeOpacity="0.85"
          strokeWidth="2"
        />

        <circle cx="160" cy="160" r="52" fill="url(#padCenterGradient)" stroke="#C1E7F7" strokeWidth="3" strokeOpacity="0.92" />
      </svg>

      <button
        onClick={() => {
          haptic("selection");
          onDirection({ x: 0, y: -1 });
        }}
        className={`absolute left-1/2 z-20 -translate-x-1/2 rounded-xl text-white active:scale-[0.985] ${compact ? "top-1 h-16 w-20" : "top-2 h-20 w-24 sm:top-4 sm:h-24 sm:w-28"}`}
      >
        <ChevronUp className={`mx-auto stroke-[2.6] ${compact ? "h-8 w-8" : "h-10 w-10 sm:h-12 sm:w-12"}`} />
      </button>
      <button
        onClick={() => {
          haptic("selection");
          onDirection({ x: -1, y: 0 });
        }}
        className={`absolute top-1/2 z-20 -translate-y-1/2 rounded-xl text-white active:scale-[0.985] ${compact ? "left-1 h-20 w-16" : "left-2 h-24 w-20 sm:left-4 sm:h-28 sm:w-24"}`}
      >
        <ChevronLeft className={`mx-auto stroke-[2.6] ${compact ? "h-8 w-8" : "h-10 w-10 sm:h-12 sm:w-12"}`} />
      </button>
      <button
        onClick={() => {
          haptic("selection");
          onDirection({ x: 1, y: 0 });
        }}
        className={`absolute top-1/2 z-20 -translate-y-1/2 rounded-xl text-white active:scale-[0.985] ${compact ? "right-1 h-20 w-16" : "right-2 h-24 w-20 sm:right-4 sm:h-28 sm:w-24"}`}
      >
        <ChevronRight className={`mx-auto stroke-[2.6] ${compact ? "h-8 w-8" : "h-10 w-10 sm:h-12 sm:w-12"}`} />
      </button>
      <button
        onClick={() => {
          haptic("selection");
          onDirection({ x: 0, y: 1 });
        }}
        className={`absolute bottom-0 left-1/2 z-20 -translate-x-1/2 rounded-xl text-white active:scale-[0.985] ${compact ? "h-16 w-20" : "bottom-2 h-20 w-24 sm:bottom-4 sm:h-24 sm:w-28"}`}
      >
        <ChevronDown className={`mx-auto stroke-[2.6] ${compact ? "h-8 w-8" : "h-10 w-10 sm:h-12 sm:w-12"}`} />
      </button>

      <button
        onClick={() => {
          haptic("light");
          onCenter();
        }}
        className={`absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2 rounded-full font-semibold leading-none text-white active:scale-[0.985] ${compact ? "h-[52px] w-[52px] text-lg" : "h-[62px] w-[62px] text-xl sm:h-[72px] sm:w-[72px] sm:text-2xl"}`}
      >
        <span className="relative -top-px">OK</span>
      </button>
    </div>
  );
}

export default function Snake() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [snake, setSnake] = useState<Point[]>(INITIAL_SNAKE);
  const [food, setFood] = useState<Point>(() => getRandomFood(INITIAL_SNAKE));
  const [direction, setDirection] = useState<Direction>(INITIAL_DIRECTION);
  const [score, setScore] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);

  const snakeRef = useRef(snake);
  const foodRef = useRef(food);
  const directionRef = useRef(direction);
  const scoreRef = useRef(score);
  const isRunningRef = useRef(isRunning);

  useEffect(() => {
    snakeRef.current = snake;
  }, [snake]);

  useEffect(() => {
    foodRef.current = food;
  }, [food]);

  useEffect(() => {
    directionRef.current = direction;
  }, [direction]);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  const leaderboardQuery = useQuery({
    queryKey: ["snake-leaderboard"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("snake_high_scores")
        .select("user_id, score, updated_at")
        .order("score", { ascending: false })
        .order("updated_at", { ascending: true })
        .limit(10);

      if (error) throw error;
      return (data ?? []) as LeaderboardRow[];
    },
    enabled: !!user,
  });

  const profilesQuery = useQuery({
    queryKey: ["snake-basic-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_basic_profiles");
      if (error) throw error;
      return (data ?? []) as BasicProfile[];
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 10,
  });

  const myBestQuery = useQuery({
    queryKey: ["snake-my-best", user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("snake_high_scores")
        .select("score")
        .eq("user_id", user?.id)
        .maybeSingle();

      if (error) throw error;
      return (data?.score as number | undefined) ?? 0;
    },
    enabled: !!user,
  });

  const saveHighScore = useMutation({
    mutationFn: async (finalScore: number) => {
      if (!user || finalScore <= 0) {
        return { improved: false, best: myBestQuery.data ?? 0 };
      }

      const { data: existing, error: existingError } = await (supabase as any)
        .from("snake_high_scores")
        .select("score")
        .eq("user_id", user.id)
        .maybeSingle();

      if (existingError) throw existingError;

      const currentBest = existing?.score ?? 0;
      if (finalScore <= currentBest) {
        return { improved: false, best: currentBest };
      }

      const { error: upsertError } = await (supabase as any)
        .from("snake_high_scores")
        .upsert({ user_id: user.id, score: finalScore }, { onConflict: "user_id" });

      if (upsertError) throw upsertError;

      return { improved: true, best: finalScore };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["snake-leaderboard"] });
      queryClient.invalidateQueries({ queryKey: ["snake-my-best", user?.id] });

      if (result.improved) {
        toast({
          title: "New personal best",
          description: `You set a new high score: ${result.best}`,
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Could not save score",
        description: error.message || "Your game still counts locally, but we could not update the leaderboard.",
        variant: "destructive",
      });
    },
  });

  const updateDirection = useCallback((next: Direction) => {
    const current = directionRef.current;
    if (isOpposite(current, next)) return;
    directionRef.current = next;
    setDirection(next);
  }, []);

  const resetGame = useCallback((startImmediately = false) => {
    const nextSnake = [...INITIAL_SNAKE];
    const nextFood = getRandomFood(nextSnake);

    setSnake(nextSnake);
    setFood(nextFood);
    setDirection(INITIAL_DIRECTION);
    directionRef.current = INITIAL_DIRECTION;
    setScore(0);
    setIsGameOver(false);
    setIsRunning(startImmediately);
    isRunningRef.current = startImmediately;
  }, []);

  const finishGame = useCallback(() => {
    isRunningRef.current = false;
    setIsRunning(false);
    setIsGameOver(true);
    void saveHighScore.mutateAsync(scoreRef.current);
  }, [saveHighScore]);

  const tick = useCallback(() => {
    if (!isRunningRef.current) return;

    const currentSnake = snakeRef.current;
    const currentDirection = directionRef.current;
    const nextHead: Point = {
      x: currentSnake[0].x + currentDirection.x,
      y: currentSnake[0].y + currentDirection.y,
    };

    const hitWall =
      nextHead.x < 0 ||
      nextHead.y < 0 ||
      nextHead.x >= BOARD_SIZE ||
      nextHead.y >= BOARD_SIZE;

    const hitSelf = currentSnake.some((segment) => segment.x === nextHead.x && segment.y === nextHead.y);

    if (hitWall || hitSelf) {
      finishGame();
      return;
    }

    const ateFood = nextHead.x === foodRef.current.x && nextHead.y === foodRef.current.y;
    const nextSnake = [nextHead, ...currentSnake];

    if (!ateFood) {
      nextSnake.pop();
    }

    setSnake(nextSnake);

    if (ateFood) {
      setScore((prev) => prev + 10);
      setFood(getRandomFood(nextSnake));
    }
  }, [finishGame]);

  const tickSpeed = useMemo(() => {
    const paceReduction = Math.floor(score / 50) * 6;
    return Math.max(90, 165 - paceReduction);
  }, [score]);

  useEffect(() => {
    if (!isRunning) return;

    const intervalId = window.setInterval(tick, tickSpeed);
    return () => window.clearInterval(intervalId);
  }, [isRunning, tick, tickSpeed]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d", "W", "A", "S", "D"].includes(event.key)) {
        event.preventDefault();
      }

      switch (event.key) {
        case "ArrowUp":
        case "w":
        case "W":
          updateDirection({ x: 0, y: -1 });
          break;
        case "ArrowDown":
        case "s":
        case "S":
          updateDirection({ x: 0, y: 1 });
          break;
        case "ArrowLeft":
        case "a":
        case "A":
          updateDirection({ x: -1, y: 0 });
          break;
        case "ArrowRight":
        case "d":
        case "D":
          updateDirection({ x: 1, y: 0 });
          break;
        case " ":
          setIsRunning((prev) => !prev);
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [updateDirection]);

  const leaderboard = leaderboardQuery.data ?? [];
  const profileById = useMemo(
    () => new Map((profilesQuery.data ?? []).map((profile) => [profile.id, profile])),
    [profilesQuery.data],
  );
  const myBest = myBestQuery.data ?? 0;
  const cellSizePercent = 100 / BOARD_SIZE;
  const isCompactPhone = typeof window !== "undefined" ? window.innerWidth <= 400 : false;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-start justify-between gap-3 max-[400px]:gap-2">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Snake</h1>
          <p className="text-sm text-muted-foreground sm:text-base">Simple arcade mode with a global top-10 leaderboard.</p>
        </div>
        <Gamepad2 className="h-7 w-7 shrink-0 text-primary sm:h-8 sm:w-8" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader className="px-4 pb-2 pt-4 sm:px-6 sm:pb-3 sm:pt-6">
            <CardTitle className="flex flex-wrap items-center justify-between gap-2">
              <span>Game</span>
              <div className="flex flex-wrap items-center gap-2 text-xs font-normal sm:text-sm">
                <Badge variant="secondary">Score: {score}</Badge>
                <Badge variant="outline">Best: {myBest}</Badge>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-4 pb-4 sm:space-y-4 sm:px-6 sm:pb-6">
            <div
              className="relative mx-auto grid w-full max-w-[232px] overflow-hidden rounded-md border bg-muted/30 min-[401px]:max-w-[280px] sm:max-w-[420px]"
              style={{
                gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(0, 1fr))`,
                aspectRatio: "1 / 1",
              }}
            >
              {Array.from({ length: BOARD_SIZE * BOARD_SIZE }).map((_, index) => {
                const key = `${index % BOARD_SIZE},${Math.floor(index / BOARD_SIZE)}`;

                return (
                  <div
                    key={key}
                    className="border-[0.5px] border-border/30 bg-background"
                  />
                );
              })}

              <div
                className="pointer-events-none absolute z-20 rounded-[2px] bg-red-500"
                style={{
                  width: `${cellSizePercent}%`,
                  height: `${cellSizePercent}%`,
                  left: `${food.x * cellSizePercent}%`,
                  top: `${food.y * cellSizePercent}%`,
                  transitionProperty: "left, top",
                  transitionDuration: "120ms",
                  transitionTimingFunction: "linear",
                }}
              />

              {snake.map((segment, index) => (
                <div
                  key={`${index}-${segment.x}-${segment.y}`}
                  className={index === 0 ? "pointer-events-none absolute z-30 rounded-[2px] bg-cyan-300" : "pointer-events-none absolute z-20 rounded-[2px] bg-primary"}
                  style={{
                    width: `${cellSizePercent}%`,
                    height: `${cellSizePercent}%`,
                    left: `${segment.x * cellSizePercent}%`,
                    top: `${segment.y * cellSizePercent}%`,
                    transitionProperty: "left, top",
                    transitionDuration: `${Math.max(70, tickSpeed - 10)}ms`,
                    transitionTimingFunction: "linear",
                  }}
                />
              ))}
            </div>

            <div className="mx-auto grid w-full max-w-[232px] grid-cols-2 gap-2 min-[401px]:max-w-[280px] sm:flex sm:max-w-[420px] sm:flex-wrap sm:items-center">
              <Button
                className="col-span-1 h-9 text-sm sm:h-11 sm:text-base"
                onClick={() => {
                  haptic("light");
                  if (isGameOver) {
                    resetGame(true);
                    return;
                  }

                  if (score === 0 && snake.length === INITIAL_SNAKE.length && !isRunning) {
                    setIsRunning(true);
                    return;
                  }

                  setIsRunning((prev) => !prev);
                }}
              >
                {isRunning ? (
                  <>
                    <Pause className="mr-2 h-4 w-4" /> Pause
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" /> {isGameOver ? "Play Again" : "Start"}
                  </>
                )}
              </Button>

              <Button className="col-span-1 h-9 text-sm sm:h-11 sm:text-base" variant="outline" onClick={() => {
                haptic("light");
                resetGame(false);
              }}>
                <RotateCcw className="mr-2 h-4 w-4" /> Reset
              </Button>

              {isGameOver && <Badge className="col-span-2 w-fit" variant="destructive">Game Over</Badge>}
            </div>

            <div className="sm:hidden">
              <DirectionPad
                compact={isCompactPhone}
                onDirection={updateDirection}
                onCenter={() => {
                  if (isGameOver) {
                    resetGame(true);
                    return;
                  }
                  setIsRunning((prev) => !prev);
                }}
              />
            </div>

            <p className="text-xs text-muted-foreground sm:text-sm">Use arrow keys or WASD. On mobile, use the Roku-style pad.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Leaderboard</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {leaderboardQuery.isError && (
                <p className="text-sm text-destructive">
                  {(leaderboardQuery.error as Error).message.includes("snake_high_scores")
                    ? "Leaderboard unavailable: database migration is missing. Apply Supabase migration 20260306110000_add_snake_high_scores.sql."
                    : `Could not load leaderboard: ${(leaderboardQuery.error as Error).message}`}
                </p>
              )}
              {leaderboard.length === 0 && !leaderboardQuery.isError && (
                <p className="text-sm text-muted-foreground">No scores yet. Be the first to post one.</p>
              )}

              {leaderboard.map((row, index) => {
                const profile = profileById.get(row.user_id);
                const name = profile?.full_name || "Unknown player";

                return (
                  <div key={row.user_id} className="flex items-center justify-between rounded-md border px-3 py-2">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="w-5 text-sm text-muted-foreground">{index + 1}</span>
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={profile?.avatar_url || undefined} alt={name} />
                        <AvatarFallback>{getInitials(name)}</AvatarFallback>
                      </Avatar>
                      <span className="truncate text-sm font-medium">{name}</span>
                    </div>
                    <Badge>{row.score}</Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
