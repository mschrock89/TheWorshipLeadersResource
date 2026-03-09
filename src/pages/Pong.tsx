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
import { Play, Pause, RotateCcw, CircleDot, ChevronUp, ChevronDown } from "lucide-react";

type PongFrame = {
  playerY: number;
  aiY: number;
  ballX: number;
  ballY: number;
  ballVX: number;
  ballVY: number;
  playerScore: number;
  aiScore: number;
};

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

const BOARD_WIDTH = 640;
const BOARD_HEIGHT = 400;
const PADDLE_WIDTH = 12;
const PADDLE_HEIGHT = 86;
const BALL_SIZE = 12;
const PLAYER_X = 18;
const AI_X = BOARD_WIDTH - PLAYER_X - PADDLE_WIDTH;
const WIN_SCORE = 5;
const AI_REACTION_FRAMES = 12;
const AI_AIM_ERROR = 34;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getInitials(name: string | null | undefined) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function createInitialFrame(): PongFrame {
  return {
    playerY: BOARD_HEIGHT / 2 - PADDLE_HEIGHT / 2,
    aiY: BOARD_HEIGHT / 2 - PADDLE_HEIGHT / 2,
    ballX: BOARD_WIDTH / 2 - BALL_SIZE / 2,
    ballY: BOARD_HEIGHT / 2 - BALL_SIZE / 2,
    ballVX: -4.2,
    ballVY: 1.7,
    playerScore: 0,
    aiScore: 0,
  };
}

export default function Pong() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [frame, setFrame] = useState<PongFrame>(() => createInitialFrame());
  const [isRunning, setIsRunning] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);

  const frameRef = useRef(frame);
  const isRunningRef = useRef(isRunning);
  const lastTimestampRef = useRef<number | null>(null);
  const animationRef = useRef<number | null>(null);
  const keysRef = useRef({ up: false, down: false });
  const aiFrameCounterRef = useRef(0);
  const aiAimOffsetRef = useRef(0);

  useEffect(() => {
    frameRef.current = frame;
  }, [frame]);

  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  const leaderboardQuery = useQuery({
    queryKey: ["pong-leaderboard"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("pong_high_scores")
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
    queryKey: ["pong-basic-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_basic_profiles");
      if (error) throw error;
      return (data ?? []) as BasicProfile[];
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 10,
  });

  const myBestQuery = useQuery({
    queryKey: ["pong-my-best", user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("pong_high_scores")
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
        .from("pong_high_scores")
        .select("score")
        .eq("user_id", user.id)
        .maybeSingle();

      if (existingError) throw existingError;

      const currentBest = existing?.score ?? 0;
      if (finalScore <= currentBest) {
        return { improved: false, best: currentBest };
      }

      const { error: upsertError } = await (supabase as any)
        .from("pong_high_scores")
        .upsert({ user_id: user.id, score: finalScore }, { onConflict: "user_id" });

      if (upsertError) throw upsertError;

      return { improved: true, best: finalScore };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["pong-leaderboard"] });
      queryClient.invalidateQueries({ queryKey: ["pong-my-best", user?.id] });

      if (result.improved) {
        toast({
          title: "New Pong high score",
          description: `You set a new best: ${result.best}`,
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Could not save Pong score",
        description: error.message || "Your score was not saved to the leaderboard.",
        variant: "destructive",
      });
    },
  });

  const resetBall = useCallback((towardPlayer: boolean) => {
    const horizontal = towardPlayer ? -4.2 : 4.2;
    const vertical = (Math.random() * 2.2 - 1.1) || 0.8;

    frameRef.current = {
      ...frameRef.current,
      ballX: BOARD_WIDTH / 2 - BALL_SIZE / 2,
      ballY: BOARD_HEIGHT / 2 - BALL_SIZE / 2,
      ballVX: horizontal,
      ballVY: vertical,
    };
  }, []);

  const resetMatch = useCallback((start = false) => {
    const next = createInitialFrame();
    frameRef.current = next;
    setFrame(next);
    setIsGameOver(false);
    setIsRunning(start);
    isRunningRef.current = start;
    lastTimestampRef.current = null;
  }, []);

  const finishMatch = useCallback((finalFrame: PongFrame) => {
    isRunningRef.current = false;
    setIsRunning(false);
    setIsGameOver(true);

    if (finalFrame.playerScore > finalFrame.aiScore) {
      void saveHighScore.mutateAsync(finalFrame.playerScore);
    }
  }, [saveHighScore]);

  const step = useCallback((timestamp: number) => {
    if (!isRunningRef.current) return;

    const previous = lastTimestampRef.current;
    lastTimestampRef.current = timestamp;
    const dt = previous ? Math.min(2.5, (timestamp - previous) / 16.67) : 1;

    const current = frameRef.current;
    let playerY = current.playerY;
    let aiY = current.aiY;
    let ballX = current.ballX;
    let ballY = current.ballY;
    let ballVX = current.ballVX;
    let ballVY = current.ballVY;
    let playerScore = current.playerScore;
    let aiScore = current.aiScore;

    const playerSpeed = 6.8 * dt;
    if (keysRef.current.up) playerY -= playerSpeed;
    if (keysRef.current.down) playerY += playerSpeed;
    playerY = clamp(playerY, 0, BOARD_HEIGHT - PADDLE_HEIGHT);

    aiFrameCounterRef.current += 1;
    if (aiFrameCounterRef.current % AI_REACTION_FRAMES === 0) {
      aiAimOffsetRef.current = (Math.random() * AI_AIM_ERROR * 2) - AI_AIM_ERROR;
    }
    const aiTargetY = ballY - PADDLE_HEIGHT / 2 + BALL_SIZE / 2 + aiAimOffsetRef.current;
    const aiSpeed = 2.7 * dt;
    if (aiY < aiTargetY) aiY += aiSpeed;
    if (aiY > aiTargetY) aiY -= aiSpeed;
    aiY = clamp(aiY, 0, BOARD_HEIGHT - PADDLE_HEIGHT);

    ballX += ballVX * dt;
    ballY += ballVY * dt;

    if (ballY <= 0) {
      ballY = 0;
      ballVY = Math.abs(ballVY);
    }
    if (ballY >= BOARD_HEIGHT - BALL_SIZE) {
      ballY = BOARD_HEIGHT - BALL_SIZE;
      ballVY = -Math.abs(ballVY);
    }

    const playerHit =
      ballX <= PLAYER_X + PADDLE_WIDTH &&
      ballX + BALL_SIZE >= PLAYER_X &&
      ballY + BALL_SIZE >= playerY &&
      ballY <= playerY + PADDLE_HEIGHT;

    if (playerHit && ballVX < 0) {
      ballX = PLAYER_X + PADDLE_WIDTH;
      const offset = (ballY + BALL_SIZE / 2 - (playerY + PADDLE_HEIGHT / 2)) / (PADDLE_HEIGHT / 2);
      ballVX = Math.abs(ballVX) * 1.008;
      ballVY += offset * 1.35;
    }

    const aiHit =
      ballX + BALL_SIZE >= AI_X &&
      ballX <= AI_X + PADDLE_WIDTH &&
      ballY + BALL_SIZE >= aiY &&
      ballY <= aiY + PADDLE_HEIGHT;

    if (aiHit && ballVX > 0) {
      ballX = AI_X - BALL_SIZE;
      const offset = (ballY + BALL_SIZE / 2 - (aiY + PADDLE_HEIGHT / 2)) / (PADDLE_HEIGHT / 2);
      ballVX = -Math.abs(ballVX) * 1.008;
      ballVY += offset * 1.35;
    }

    if (ballX < -BALL_SIZE) {
      aiScore += 1;
      frameRef.current = { ...current, playerY, aiY, ballX, ballY, ballVX, ballVY, playerScore, aiScore };
      if (aiScore >= WIN_SCORE) {
        const next = frameRef.current;
        setFrame(next);
        finishMatch(next);
        return;
      }
      resetBall(false);
      const next = frameRef.current;
      setFrame(next);
      animationRef.current = window.requestAnimationFrame(step);
      return;
    }

    if (ballX > BOARD_WIDTH + BALL_SIZE) {
      playerScore += 1;
      frameRef.current = { ...current, playerY, aiY, ballX, ballY, ballVX, ballVY, playerScore, aiScore };
      if (playerScore >= WIN_SCORE) {
        const next = frameRef.current;
        setFrame(next);
        finishMatch(next);
        return;
      }
      resetBall(true);
      const next = frameRef.current;
      setFrame(next);
      animationRef.current = window.requestAnimationFrame(step);
      return;
    }

    const next: PongFrame = {
      playerY,
      aiY,
      ballX,
      ballY,
      ballVX,
      ballVY,
      playerScore,
      aiScore,
    };

    frameRef.current = next;
    setFrame(next);
    animationRef.current = window.requestAnimationFrame(step);
  }, [finishMatch, resetBall]);

  useEffect(() => {
    if (!isRunning) {
      if (animationRef.current !== null) {
        window.cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    lastTimestampRef.current = null;
    animationRef.current = window.requestAnimationFrame(step);

    return () => {
      if (animationRef.current !== null) {
        window.cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [isRunning, step]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "w", "W", "s", "S"].includes(event.key)) {
        event.preventDefault();
      }
      if (event.key === "ArrowUp" || event.key === "w" || event.key === "W") keysRef.current.up = true;
      if (event.key === "ArrowDown" || event.key === "s" || event.key === "S") keysRef.current.down = true;
      if (event.key === " ") setIsRunning((prev) => !prev);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "ArrowUp" || event.key === "w" || event.key === "W") keysRef.current.up = false;
      if (event.key === "ArrowDown" || event.key === "s" || event.key === "S") keysRef.current.down = false;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const profileById = useMemo(
    () => new Map((profilesQuery.data ?? []).map((profile) => [profile.id, profile])),
    [profilesQuery.data],
  );

  const leaderboard = leaderboardQuery.data ?? [];
  const myBest = myBestQuery.data ?? 0;

  return (
    <div
      className="space-y-6 select-none"
      style={{
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
        WebkitTapHighlightColor: "transparent",
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Pong</h1>
          <p className="text-muted-foreground">Single-player pong against AI with a personal best leaderboard.</p>
        </div>
        <CircleDot className="h-8 w-8 text-primary" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between">
              <span>Game</span>
              <div className="flex items-center gap-2 text-sm font-normal">
                <Badge variant="secondary">You: {frame.playerScore}</Badge>
                <Badge variant="secondary">AI: {frame.aiScore}</Badge>
                <Badge variant="outline">Best: {myBest}</Badge>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative w-full max-w-[560px] overflow-hidden rounded-md border bg-[linear-gradient(180deg,#05080f,#05070d)] aspect-[16/10] sm:max-w-[760px]">
              <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_49.5%,rgba(148,163,184,0.28)_49.5%,rgba(148,163,184,0.28)_50.5%,transparent_50.5%)]" />

              <div
                className="absolute rounded-sm bg-cyan-300"
                style={{
                  left: `${(PLAYER_X / BOARD_WIDTH) * 100}%`,
                  top: `${(frame.playerY / BOARD_HEIGHT) * 100}%`,
                  width: `${(PADDLE_WIDTH / BOARD_WIDTH) * 100}%`,
                  height: `${(PADDLE_HEIGHT / BOARD_HEIGHT) * 100}%`,
                }}
              />
              <div
                className="absolute rounded-sm bg-violet-300"
                style={{
                  left: `${(AI_X / BOARD_WIDTH) * 100}%`,
                  top: `${(frame.aiY / BOARD_HEIGHT) * 100}%`,
                  width: `${(PADDLE_WIDTH / BOARD_WIDTH) * 100}%`,
                  height: `${(PADDLE_HEIGHT / BOARD_HEIGHT) * 100}%`,
                }}
              />
              <div
                className="absolute rounded-[2px] bg-white shadow-[0_0_20px_rgba(255,255,255,0.8)]"
                style={{
                  left: `${(frame.ballX / BOARD_WIDTH) * 100}%`,
                  top: `${(frame.ballY / BOARD_HEIGHT) * 100}%`,
                  width: `${(BALL_SIZE / BOARD_WIDTH) * 100}%`,
                  height: `${(BALL_SIZE / BOARD_HEIGHT) * 100}%`,
                }}
              />

              <div className="absolute inset-x-0 top-3 flex items-center justify-center gap-6 text-sm font-semibold text-white/85">
                <span>{frame.playerScore}</span>
                <span className="text-white/40">:</span>
                <span>{frame.aiScore}</span>
              </div>
            </div>

            <div className="grid w-full max-w-[560px] grid-cols-2 gap-2 sm:flex sm:max-w-[680px] sm:flex-wrap sm:items-center">
              <Button
                className="col-span-1"
                onClick={() => {
                  haptic("light");
                  if (isGameOver) {
                    resetMatch(true);
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

              <Button className="col-span-1" variant="outline" onClick={() => {
                haptic("light");
                resetMatch(false);
              }}>
                <RotateCcw className="mr-2 h-4 w-4" /> Reset
              </Button>

              {isGameOver && <Badge className="col-span-2 w-fit" variant="destructive">Game Over</Badge>}
            </div>

            <div
              className="grid max-w-[560px] grid-cols-2 gap-3 select-none sm:hidden"
              style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
              onContextMenu={(event) => event.preventDefault()}
            >
              <Button
                variant="outline"
                aria-label="Move paddle up"
                className="h-20 touch-none select-none text-3xl"
                onPointerDown={() => {
                  haptic("selection");
                  keysRef.current.up = true;
                }}
                onPointerUp={() => {
                  keysRef.current.up = false;
                }}
                onPointerCancel={() => {
                  keysRef.current.up = false;
                }}
                onPointerLeave={() => {
                  keysRef.current.up = false;
                }}
              >
                <ChevronUp className="h-10 w-10" />
              </Button>
              <Button
                variant="outline"
                aria-label="Move paddle down"
                className="h-20 touch-none select-none text-3xl"
                onPointerDown={() => {
                  haptic("selection");
                  keysRef.current.down = true;
                }}
                onPointerUp={() => {
                  keysRef.current.down = false;
                }}
                onPointerCancel={() => {
                  keysRef.current.down = false;
                }}
                onPointerLeave={() => {
                  keysRef.current.down = false;
                }}
              >
                <ChevronDown className="h-10 w-10" />
              </Button>
            </div>

            <p
              className="select-none text-sm text-muted-foreground"
              style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
              onContextMenu={(event) => event.preventDefault()}
            >
              Control your paddle with Arrow Up/Down (or W/S).
            </p>
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
                  {(leaderboardQuery.error as Error).message.includes("pong_high_scores")
                    ? "Leaderboard unavailable: database migration is missing. Apply Supabase migration 20260307094000_add_pong_high_scores.sql."
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
