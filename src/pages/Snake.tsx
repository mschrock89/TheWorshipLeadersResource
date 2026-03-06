import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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

function toCellKey(point: Point) {
  return `${point.x},${point.y}`;
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
}: {
  onDirection: (next: Direction) => void;
  onCenter: () => void;
}) {
  const armClass =
    "absolute z-10 flex items-center justify-center rounded-xl border border-violet-200/40 bg-[linear-gradient(180deg,rgba(124,58,237,0.92),rgba(76,29,149,0.98))] text-white shadow-[0_16px_30px_-22px_rgba(76,29,149,1)] active:scale-[0.98]";

  return (
    <div className="relative mx-auto h-52 w-52 select-none">
      <button className={`${armClass} left-1/2 top-0 h-20 w-24 -translate-x-1/2`} onClick={() => onDirection({ x: 0, y: -1 })}>
        <ChevronUp className="h-8 w-8" />
      </button>
      <button className={`${armClass} left-0 top-1/2 h-24 w-20 -translate-y-1/2`} onClick={() => onDirection({ x: -1, y: 0 })}>
        <ChevronLeft className="h-8 w-8" />
      </button>
      <button className={`${armClass} right-0 top-1/2 h-24 w-20 -translate-y-1/2`} onClick={() => onDirection({ x: 1, y: 0 })}>
        <ChevronRight className="h-8 w-8" />
      </button>
      <button className={`${armClass} bottom-0 left-1/2 h-20 w-24 -translate-x-1/2`} onClick={() => onDirection({ x: 0, y: 1 })}>
        <ChevronDown className="h-8 w-8" />
      </button>

      <button
        onClick={onCenter}
        className="absolute left-1/2 top-1/2 z-20 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-violet-100/70 bg-[linear-gradient(180deg,rgba(99,102,241,0.92),rgba(67,56,202,0.98))] text-lg font-semibold tracking-wide text-white shadow-[0_20px_40px_-24px_rgba(67,56,202,1)] active:scale-[0.98]"
      >
        OK
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
    const paceReduction = Math.floor(score / 50) * 8;
    return Math.max(80, 140 - paceReduction);
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

  const snakeCells = useMemo(() => new Set(snake.map(toCellKey)), [snake]);
  const foodCell = toCellKey(food);

  const leaderboard = leaderboardQuery.data ?? [];
  const profileById = useMemo(
    () => new Map((profilesQuery.data ?? []).map((profile) => [profile.id, profile])),
    [profilesQuery.data],
  );
  const myBest = myBestQuery.data ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Snake</h1>
          <p className="text-muted-foreground">Simple arcade mode with a global top-10 leaderboard.</p>
        </div>
        <Gamepad2 className="h-8 w-8 text-primary" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between">
              <span>Game</span>
              <div className="flex items-center gap-2 text-sm font-normal">
                <Badge variant="secondary">Score: {score}</Badge>
                <Badge variant="outline">Best: {myBest}</Badge>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className="grid w-full max-w-[420px] overflow-hidden rounded-md border bg-muted/30"
              style={{
                gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(0, 1fr))`,
                aspectRatio: "1 / 1",
              }}
            >
              {Array.from({ length: BOARD_SIZE * BOARD_SIZE }).map((_, index) => {
                const x = index % BOARD_SIZE;
                const y = Math.floor(index / BOARD_SIZE);
                const key = `${x},${y}`;
                const isSnake = snakeCells.has(key);
                const isFood = key === foodCell;

                return (
                  <div
                    key={key}
                    className={[
                      "border-[0.5px] border-border/30",
                      isSnake ? "bg-primary" : "bg-background",
                      isFood ? "bg-red-500" : "",
                    ].join(" ")}
                  />
                );
              })}
            </div>

            <div className="grid w-full max-w-[420px] grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <Button
                className="col-span-1"
                onClick={() => {
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

              <Button className="col-span-1" variant="outline" onClick={() => resetGame(false)}>
                <RotateCcw className="mr-2 h-4 w-4" /> Reset
              </Button>

              {isGameOver && <Badge className="col-span-2 w-fit" variant="destructive">Game Over</Badge>}
            </div>

            <div className="sm:hidden">
              <DirectionPad
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

            <p className="text-sm text-muted-foreground">Use arrow keys or WASD. On mobile, use the direction buttons.</p>
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
                  Could not load leaderboard: {(leaderboardQuery.error as Error).message}
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
                    <div className="flex items-center gap-3">
                      <span className="w-5 text-sm text-muted-foreground">{index + 1}</span>
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={profile?.avatar_url || undefined} alt={name} />
                        <AvatarFallback>{getInitials(name)}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium">{name}</span>
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
