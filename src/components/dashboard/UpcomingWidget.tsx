import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Cake, Heart, CalendarDays } from "lucide-react";
import { format } from "date-fns";

interface UpcomingItem {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  daysUntil: number;
  nextDate: Date;
  years?: number;
}

interface UpcomingWidgetProps {
  title: string;
  items: UpcomingItem[];
  type: "birthday" | "anniversary";
  isLoading?: boolean;
}

export function UpcomingWidget({ title, items, type, isLoading }: UpcomingWidgetProps) {
  const Icon = type === "birthday" ? Cake : Heart;
  const iconColor = type === "birthday" ? "text-accent" : "text-destructive";

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Icon className={`h-5 w-5 ${iconColor}`} />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-16 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Icon className={`h-5 w-5 ${iconColor}`} />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <CalendarDays className="h-10 w-10 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">
              No upcoming {type === "birthday" ? "birthdays" : "anniversaries"} in the next 30 days
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Icon className={`h-5 w-5 ${iconColor}`} />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {items.slice(0, 5).map((item) => {
            const initials = item.full_name
              ?.split(" ")
              .map((n) => n[0])
              .join("")
              .toUpperCase() || "?";

            return (
              <div key={item.id} className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={item.avatar_url || undefined} />
                  <AvatarFallback className="bg-secondary text-secondary-foreground text-sm">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">
                    {item.full_name || "Unnamed"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {format(item.nextDate, "MMM d")}
                    {item.years !== undefined && ` • ${item.years} years`}
                  </p>
                </div>
                <div className="text-right">
                  {item.daysUntil === 0 ? (
                    <span className="text-sm font-semibold text-accent">Today!</span>
                  ) : item.daysUntil === 1 ? (
                    <span className="text-sm font-medium text-secondary">Tomorrow</span>
                  ) : (
                    <span className="text-sm text-muted-foreground">{item.daysUntil} days</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
