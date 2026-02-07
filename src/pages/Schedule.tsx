import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { format, parseISO, isSameDay, addDays, getDay, isSaturday, isSunday } from "date-fns";
import { Star, Heart, Zap, Diamond, Mic2, Drum, Guitar, Piano, AudioWaveform, Home, CalendarDays } from "lucide-react";
import { MINISTRY_TYPES, POSITION_LABELS } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useTeamSchedule, useTeamMembers, useWorshipTeams, TeamScheduleEntry } from "@/hooks/useTeamSchedule";
import { useAuth } from "@/hooks/useAuth";
import { useMyTeamAssignments } from "@/hooks/useMyTeamAssignments";


const teamIcons: Record<string, React.ElementType> = {
  star: Star,
  heart: Heart,
  zap: Zap,
  diamond: Diamond
};
const positionIcons: Record<string, React.ElementType> = {
  "Worship Leader": Mic2,
  "Vocals": Mic2,
  "Drums": Drum,
  "Bass": Guitar,
  "Keys": Piano,
  "Electric 1": AudioWaveform,
  "Electric 2": AudioWaveform,
  "Acoustic 1": Guitar,
  "Acoustic 2": Guitar
};
function TeamIcon({
  icon,
  color,
  className = "h-5 w-5"
}: {
  icon: string;
  color: string;
  className?: string;
}) {
  const Icon = teamIcons[icon] || Star;
  return <Icon className={className} style={{
    color
  }} />;
}
interface WeekendGroup {
  id: string;
  saturday?: TeamScheduleEntry;
  sunday?: TeamScheduleEntry;
  team: TeamScheduleEntry['worship_teams'];
}
function ScheduleCard({
  weekend,
  members,
  isExpanded,
  onToggle
}: {
  weekend: WeekendGroup;
  members: {
    member_name: string;
    position: string;
  }[];
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const team = weekend.team;
  if (!team) return null;
  const saturdayDate = weekend.saturday ? parseISO(weekend.saturday.schedule_date) : null;
  const sundayDate = weekend.sunday ? parseISO(weekend.sunday.schedule_date) : null;
  const notes = weekend.saturday?.notes || weekend.sunday?.notes;
  return <Card className={`cursor-pointer transition-all hover:scale-[1.02] ${isExpanded ? 'ring-2 ring-primary' : ''}`} onClick={onToggle}>
      <CardHeader className="pb-2">
        <div className="flex flex-col items-center justify-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full mb-2" style={{
          backgroundColor: `${team.color}20`
        }}>
            <TeamIcon icon={team.icon} color={team.color} className="h-6 w-6" />
          </div>
          <CardTitle className="text-lg">{team.name}</CardTitle>
          <div className="text-sm text-muted-foreground space-y-0.5">
            {saturdayDate && <p>Sat {format(saturdayDate, "MMM d")} • 4pm & 6pm</p>}
            {sundayDate && <p>Sun {format(sundayDate, "MMM d")} • 8am, 10am & 12pm</p>}
          </div>
          {notes && <Badge variant="secondary" className="bg-primary/20 text-primary mt-2">
              {notes}
            </Badge>}
        </div>
      </CardHeader>
      
      {isExpanded && <CardContent className="pt-2">
          <div className="grid gap-2">
            {members.map(member => {
          const PositionIcon = positionIcons[member.position] || Mic2;
          // Map position to short label
          const positionKey = member.position.toLowerCase().replace(/\s+/g, '_').replace('acoustic_1', 'acoustic_guitar').replace('acoustic_2', 'acoustic_guitar');
          const shortLabel = positionKey === 'acoustic_1' ? 'AG 1' : positionKey === 'acoustic_2' ? 'AG 2' : 
            member.position.includes('Electric 1') ? 'EG 1' : member.position.includes('Electric 2') ? 'EG 2' :
            member.position.includes('Acoustic 1') ? 'AG 1' : member.position.includes('Acoustic 2') ? 'AG 2' :
            member.position;
          return <div key={`${member.member_name}-${member.position}`} className="flex items-center gap-3 rounded-lg bg-muted/50 px-3 py-2">
                  <PositionIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 font-medium">{member.member_name}</span>
                  <span className="text-sm text-muted-foreground">{shortLabel}</span>
                </div>;
        })}
          </div>
        </CardContent>}
    </Card>;
}

// Helper to format ministry types from the stored assignment
function formatMinistryTypes(ministryTypes: string[]): string {
  if (!ministryTypes || ministryTypes.length === 0) return "";
  
  const labels: Record<string, string> = {
    weekend: "Weekend Worship",
    encounter: "Encounter",
    eon: "EON",
    eon_weekend: "EON Weekend",
    evident: "Evident",
    er: "ER",
    production: "Production",
    video: "Video",
  };
  
  return ministryTypes.map(t => labels[t.toLowerCase()] || t).join(", ");
}

// Helper to infer ministry type from day of week
function getMinistryTypeForDate(date: Date, storedMinistryTypes: string[]): string[] {
  const dayOfWeek = getDay(date); // 0 = Sunday, 6 = Saturday
  
  // Wednesday = Encounter or EON (check if EON is in stored types)
  if (dayOfWeek === 3) {
    if (storedMinistryTypes?.some(t => t.toLowerCase() === 'eon')) {
      return ['eon'];
    }
    return ['encounter'];
  }
  
  // Thursday = Evident or ER (check if ER is in stored types)
  if (dayOfWeek === 4) {
    if (storedMinistryTypes?.some(t => t.toLowerCase() === 'er')) {
      return ['er'];
    }
    return ['evident'];
  }
  
  // Weekend days use the stored ministry types (or default to weekend)
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    // Filter to weekend-appropriate ministries
    const weekendTypes = storedMinistryTypes?.filter(t => 
      ['weekend', 'eon_weekend', 'production', 'video'].includes(t.toLowerCase())
    );
    return weekendTypes?.length > 0 ? weekendTypes : ['weekend'];
  }
  
  // Other midweek days - return stored or empty
  return storedMinistryTypes || [];
}

interface WeekendGroupEntry {
  saturday?: { scheduleDate: string; date: Date };
  sunday?: { scheduleDate: string; date: Date };
  teamId: string;
  teamName: string;
  teamColor: string;
  position: string;
  campusName: string | null;
  ministryTypes: string[];
  displayMinistryTypes: string[]; // Computed based on day of week
}

// Simplified view for volunteers - just their upcoming dates across ALL campuses
function VolunteerScheduleView() {
  const { scheduledDates, isLoading } = useMyTeamAssignments();

  // Show ALL scheduled dates across ALL campuses for volunteers
  // No campus filtering - volunteers should see every team they're on at every campus
  const upcomingDates = useMemo(() => {
    return scheduledDates.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [scheduledDates]);

  // Group weekend dates (Sat+Sun of same weekend) together
  const groupedDates = useMemo(() => {
    const groups: WeekendGroupEntry[] = [];
    const weekendMap = new Map<string, WeekendGroupEntry>();

    for (const entry of upcomingDates) {
      const dayOfWeek = getDay(entry.date); // 0 = Sunday, 6 = Saturday

      // If it's a weekend day, group with its pair
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        // Use Saturday as the key for the weekend group
        const saturdayDate = dayOfWeek === 0 ? addDays(entry.date, -1) : entry.date;
        const weekendKey = `${format(saturdayDate, "yyyy-MM-dd")}-${entry.teamId}`;

        if (!weekendMap.has(weekendKey)) {
          const displayMinistryTypes = getMinistryTypeForDate(entry.date, entry.ministryTypes);
          weekendMap.set(weekendKey, {
            teamId: entry.teamId,
            teamName: entry.teamName,
            teamColor: entry.teamColor,
            position: entry.position,
            campusName: entry.campusName,
            ministryTypes: entry.ministryTypes,
            displayMinistryTypes,
          });
        }

        const group = weekendMap.get(weekendKey)!;
        if (dayOfWeek === 6) {
          group.saturday = { scheduleDate: entry.scheduleDate, date: entry.date };
        } else {
          group.sunday = { scheduleDate: entry.scheduleDate, date: entry.date };
        }
      } else {
        // Midweek date - add as standalone with inferred ministry type
        const displayMinistryTypes = getMinistryTypeForDate(entry.date, entry.ministryTypes);
        groups.push({
          saturday: { scheduleDate: entry.scheduleDate, date: entry.date },
          teamId: entry.teamId,
          teamName: entry.teamName,
          teamColor: entry.teamColor,
          position: entry.position,
          campusName: entry.campusName,
          ministryTypes: entry.ministryTypes,
          displayMinistryTypes,
        });
      }
    }

    // Add weekend groups to the list
    groups.push(...Array.from(weekendMap.values()));

    // Sort by the earliest date in each group
    return groups.sort((a, b) => {
      const dateA = a.saturday?.date || a.sunday?.date || new Date();
      const dateB = b.saturday?.date || b.sunday?.date || new Date();
      return dateA.getTime() - dateB.getTime();
    });
  }, [upcomingDates]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (groupedDates.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <CalendarDays className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No upcoming dates scheduled</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {groupedDates.map((group, index) => {
        // Build date display
        const isWeekend = group.saturday && group.sunday;
        const isSingleWeekendDay = (group.saturday && !group.sunday) || (!group.saturday && group.sunday);
        const singleDate = group.saturday?.date || group.sunday?.date;
        const isMidweek = singleDate && getDay(singleDate) !== 0 && getDay(singleDate) !== 6;

        let dateDisplay: string;
        if (isWeekend) {
          // Show "Sat, Jan 31 – Sun, Feb 1, 2026"
          dateDisplay = `${format(group.saturday!.date, "EEE, MMM d")} – ${format(group.sunday!.date, "EEE, MMM d, yyyy")}`;
        } else if (singleDate) {
          dateDisplay = format(singleDate, "EEEE, MMMM d, yyyy");
        } else {
          dateDisplay = "";
        }

        // Use displayMinistryTypes which is inferred from day of week
        const ministryLabel = formatMinistryTypes(group.displayMinistryTypes);

        return (
          <Card key={`${group.saturday?.scheduleDate || group.sunday?.scheduleDate}-${group.teamId}-${index}`}>
            <CardContent className="flex items-center gap-4 py-4">
              {/* Ministry Badge */}
              {(() => {
                const primaryMinistry = group.displayMinistryTypes?.[0];
                const ministryConfig = MINISTRY_TYPES.find(m => m.value === primaryMinistry);
                return (
                  <div 
                    className={`flex h-10 w-10 items-center justify-center rounded-full shrink-0 text-white text-xs font-bold ${ministryConfig?.color || 'bg-primary'}`}
                  >
                    {ministryConfig?.shortLabel || 'WKD'}
                  </div>
                );
              })()}
              <div className="flex-1 min-w-0">
                <p className="font-semibold">{dateDisplay}</p>
                <p className="text-sm text-muted-foreground">
                  {group.teamName} • {POSITION_LABELS[group.position.toLowerCase()] || group.position}
                  {group.campusName && ` • ${group.campusName}`}
                  {ministryLabel && ` • ${ministryLabel}`}
                </p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export default function Schedule() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { canManageTeam } = useAuth();

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const {
    data: schedule,
    isLoading: scheduleLoading
  } = useTeamSchedule("T1 2026");
  const {
    data: allMembers,
    isLoading: membersLoading
  } = useTeamMembers();
  const {
    data: teams
  } = useWorshipTeams();

  // Group schedule entries into weekends (Saturday + Sunday pairs)
  const groupIntoWeekends = useMemo(() => {
    if (!schedule) return [];
    const weekendMap = new Map<string, WeekendGroup>();
    schedule.forEach(entry => {
      const date = parseISO(entry.schedule_date);
      const dayOfWeek = getDay(date); // 0 = Sunday, 6 = Saturday

      // Calculate the Saturday of this weekend as the key
      let saturdayDate: Date;
      if (dayOfWeek === 0) {
        // Sunday
        saturdayDate = addDays(date, -1);
      } else if (dayOfWeek === 6) {
        // Saturday
        saturdayDate = date;
      } else {
        return; // Skip non-weekend days
      }
      const weekendKey = format(saturdayDate, "yyyy-MM-dd");
      if (!weekendMap.has(weekendKey)) {
        weekendMap.set(weekendKey, {
          id: weekendKey,
          team: entry.worship_teams
        });
      }
      const weekend = weekendMap.get(weekendKey)!;
      if (dayOfWeek === 6) {
        weekend.saturday = entry;
      } else {
        weekend.sunday = entry;
      }
    });
    return Array.from(weekendMap.values()).sort((a, b) => a.id.localeCompare(b.id));
  }, [schedule]);
  const months = useMemo(() => {
    const monthMap = new Map<string, WeekendGroup[]>();
    groupIntoWeekends.forEach(weekend => {
      const date = parseISO(weekend.id);
      const monthKey = format(date, "MMMM yyyy");
      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, []);
      }
      monthMap.get(monthKey)!.push(weekend);
    });
    return Array.from(monthMap.entries()).map(([month, weekends]) => ({
      month,
      weekends
    }));
  }, [groupIntoWeekends]);
  const getMembersForTeam = (teamId: string | undefined) => {
    if (!teamId) return [];
    return allMembers?.filter(m => m.team_id === teamId) || [];
  };
  const isLoading = scheduleLoading || membersLoading;

  // Show simplified view for volunteers (users who cannot manage team)
  // Show simplified view for users who cannot manage team (volunteers)
  const showVolunteerView = !canManageTeam;

  return <>
      <div className="space-y-6">
        {/* Breadcrumb Navigation */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/dashboard" className="flex items-center gap-1.5">
                  <Home className="h-3.5 w-3.5" />
                  Dashboard
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{showVolunteerView ? "My Schedule" : "Team Schedule"}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold">{showVolunteerView ? "My Schedule" : "Team Schedule"}</h1>
          {!showVolunteerView && <p className="text-muted-foreground">T1 2026 Rotation • January - April</p>}
        </div>

        {showVolunteerView ? (
          <VolunteerScheduleView />
        ) : (
          <>
            {isLoading ? <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div> : <Tabs defaultValue={months[0]?.month} className="w-full">
                <TabsList className="mb-4 w-full justify-start overflow-x-auto">
                  {months.map(({
                month
              }) => <TabsTrigger key={month} value={month} className="min-w-fit">
                      {month.split(" ")[0]}
                    </TabsTrigger>)}
                </TabsList>
                
                {months.map(({
              month,
              weekends
            }) => <TabsContent key={month} value={month} className="space-y-4">
                    {weekends.map(weekend => <ScheduleCard key={weekend.id} weekend={weekend} members={getMembersForTeam(weekend.team?.id)} isExpanded={expandedId === weekend.id} onToggle={() => setExpandedId(expandedId === weekend.id ? null : weekend.id)} />)}
                  </TabsContent>)}
              </Tabs>}
          </>
        )}
      </div>
    </>;
}