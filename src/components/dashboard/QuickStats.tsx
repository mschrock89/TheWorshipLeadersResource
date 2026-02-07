import { Card, CardContent } from "@/components/ui/card";
import { Users, Mic, Guitar, Wrench } from "lucide-react";
import { Profile } from "@/hooks/useProfiles";
import { POSITION_CATEGORIES } from "@/lib/constants";

interface QuickStatsProps {
  profiles: Profile[];
  isLoading?: boolean;
}

export function QuickStats({ profiles, isLoading }: QuickStatsProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="flex items-center gap-6 p-8">
            <div className="h-16 w-16 animate-pulse rounded-xl bg-muted" />
            <div className="space-y-2">
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              <div className="h-10 w-16 animate-pulse rounded bg-muted" />
              <div className="h-4 w-40 animate-pulse rounded bg-muted" />
            </div>
          </CardContent>
        </Card>
        <div className="grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="flex items-center gap-4 p-6">
                <div className="h-12 w-12 animate-pulse rounded-lg bg-muted" />
                <div className="space-y-2">
                  <div className="h-4 w-16 animate-pulse rounded bg-muted" />
                  <div className="h-6 w-8 animate-pulse rounded bg-muted" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const totalMembers = profiles.length;
  
  const vocalistsCount = profiles.filter((p) =>
    p.positions?.some((pos) => POSITION_CATEGORIES.vocals.includes(pos))
  ).length;

  const instrumentalistsCount = profiles.filter((p) =>
    p.positions?.some((pos) => POSITION_CATEGORIES.instruments.includes(pos))
  ).length;

  const techCount = profiles.filter((p) =>
    p.positions?.some((pos) => [...POSITION_CATEGORIES.audio, ...POSITION_CATEGORIES.video].includes(pos))
  ).length;

  const breakdownStats = [
    {
      label: "Vocalists",
      value: vocalistsCount,
      icon: Mic,
      color: "bg-secondary text-secondary-foreground",
    },
    {
      label: "Musicians",
      value: instrumentalistsCount,
      icon: Guitar,
      color: "bg-accent text-accent-foreground",
    },
    {
      label: "Tech Team",
      value: techCount,
      icon: Wrench,
      color: "bg-muted text-muted-foreground",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Featured Team Members Header */}
      <Card className="overflow-hidden">
        <CardContent className="flex items-center gap-6 p-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Users className="h-8 w-8" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Team Members</p>
            <p className="text-4xl font-bold text-foreground">{totalMembers}</p>
            <p className="mt-1 text-sm text-muted-foreground">Your worship team at a glance</p>
          </div>
        </CardContent>
      </Card>

      {/* Breakdown Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-3">
        {breakdownStats.map((stat) => (
          <Card key={stat.label} className="overflow-hidden">
            <CardContent className="flex items-center gap-4 p-6">
              <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${stat.color}`}>
                <stat.icon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
