import { useMyTeamAssignments } from "@/hooks/useMyTeamAssignments";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Star, Music, Flame, Sparkles, Heart, Sun, Moon, Zap, Users } from "lucide-react";
import { format } from "date-fns";
import { parseLocalDate, groupByWeekend, isWeekend } from "@/lib/utils";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  star: Star,
  music: Music,
  flame: Flame,
  sparkles: Sparkles,
  heart: Heart,
  sun: Sun,
  moon: Moon,
  zap: Zap,
};

export function TeamBadge() {
  const { uniqueTeams, scheduledDates, isLoading } = useMyTeamAssignments();

  if (isLoading || uniqueTeams.length === 0) {
    return null;
  }

  // Group by weekend and get the next one
  const upcomingDates = scheduledDates
    .map((d) => ({ ...d, localDate: parseLocalDate(d.scheduleDate) }))
    .filter((d) => d.localDate >= new Date())
    .sort((a, b) => a.localDate.getTime() - b.localDate.getTime());

  const weekendGroups = groupByWeekend(upcomingDates);
  const nextWeekend = weekendGroups[0];
  
  // Format for display
  const formatNextDate = () => {
    if (!nextWeekend) return null;
    const satDate = parseLocalDate(nextWeekend.saturdayDate);
    if (isWeekend(nextWeekend.saturdayDate) && nextWeekend.saturdayDate !== nextWeekend.sundayDate) {
      return `Next: ${format(satDate, "MMM d")} weekend`;
    }
    return `Next: ${format(satDate, "MMM d")}`;
  };

  if (uniqueTeams.length === 1) {
    const team = uniqueTeams[0];
    const Icon = iconMap[team.teamIcon] || Star;
    
    return (
      <Badge
        variant="secondary"
        className="gap-1.5 px-3 py-1.5 text-sm font-medium"
        style={{
          backgroundColor: `${team.teamColor}20`,
          borderColor: team.teamColor,
          color: team.teamColor,
        }}
      >
        <Icon className="h-3.5 w-3.5" />
        {team.teamName}
      </Badge>
    );
  }

  // Multiple teams - show dropdown
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Badge
          variant="secondary"
          className="cursor-pointer gap-1.5 px-3 py-1.5 text-sm font-medium hover:opacity-80 transition-opacity"
        >
          <Users className="h-3.5 w-3.5" />
          {uniqueTeams.length} Teams
        </Badge>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {uniqueTeams.map((team) => {
          const Icon = iconMap[team.teamIcon] || Star;
          
          // Get next weekend for this team
          const teamUpcoming = scheduledDates
            .map((d) => ({ ...d, localDate: parseLocalDate(d.scheduleDate) }))
            .filter((d) => d.teamId === team.teamId && d.localDate >= new Date())
            .sort((a, b) => a.localDate.getTime() - b.localDate.getTime());
          
          const teamWeekends = groupByWeekend(teamUpcoming);
          const teamNextWeekend = teamWeekends[0];
          
          const formatTeamNextDate = () => {
            if (!teamNextWeekend) return null;
            const satDate = parseLocalDate(teamNextWeekend.saturdayDate);
            if (isWeekend(teamNextWeekend.saturdayDate) && teamNextWeekend.saturdayDate !== teamNextWeekend.sundayDate) {
              return `${format(satDate, "MMM d")} weekend`;
            }
            return format(satDate, "MMM d");
          };
          
          return (
            <DropdownMenuItem key={team.teamId} className="flex flex-col items-start gap-1 py-2">
              <div className="flex items-center gap-2">
                <span style={{ color: team.teamColor }}><Icon className="h-4 w-4" /></span>
                <span className="font-medium">{team.teamName}</span>
              </div>
              <span className="text-xs text-muted-foreground pl-6">
                {team.position}
                {formatTeamNextDate() && ` • Next: ${formatTeamNextDate()}`}
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
