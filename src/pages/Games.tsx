import { Link } from "react-router-dom";
import { ArrowRight, CircleDot, Gamepad2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const gameActions = [
  {
    title: "Snake",
    description: "Play a quick round, chase a new personal best, and climb the leaderboard.",
    to: "/snake",
    icon: Gamepad2,
    actionLabel: "Play Snake",
    cardClassName: "border-rose-300/35 bg-[linear-gradient(145deg,rgba(244,63,94,0.24),rgba(76,5,25,0.34))] text-white",
    iconClassName: "border-rose-200/25 bg-rose-300/20 text-rose-100",
    buttonClassName: "bg-rose-300 text-rose-950 hover:bg-rose-200",
  },
  {
    title: "Pong",
    description: "Take on the AI, rally longer, and post your best score on the leaderboard.",
    to: "/pong",
    icon: CircleDot,
    actionLabel: "Play Pong",
    cardClassName: "border-cyan-300/35 bg-[linear-gradient(145deg,rgba(34,211,238,0.2),rgba(8,47,73,0.34))] text-white",
    iconClassName: "border-cyan-200/30 bg-cyan-300/15 text-cyan-100",
    buttonClassName: "bg-cyan-300 text-cyan-950 hover:bg-cyan-200",
  },
];

export default function Games() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Games</h1>
        <p className="text-muted-foreground">Pick a game and post a new personal best.</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {gameActions.map((action) => (
          <div key={action.title} className={`group relative h-[220px] overflow-hidden rounded-2xl border p-5 shadow-[0_20px_60px_-40px_rgba(0,0,0,0.8)] transition-transform duration-200 hover:-translate-y-0.5 ${action.cardClassName}`}>
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.14),transparent_45%)] opacity-80" />
            <div className="relative flex h-full flex-col gap-3">
              <div className="flex items-start justify-between gap-4">
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl border backdrop-blur-sm ${action.iconClassName}`}>
                  <action.icon className="h-5 w-5" />
                </div>
              </div>
              <div className="space-y-1.5">
                <h3 className="font-display text-2xl font-semibold tracking-tight">{action.title}</h3>
                <p className="max-w-xl text-base leading-7 text-white/72">
                  {action.description}
                </p>
              </div>
              <div className="mt-auto pt-1">
                <Link to={action.to}>
                  <Button className={`gap-2 h-12 px-6 text-lg ${action.buttonClassName}`}>
                    <action.icon className="h-4 w-4" />
                    {action.actionLabel}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
