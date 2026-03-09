import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Rocket, Pause, Play, RotateCcw, ChevronLeft, ChevronRight, Crosshair } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { haptic } from "@/lib/haptics";

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

type EnemyKind = "scout" | "ace" | "boss";
type Enemy = {
  id: string;
  kind: EnemyKind;
  x: number;
  y: number;
  width: number;
  height: number;
};

type Bullet = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number;
  vy: number;
  owner: "player" | "enemy";
  variant?: "laser" | "bomb";
};

type Explosion = {
  id: string;
  x: number;
  y: number;
  size: number;
  ttlMs: number;
};

type GalagaFrame = {
  playerX: number;
  score: number;
  lives: number;
  level: number;
  enemies: Enemy[];
  bullets: Bullet[];
  enemyBullets: Bullet[];
  explosions: Explosion[];
  formationDirection: 1 | -1;
  shotCooldownMs: number;
  playerInvulnerableMs: number;
};

const BOARD_WIDTH = 720;
const BOARD_HEIGHT = 540;
const PLAYER_WIDTH = 44;
const PLAYER_HEIGHT = 28;
const PLAYER_Y = BOARD_HEIGHT - 64;
const PLAYER_SPEED = 5.8;
const PLAYER_BULLET_SPEED = -8.1;
const ENEMY_BULLET_SPEED = 3.8;
const MAX_PLAYER_BULLETS = 2;
const INITIAL_LIVES = 3;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getInitials(name: string | null | undefined) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function getEnemyPoints(kind: EnemyKind) {
  switch (kind) {
    case "boss":
      return 160;
    case "ace":
      return 100;
    default:
      return 60;
  }
}

function getEnemyDimensions(kind: EnemyKind) {
  switch (kind) {
    case "boss":
      return { width: 42, height: 28 };
    case "ace":
      return { width: 34, height: 24 };
    default:
      return { width: 28, height: 22 };
  }
}

function createWave(level: number): Enemy[] {
  const enemies: Enemy[] = [];
  const rows = 5;
  const cols = 8;
  const startX = 102;
  const startY = 70;
  const colSpacing = 62;
  const rowSpacing = 42;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const kind: EnemyKind =
        row === 0 ? "boss" : row < 3 ? "ace" : "scout";
      const { width, height } = getEnemyDimensions(kind);

      enemies.push({
        id: `enemy-${level}-${row}-${col}`,
        kind,
        x: startX + col * colSpacing,
        y: startY + row * rowSpacing,
        width,
        height,
      });
    }
  }

  return enemies;
}

function createInitialFrame(level = 1): GalagaFrame {
  return {
    playerX: BOARD_WIDTH / 2 - PLAYER_WIDTH / 2,
    score: 0,
    lives: INITIAL_LIVES,
    level,
    enemies: createWave(level),
    bullets: [],
    enemyBullets: [],
    explosions: [],
    formationDirection: 1,
    shotCooldownMs: 0,
    playerInvulnerableMs: 0,
  };
}

function intersects(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export default function Galaga() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [frame, setFrame] = useState<GalagaFrame>(() => createInitialFrame());
  const [isRunning, setIsRunning] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);

  const frameRef = useRef(frame);
  const isRunningRef = useRef(isRunning);
  const animationRef = useRef<number | null>(null);
  const lastTimestampRef = useRef<number | null>(null);
  const controlsRef = useRef({ left: false, right: false, shoot: false });
  const bulletIdRef = useRef(0);

  useEffect(() => {
    frameRef.current = frame;
  }, [frame]);

  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  const leaderboardQuery = useQuery({
    queryKey: ["galaga-leaderboard"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("galaga_high_scores")
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
    queryKey: ["galaga-basic-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_basic_profiles");
      if (error) throw error;
      return (data ?? []) as BasicProfile[];
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 10,
  });

  const myBestQuery = useQuery({
    queryKey: ["galaga-my-best", user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("galaga_high_scores")
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
        .from("galaga_high_scores")
        .select("score")
        .eq("user_id", user.id)
        .maybeSingle();

      if (existingError) throw existingError;

      const currentBest = existing?.score ?? 0;
      if (finalScore <= currentBest) {
        return { improved: false, best: currentBest };
      }

      const { error: upsertError } = await (supabase as any)
        .from("galaga_high_scores")
        .upsert({ user_id: user.id, score: finalScore }, { onConflict: "user_id" });

      if (upsertError) throw upsertError;

      return { improved: true, best: finalScore };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["galaga-leaderboard"] });
      queryClient.invalidateQueries({ queryKey: ["galaga-my-best", user?.id] });

      if (result.improved) {
        toast({
          title: "New Galager high score",
          description: `You set a new best: ${result.best}`,
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Could not save Galager score",
        description: error.message || "Your score was not saved to the leaderboard.",
        variant: "destructive",
      });
    },
  });

  const resetGame = useCallback((startImmediately = false) => {
    const next = createInitialFrame();
    frameRef.current = next;
    setFrame(next);
    setIsGameOver(false);
    setIsRunning(startImmediately);
    isRunningRef.current = startImmediately;
    lastTimestampRef.current = null;
    controlsRef.current = { left: false, right: false, shoot: false };
  }, []);

  const finishGame = useCallback((finalScore: number) => {
    isRunningRef.current = false;
    setIsRunning(false);
    setIsGameOver(true);
    void saveHighScore.mutateAsync(finalScore);
  }, [saveHighScore]);

  const step = useCallback((timestamp: number) => {
    if (!isRunningRef.current) return;

    const previous = lastTimestampRef.current;
    lastTimestampRef.current = timestamp;
    const dt = previous ? Math.min(2.25, (timestamp - previous) / 16.67) : 1;
    const elapsedMs = dt * 16.67;

    const current = frameRef.current;
    let playerX = current.playerX;
    let score = current.score;
    let lives = current.lives;
    let level = current.level;
    let enemies = [...current.enemies];
    let bullets = [...current.bullets];
    let enemyBullets = [...current.enemyBullets];
    let explosions = current.explosions
      .map((explosion) => ({ ...explosion, ttlMs: explosion.ttlMs - elapsedMs }))
      .filter((explosion) => explosion.ttlMs > 0);
    let formationDirection = current.formationDirection;
    let shotCooldownMs = Math.max(0, current.shotCooldownMs - elapsedMs);
    let playerInvulnerableMs = Math.max(0, current.playerInvulnerableMs - elapsedMs);

    if (controlsRef.current.left) {
      playerX -= PLAYER_SPEED * dt;
    }
    if (controlsRef.current.right) {
      playerX += PLAYER_SPEED * dt;
    }
    playerX = clamp(playerX, 14, BOARD_WIDTH - PLAYER_WIDTH - 14);

    if (controlsRef.current.shoot && shotCooldownMs <= 0 && bullets.length < MAX_PLAYER_BULLETS) {
      bullets.push({
        id: `player-bullet-${bulletIdRef.current += 1}`,
        x: playerX + PLAYER_WIDTH / 2 - 2,
        y: PLAYER_Y - 8,
        width: 4,
        height: 16,
        vx: 0,
        vy: PLAYER_BULLET_SPEED,
        owner: "player",
        variant: "laser",
      });
      shotCooldownMs = 180;
    }

    if (enemies.length > 0) {
      const formationSpeed = (0.72 + level * 0.055) * dt;
      const nextLeft = Math.min(...enemies.map((enemy) => enemy.x + formationDirection * formationSpeed));
      const nextRight = Math.max(...enemies.map((enemy) => enemy.x + formationDirection * formationSpeed + enemy.width));

      if (nextLeft <= 14 || nextRight >= BOARD_WIDTH - 14) {
        formationDirection = formationDirection === 1 ? -1 : 1;
        enemies = enemies.map((enemy) => ({ ...enemy, y: enemy.y + 16 }));
      } else {
        enemies = enemies.map((enemy) => ({ ...enemy, x: enemy.x + formationDirection * formationSpeed }));
      }
    }

    const shootingColumns = new Map<number, Enemy>();
    enemies.forEach((enemy) => {
      const column = Math.round(enemy.x / 50);
      const existing = shootingColumns.get(column);
      if (!existing || enemy.y > existing.y) {
        shootingColumns.set(column, enemy);
      }
    });

    shootingColumns.forEach((enemy) => {
      const chance = 0.0022 + level * 0.00028;
      if (Math.random() < chance * dt) {
        enemyBullets.push({
          id: `enemy-bullet-${bulletIdRef.current += 1}`,
          x: enemy.x + enemy.width / 2 - 2,
          y: enemy.y + enemy.height,
          width: 4,
          height: 14,
          vx: 0,
          vy: ENEMY_BULLET_SPEED + level * 0.06,
          owner: "enemy",
          variant: "laser",
        });
      }
    });

    enemies
      .filter((enemy) => enemy.kind === "boss")
      .forEach((enemy) => {
        const bombChance = 0.0014 + level * 0.00012;
        if (Math.random() < bombChance * dt) {
          enemyBullets.push({
            id: `enemy-bomb-${bulletIdRef.current += 1}`,
            x: enemy.x + enemy.width / 2 - 4,
            y: enemy.y + enemy.height - 2,
            width: 8,
            height: 14,
            vx: 0,
            vy: ENEMY_BULLET_SPEED * 0.82 + level * 0.04,
            owner: "enemy",
            variant: "bomb",
          });
        }
      });

    bullets = bullets
      .map((bullet) => ({ ...bullet, x: bullet.x + bullet.vx * dt, y: bullet.y + bullet.vy * dt }))
      .filter((bullet) => bullet.y + bullet.height >= -20);

    enemyBullets = enemyBullets
      .map((bullet) => ({ ...bullet, x: bullet.x + bullet.vx * dt, y: bullet.y + bullet.vy * dt }))
      .filter((bullet) => {
        if (bullet.variant === "bomb" && bullet.y + bullet.height >= BOARD_HEIGHT - 8) {
          explosions.push({
            id: `explosion-${bullet.id}`,
            x: bullet.x - 30,
            y: BOARD_HEIGHT - 56,
            size: 72,
            ttlMs: 340,
          });
          return false;
        }

        return bullet.y <= BOARD_HEIGHT + 20;
      });

    const survivingBullets: Bullet[] = [];
    const destroyedEnemyIds = new Set<string>();
    const destroyedEnemyBulletIds = new Set<string>();

    bullets.forEach((bullet) => {
      const bomb = enemyBullets.find(
        (candidate) =>
          candidate.variant === "bomb" &&
          !destroyedEnemyBulletIds.has(candidate.id) &&
          intersects(bullet, candidate),
      );
      if (bomb) {
        destroyedEnemyBulletIds.add(bomb.id);
        explosions.push({
          id: `explosion-${bomb.id}`,
          x: bomb.x - 28,
          y: bomb.y - 28,
          size: 64,
          ttlMs: 340,
        });
        score += 25;
        return;
      }

      const enemy = enemies.find((candidate) => !destroyedEnemyIds.has(candidate.id) && intersects(bullet, candidate));
      if (!enemy) {
        survivingBullets.push(bullet);
        return;
      }

      destroyedEnemyIds.add(enemy.id);
      score += getEnemyPoints(enemy.kind);
    });

    bullets = survivingBullets;
    enemies = enemies.filter((enemy) => !destroyedEnemyIds.has(enemy.id));
    enemyBullets = enemyBullets.filter((bullet) => !destroyedEnemyBulletIds.has(bullet.id));

    const playerBox = {
      x: playerX + 6,
      y: PLAYER_Y + 8,
      width: PLAYER_WIDTH - 12,
      height: PLAYER_HEIGHT - 10,
    };

    const hitEnemyBulletIds = new Set<string>();
    enemyBullets.forEach((bullet) => {
      if (playerInvulnerableMs <= 0 && intersects(playerBox, bullet)) {
        hitEnemyBulletIds.add(bullet.id);
      }
    });

    const hitByEnemyBullet = hitEnemyBulletIds.size > 0;

    if (hitByEnemyBullet) {
      lives -= 1;
      enemyBullets = enemyBullets.filter((bullet) => !hitEnemyBulletIds.has(bullet.id));
      playerX = BOARD_WIDTH / 2 - PLAYER_WIDTH / 2;
      playerInvulnerableMs = 1800;

      if (lives <= 0) {
        const finalFrame: GalagaFrame = {
          playerX,
          score,
          lives: 0,
          level,
          enemies,
          bullets,
          enemyBullets,
          explosions,
          formationDirection,
          shotCooldownMs,
          playerInvulnerableMs: 0,
        };

        frameRef.current = finalFrame;
        setFrame(finalFrame);
        finishGame(score);
        return;
      }
    }

    if (enemies.length === 0) {
      level += 1;
      enemies = createWave(level);
      bullets = [];
      enemyBullets = [];
      explosions = [];
      formationDirection = 1;
    }

    const next: GalagaFrame = {
      playerX,
      score,
      lives,
      level,
      enemies,
      bullets,
      enemyBullets,
      explosions,
      formationDirection,
      shotCooldownMs,
      playerInvulnerableMs,
    };

    frameRef.current = next;
    setFrame(next);
    animationRef.current = window.requestAnimationFrame(step);
  }, [finishGame]);

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

  const startFromMovement = useCallback(() => {
    if (isRunningRef.current || isGameOver) return;
    setIsRunning(true);
    isRunningRef.current = true;
  }, [isGameOver]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (["ArrowLeft", "ArrowRight", "a", "A", "d", "D", " ", "Enter"].includes(event.key)) {
        event.preventDefault();
      }

      if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") {
        controlsRef.current.left = true;
        startFromMovement();
      }
      if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") {
        controlsRef.current.right = true;
        startFromMovement();
      }
      if (event.key === " ") {
        controlsRef.current.shoot = true;
      }
      if (event.key === "Enter") {
        setIsRunning((prev) => {
          if (isGameOver && !prev) {
            resetGame(true);
            return true;
          }

          return !prev;
        });
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") {
        controlsRef.current.left = false;
      }
      if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") {
        controlsRef.current.right = false;
      }
      if (event.key === " ") {
        controlsRef.current.shoot = false;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [isGameOver, resetGame, startFromMovement]);

  const profileById = useMemo(
    () => new Map((profilesQuery.data ?? []).map((profile) => [profile.id, profile])),
    [profilesQuery.data],
  );

  const leaderboard = leaderboardQuery.data ?? [];
  const myBest = myBestQuery.data ?? 0;

  const setControl = useCallback((key: "left" | "right" | "shoot", value: boolean) => {
    controlsRef.current[key] = value;
  }, []);

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
          <h1 className="font-display text-3xl font-semibold tracking-tight">Galager</h1>
          <p className="text-muted-foreground">A Galaga-style wave shooter with formation attacks, lives, and a personal best leaderboard.</p>
        </div>
        <Rocket className="h-8 w-8 text-primary" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between gap-3">
              <span>Game</span>
              <div className="flex flex-wrap items-center gap-2 text-sm font-normal">
                <Badge variant="secondary">Score: {frame.score}</Badge>
                <Badge variant="secondary">Lives: {frame.lives}</Badge>
                <Badge variant="secondary">Level: {frame.level}</Badge>
                <Badge variant="outline">Best: {myBest}</Badge>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative mx-auto w-full max-w-[760px] overflow-hidden rounded-md border bg-[radial-gradient(circle_at_top,rgba(24,58,130,0.45),rgba(2,6,23,0.98)_58%)] aspect-[4/3]">
              <div className="pointer-events-none absolute inset-0 opacity-70 [background-image:radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.8)_0,transparent_1.2px),radial-gradient(circle_at_70%_30%,rgba(255,255,255,0.65)_0,transparent_1.2px),radial-gradient(circle_at_40%_75%,rgba(255,255,255,0.7)_0,transparent_1.4px),radial-gradient(circle_at_80%_80%,rgba(255,255,255,0.5)_0,transparent_1.2px)] [background-size:210px_210px]" />

              {frame.enemies.map((enemy) => (
                <div
                  key={enemy.id}
                  className={
                    enemy.kind === "boss"
                      ? "absolute rounded-[10px_10px_6px_6px] border border-amber-200/70 bg-[linear-gradient(180deg,#fde68a,#f97316)] shadow-[0_0_16px_rgba(251,191,36,0.4)]"
                      : enemy.kind === "ace"
                        ? "absolute rounded-[10px_10px_4px_4px] border border-fuchsia-200/70 bg-[linear-gradient(180deg,#f9a8d4,#7c3aed)] shadow-[0_0_14px_rgba(217,70,239,0.38)]"
                        : "absolute rounded-[8px_8px_4px_4px] border border-cyan-200/70 bg-[linear-gradient(180deg,#67e8f9,#0f766e)] shadow-[0_0_14px_rgba(34,211,238,0.35)]"
                  }
                  style={{
                    left: `${(enemy.x / BOARD_WIDTH) * 100}%`,
                    top: `${(enemy.y / BOARD_HEIGHT) * 100}%`,
                    width: `${(enemy.width / BOARD_WIDTH) * 100}%`,
                    height: `${(enemy.height / BOARD_HEIGHT) * 100}%`,
                  }}
                >
                  <div className="absolute inset-x-[30%] top-[8%] h-[24%] rounded-full bg-slate-950/60" />
                  <div className="absolute left-[8%] top-[26%] h-[22%] w-[24%] skew-y-[18deg] rounded-l-full bg-white/20" />
                  <div className="absolute right-[8%] top-[26%] h-[22%] w-[24%] -skew-y-[18deg] rounded-r-full bg-white/20" />
                  <div className="absolute inset-x-[18%] bottom-[18%] h-[18%] rounded-full bg-white/22" />
                  <div className="absolute bottom-[0%] left-[22%] h-[20%] w-[18%] rounded-b-full bg-white/55" />
                  <div className="absolute bottom-[0%] right-[22%] h-[20%] w-[18%] rounded-b-full bg-white/55" />
                </div>
              ))}

              {frame.bullets.map((bullet) => (
                <div
                  key={bullet.id}
                  className="absolute rounded-full bg-cyan-200 shadow-[0_0_12px_rgba(103,232,249,0.9)]"
                  style={{
                    left: `${(bullet.x / BOARD_WIDTH) * 100}%`,
                    top: `${(bullet.y / BOARD_HEIGHT) * 100}%`,
                    width: `${(bullet.width / BOARD_WIDTH) * 100}%`,
                    height: `${(bullet.height / BOARD_HEIGHT) * 100}%`,
                  }}
                />
              ))}

              {frame.enemyBullets.map((bullet) => (
                <div
                  key={bullet.id}
                  className={
                    bullet.variant === "bomb"
                      ? "absolute rounded-full border border-amber-200/70 bg-[radial-gradient(circle_at_30%_30%,#fde68a,#f97316_65%,#7c2d12)] shadow-[0_0_10px_rgba(249,115,22,0.75)]"
                      : "absolute rounded-full bg-rose-300 shadow-[0_0_12px_rgba(251,113,133,0.85)]"
                  }
                  style={{
                    left: `${(bullet.x / BOARD_WIDTH) * 100}%`,
                    top: `${(bullet.y / BOARD_HEIGHT) * 100}%`,
                    width: `${(bullet.width / BOARD_WIDTH) * 100}%`,
                    height: `${(bullet.height / BOARD_HEIGHT) * 100}%`,
                  }}
                />
              ))}

              {frame.explosions.map((explosion) => (
                <div
                  key={explosion.id}
                  className="absolute rounded-full border border-amber-100/80 bg-[radial-gradient(circle,rgba(254,240,138,0.95)_0%,rgba(251,146,60,0.85)_42%,rgba(239,68,68,0.22)_72%,transparent_100%)]"
                  style={{
                    left: `${(explosion.x / BOARD_WIDTH) * 100}%`,
                    top: `${(explosion.y / BOARD_HEIGHT) * 100}%`,
                    width: `${(explosion.size / BOARD_WIDTH) * 100}%`,
                    height: `${(explosion.size / BOARD_HEIGHT) * 100}%`,
                    opacity: Math.max(0.2, explosion.ttlMs / 340),
                    transform: `scale(${1 + (1 - explosion.ttlMs / 340) * 0.8})`,
                  }}
                />
              ))}

              <div
                className={`absolute rounded-[14px_14px_6px_6px] border border-cyan-200/80 bg-[linear-gradient(180deg,#e0f2fe,#38bdf8)] shadow-[0_0_18px_rgba(56,189,248,0.45)] ${frame.playerInvulnerableMs > 0 ? "opacity-50" : "opacity-100"}`}
                style={{
                  left: `${(frame.playerX / BOARD_WIDTH) * 100}%`,
                  top: `${(PLAYER_Y / BOARD_HEIGHT) * 100}%`,
                  width: `${(PLAYER_WIDTH / BOARD_WIDTH) * 100}%`,
                  height: `${(PLAYER_HEIGHT / BOARD_HEIGHT) * 100}%`,
                }}
              >
                <div className="absolute inset-x-[32%] top-[4%] h-[26%] rounded-full bg-slate-950/70" />
                <div className="absolute left-[4%] top-[28%] h-[26%] w-[28%] skew-y-[18deg] rounded-l-full bg-cyan-50/85" />
                <div className="absolute right-[4%] top-[28%] h-[26%] w-[28%] -skew-y-[18deg] rounded-r-full bg-cyan-50/85" />
                <div className="absolute inset-x-[24%] bottom-[16%] h-[20%] rounded-full bg-sky-100/45" />
                <div className="absolute bottom-[0%] left-[16%] h-[20%] w-[14%] rounded-b-full bg-cyan-50/90" />
                <div className="absolute bottom-[0%] left-[40%] h-[24%] w-[20%] rounded-b-full bg-cyan-100/95" />
                <div className="absolute bottom-[0%] right-[16%] h-[20%] w-[14%] rounded-b-full bg-cyan-50/90" />
              </div>

              <div className="absolute inset-x-0 top-3 flex items-center justify-center gap-5 text-sm font-semibold text-white/85">
                <span>{frame.score}</span>
                <span className="text-white/35">•</span>
                <span>L{frame.level}</span>
                <span className="text-white/35">•</span>
                <span>{frame.lives} ships</span>
              </div>
            </div>

            <div className="mx-auto grid w-full max-w-[760px] grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <Button
                className="col-span-1"
                onClick={() => {
                  haptic("light");
                  if (isGameOver) {
                    resetGame(true);
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
                resetGame(false);
              }}>
                <RotateCcw className="mr-2 h-4 w-4" /> Reset
              </Button>

              {isGameOver && <Badge className="col-span-2 w-fit" variant="destructive">Game Over</Badge>}
            </div>

            <div className="mx-auto grid w-full max-w-[760px] grid-cols-3 gap-3 sm:hidden">
              <Button
                variant="outline"
                className="h-20 touch-none"
                aria-label="Move left"
                onPointerDown={() => {
                  haptic("selection");
                  setControl("left", true);
                  startFromMovement();
                }}
                onPointerUp={() => setControl("left", false)}
                onPointerCancel={() => setControl("left", false)}
                onPointerLeave={() => setControl("left", false)}
              >
                <ChevronLeft className="h-10 w-10" />
              </Button>
              <Button
                variant="outline"
                className="h-20 touch-none"
                aria-label="Fire"
                onPointerDown={() => {
                  haptic("selection");
                  setControl("shoot", true);
                }}
                onPointerUp={() => setControl("shoot", false)}
                onPointerCancel={() => setControl("shoot", false)}
                onPointerLeave={() => setControl("shoot", false)}
              >
                <Crosshair className="h-10 w-10" />
              </Button>
              <Button
                variant="outline"
                className="h-20 touch-none"
                aria-label="Move right"
                onPointerDown={() => {
                  haptic("selection");
                  setControl("right", true);
                  startFromMovement();
                }}
                onPointerUp={() => setControl("right", false)}
                onPointerCancel={() => setControl("right", false)}
                onPointerLeave={() => setControl("right", false)}
              >
                <ChevronRight className="h-10 w-10" />
              </Button>
            </div>

            <p
              className="mx-auto w-full max-w-[760px] text-sm text-muted-foreground"
              style={{ userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
              onContextMenu={(event) => event.preventDefault()}
            >
              Move with Left/Right or A/D. Hold Space to fire. Press Enter to start or pause.
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
                <p
                  className="text-sm text-destructive"
                  style={{ userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
                  onContextMenu={(event) => event.preventDefault()}
                >
                  {(leaderboardQuery.error as Error).message.includes("galaga_high_scores")
                    ? "Leaderboard unavailable: database migration is missing. Apply Supabase migration 20260308103000_add_galaga_high_scores.sql."
                    : `Could not load leaderboard: ${(leaderboardQuery.error as Error).message}`}
                </p>
              )}
              {leaderboard.length === 0 && !leaderboardQuery.isError && (
                <p
                  className="text-sm text-muted-foreground"
                  style={{ userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
                  onContextMenu={(event) => event.preventDefault()}
                >
                  No scores yet. Be the first to post one.
                </p>
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
