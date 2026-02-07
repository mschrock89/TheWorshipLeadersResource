import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { format } from "date-fns";
import { Music, ChevronDown, CheckCircle2, Clock, Users, ArrowRightLeft } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MINISTRY_TYPES } from "@/lib/constants";

interface SetlistWithConfirmations {
  id: string;
  plan_date: string;
  ministry_type: string;
  published_at: string;
  campuses: { name: string } | null;
  confirmed: Array<{
    userId: string;
    name: string;
    avatarUrl: string | null;
    confirmedAt: string;
    isSwappedIn?: boolean;
  }>;
  unconfirmed: Array<{
    userId: string;
    name: string;
    avatarUrl: string | null;
    isSwappedIn?: boolean;
  }>;
  totalScheduled: number;
}

interface SetlistConfirmationWidgetProps {
  selectedCampusId: string;
}

export function SetlistConfirmationWidget({ selectedCampusId }: SetlistConfirmationWidgetProps) {
  const [ministryFilter, setMinistryFilter] = useState<string>("all");
  const [expandedSetlistId, setExpandedSetlistId] = useState<string | null>(null);

  // Fetch published setlists with confirmation status
  const { data: setlists = [], isLoading } = useQuery({
    queryKey: ["admin-setlist-confirmations", selectedCampusId, ministryFilter],
    queryFn: async (): Promise<SetlistWithConfirmations[]> => {
      // Get published setlists
      let query = supabase
        .from("draft_sets")
        .select(`
          id,
          campus_id,
          plan_date,
          ministry_type,
          published_at,
          campuses(name)
        `)
        .eq("status", "published")
        .not("published_at", "is", null)
        .gte("plan_date", new Date().toISOString().split("T")[0])
        .order("plan_date", { ascending: true })
        .limit(10);

      if (selectedCampusId !== "all") {
        query = query.eq("campus_id", selectedCampusId);
      }

      if (ministryFilter !== "all") {
        query = query.eq("ministry_type", ministryFilter);
      }

      const { data: publishedSets, error } = await query;
      if (error) throw error;
      if (!publishedSets || publishedSets.length === 0) return [];

      // For each setlist, get confirmation status
      const results: SetlistWithConfirmations[] = [];

      for (const setlist of publishedSets) {
        // Get team scheduled for this date AND campus
        let teamScheduleQuery = supabase
          .from("team_schedule")
          .select("team_id")
          .eq("schedule_date", setlist.plan_date);
        
        // Filter by campus - prioritize campus-specific, fall back to shared (null)
        teamScheduleQuery = teamScheduleQuery.or(`campus_id.eq.${setlist.campus_id},campus_id.is.null`);
        
        const { data: teamSchedule } = await teamScheduleQuery
          .order("campus_id", { ascending: false, nullsFirst: false }) // Campus-specific first
          .limit(1)
          .maybeSingle();

        // Get rotation periods for this campus and date
        const { data: rotationPeriods } = await supabase
          .from("rotation_periods")
          .select("id")
          .eq("campus_id", setlist.campus_id)
          .lte("start_date", setlist.plan_date)
          .gte("end_date", setlist.plan_date);

        const rotationPeriodIds = (rotationPeriods || []).map(rp => rp.id);

        // For a swap:
        // - original_date: requester is OUT, accepted_by is IN
        // - swap_date: accepted_by is OUT, requester is IN
        //
        // Cross-team rule: If Person A swaps with Person B, then on the selected dates
        // they effectively trade teams. Practically, we only apply a swap to the
        // scheduled team for THIS date if one of the swap participants is on the
        // scheduled team for THIS date.

        // Fetch team members for the scheduled team (used both for roster + to decide
        // whether a swap applies to THIS scheduled team)
        const { data: members } = teamSchedule?.team_id && rotationPeriodIds.length > 0
          ? await supabase
              .from("team_members")
              .select("user_id, member_name, ministry_types")
              .eq("team_id", teamSchedule.team_id)
              .in("rotation_period_id", rotationPeriodIds)
              .not("user_id", "is", null)
          : { data: [] as any[] };

        const rawTeamUserIds = new Set((members || []).map(m => m.user_id).filter(Boolean));

        // Get swaps where original_date matches (requester out, accepted_by in)
        const { data: swapsOnOriginalDate } = await supabase
          .from("swap_requests")
          .select(`
            requester_id,
            accepted_by_id,
            requester:profiles!swap_requests_requester_id_fkey(id, full_name),
            accepted_by:profiles!swap_requests_accepted_by_id_fkey(id, full_name)
          `)
          .eq("original_date", setlist.plan_date)
          .eq("status", "accepted");

        // Get swaps where swap_date matches (accepted_by out, requester in)
        const { data: swapsOnSwapDate } = await supabase
          .from("swap_requests")
          .select(`
            requester_id,
            accepted_by_id,
            requester:profiles!swap_requests_requester_id_fkey(id, full_name),
            accepted_by:profiles!swap_requests_accepted_by_id_fkey(id, full_name)
          `)
          .eq("swap_date", setlist.plan_date)
          .eq("status", "accepted")
          .not("swap_date", "is", null);

        // Build sets for who's out and who's in FOR THIS TEAM on THIS DATE
        const swappedOutUserIds = new Set<string>();
        const swappedInMembers: { user_id: string; member_name: string }[] = [];

        // On original_date: requester is out, accepted_by is in (apply only if requester is on this team's roster)
        for (const swap of swapsOnOriginalDate || []) {
          if (swap.requester_id && rawTeamUserIds.has(swap.requester_id)) {
            swappedOutUserIds.add(swap.requester_id);
            if (swap.accepted_by_id) {
              swappedInMembers.push({
                user_id: swap.accepted_by_id,
                member_name: (swap.accepted_by as any)?.full_name || "Unknown",
              });
            }
          }
        }

        // On swap_date: accepted_by is out, requester is in (apply only if accepted_by is on this team's roster)
        for (const swap of swapsOnSwapDate || []) {
          if (swap.accepted_by_id && rawTeamUserIds.has(swap.accepted_by_id)) {
            swappedOutUserIds.add(swap.accepted_by_id);
            if (swap.requester_id) {
              swappedInMembers.push({
                user_id: swap.requester_id,
                member_name: (swap.requester as any)?.full_name || "Unknown",
              });
            }
          }
        }

        // Dedupe and filter swapped-in members (exclude anyone who is also swapping out)
        const seenSwappedIn = new Set<string>();
        const uniqueSwappedInMembers = swappedInMembers
          .filter(m => !swappedOutUserIds.has(m.user_id))
          .filter(m => {
            if (seenSwappedIn.has(m.user_id)) return false;
            seenSwappedIn.add(m.user_id);
            return true;
          });

        // Get scheduled team members - track who is swapped in
        let scheduledMembers: { user_id: string; member_name: string; isSwappedIn: boolean }[] = [];
        const swappedInUserIds = new Set(uniqueSwappedInMembers.map(m => m.user_id));

        // Deduplicate by user_id (a person can have multiple positions like vocalist + instrument)
        const seenUserIds = new Set<string>();
        scheduledMembers = (members || [])
          .filter(m => {
            if (!m.ministry_types || m.ministry_types.length === 0) return true;
            return m.ministry_types.includes(setlist.ministry_type);
          })
          // Exclude members who swapped out
          .filter(m => !swappedOutUserIds.has(m.user_id!))
          // Deduplicate by user_id
          .filter(m => {
            if (seenUserIds.has(m.user_id!)) return false;
            seenUserIds.add(m.user_id!);
            return true;
          })
          .map(m => ({ user_id: m.user_id!, member_name: m.member_name, isSwappedIn: false }));

        // Add members who swapped in
        const existingUserIds = new Set(scheduledMembers.map(m => m.user_id));
        for (const swappedIn of uniqueSwappedInMembers) {
          if (!existingUserIds.has(swappedIn.user_id)) {
            scheduledMembers.push({
              user_id: swappedIn.user_id,
              member_name: swappedIn.member_name,
              isSwappedIn: true,
            });
          }
        }

        // Get confirmations
        const { data: confirmations } = await supabase
          .from("setlist_confirmations")
          .select("user_id, confirmed_at")
          .eq("draft_set_id", setlist.id);

        const confirmedUserIds = new Set((confirmations || []).map(c => c.user_id));

        // Get profile info
        const allUserIds = [...new Set([
          ...scheduledMembers.map(m => m.user_id),
          ...(confirmations || []).map(c => c.user_id)
        ])];

        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, avatar_url")
          .in("id", allUserIds.length > 0 ? allUserIds : ["00000000-0000-0000-0000-000000000000"]);

        const profileMap = new Map((profiles || []).map(p => [p.id, p]));

        // Build confirmed list
        const confirmed = (confirmations || []).map(c => {
          const profile = profileMap.get(c.user_id);
          const member = scheduledMembers.find(m => m.user_id === c.user_id);
          return {
            userId: c.user_id,
            name: profile?.full_name || member?.member_name || "Unknown",
            avatarUrl: profile?.avatar_url || null,
            confirmedAt: c.confirmed_at,
            isSwappedIn: swappedInUserIds.has(c.user_id),
          };
        });

        // Build unconfirmed list
        const unconfirmed = scheduledMembers
          .filter(m => !confirmedUserIds.has(m.user_id))
          .map(m => {
            const profile = profileMap.get(m.user_id);
            return {
              userId: m.user_id,
              name: profile?.full_name || m.member_name,
              avatarUrl: profile?.avatar_url || null,
              isSwappedIn: m.isSwappedIn,
            };
          });

        results.push({
          ...setlist,
          confirmed,
          unconfirmed,
          totalScheduled: scheduledMembers.length,
        });
      }

      return results;
    },
  });

  const getMinistryLabel = (type: string) => {
    return MINISTRY_TYPES.find(m => m.value === type)?.label || type;
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map(n => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  if (isLoading) {
    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Music className="h-5 w-5 text-primary" />
            Setlist Confirmation Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Music className="h-5 w-5 text-primary" />
            Setlist Confirmation Status
          </CardTitle>
          <Select value={ministryFilter} onValueChange={setMinistryFilter}>
            <SelectTrigger className="w-[160px] bg-background">
              <SelectValue placeholder="Ministry" />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border">
              <SelectItem value="all">All Ministries</SelectItem>
              {MINISTRY_TYPES.map(m => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {setlists.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Music className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>No published setlists found</p>
            <p className="text-sm mt-1">Publish a setlist from Set Planner to track confirmations</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[500px]">
            <div className="space-y-3">
              {setlists.map(setlist => {
                const confirmRate = setlist.totalScheduled > 0
                  ? Math.round((setlist.confirmed.length / setlist.totalScheduled) * 100)
                  : 0;
                const isFullyConfirmed = setlist.confirmed.length >= setlist.totalScheduled && setlist.totalScheduled > 0;
                const isExpanded = expandedSetlistId === setlist.id;

                return (
                  <Collapsible
                    key={setlist.id}
                    open={isExpanded}
                    onOpenChange={() => setExpandedSetlistId(isExpanded ? null : setlist.id)}
                  >
                    <CollapsibleTrigger asChild>
                      <div className="w-full p-4 rounded-lg border border-border bg-secondary/20 hover:bg-secondary/30 cursor-pointer transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-foreground">
                                {format(new Date(setlist.plan_date + "T00:00:00"), "MMM d, yyyy")}
                              </span>
                              <Badge variant="secondary" className="text-xs">
                                {getMinistryLabel(setlist.ministry_type)}
                              </Badge>
                              {selectedCampusId === "all" && setlist.campuses && (
                                <Badge variant="outline" className="text-xs">
                                  {setlist.campuses.name}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-2 text-sm">
                              <div className="flex items-center gap-1">
                                <Users className="h-4 w-4 text-muted-foreground" />
                                <span className="text-muted-foreground">
                                  {setlist.totalScheduled} scheduled
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                {isFullyConfirmed ? (
                                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                                ) : (
                                  <Clock className="h-4 w-4 text-yellow-500" />
                                )}
                                <span className={isFullyConfirmed ? "text-green-500" : "text-yellow-500"}>
                                  {setlist.confirmed.length}/{setlist.totalScheduled} confirmed ({confirmRate}%)
                                </span>
                              </div>
                            </div>
                          </div>
                          <ChevronDown 
                            className={`h-5 w-5 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} 
                          />
                        </div>
                      </div>
                    </CollapsibleTrigger>

                    <CollapsibleContent className="mt-2 rounded-lg border border-border bg-background p-3">
                      <TooltipProvider>
                        <div className="flex flex-col sm:flex-row gap-4">
                          {/* Confirmed List */}
                          <div className="flex-1">
                            <h4 className="font-medium text-green-500 flex items-center gap-1.5 mb-2 text-sm">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Confirmed ({setlist.confirmed.length})
                            </h4>
                            {setlist.confirmed.length === 0 ? (
                              <p className="text-xs text-muted-foreground">No confirmations yet</p>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {setlist.confirmed.map(member => (
                                  <Tooltip key={member.userId}>
                                    <TooltipTrigger asChild>
                                      <div className="relative">
                                        <Avatar className="h-7 w-7 ring-2 ring-green-500/30 cursor-pointer hover:ring-green-500/60 transition-all">
                                          <AvatarImage src={member.avatarUrl || undefined} />
                                          <AvatarFallback className="text-[10px] bg-green-500/20 text-green-500">
                                            {getInitials(member.name)}
                                          </AvatarFallback>
                                        </Avatar>
                                        {member.isSwappedIn && (
                                          <ArrowRightLeft className="h-2.5 w-2.5 text-blue-500 absolute -bottom-0.5 -right-0.5 bg-background rounded-full" />
                                        )}
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-xs">
                                      <p className="font-medium">{member.name}</p>
                                      <p className="text-muted-foreground">
                                        {format(new Date(member.confirmedAt), "MMM d, h:mm a")}
                                      </p>
                                      {member.isSwappedIn && (
                                        <p className="text-blue-400 text-[10px]">Swapped in</p>
                                      )}
                                    </TooltipContent>
                                  </Tooltip>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Unconfirmed List */}
                          <div className="flex-1">
                            <h4 className="font-medium text-yellow-500 flex items-center gap-1.5 mb-2 text-sm">
                              <Clock className="h-3.5 w-3.5" />
                              Pending ({setlist.unconfirmed.length})
                            </h4>
                            {setlist.unconfirmed.length === 0 ? (
                              <p className="text-xs text-muted-foreground">Everyone confirmed!</p>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {setlist.unconfirmed.map(member => (
                                  <Tooltip key={member.userId}>
                                    <TooltipTrigger asChild>
                                      <div className="relative">
                                        <Avatar className="h-7 w-7 ring-2 ring-yellow-500/30 cursor-pointer hover:ring-yellow-500/60 transition-all">
                                          <AvatarImage src={member.avatarUrl || undefined} />
                                          <AvatarFallback className="text-[10px] bg-yellow-500/20 text-yellow-500">
                                            {getInitials(member.name)}
                                          </AvatarFallback>
                                        </Avatar>
                                        {member.isSwappedIn && (
                                          <ArrowRightLeft className="h-2.5 w-2.5 text-blue-500 absolute -bottom-0.5 -right-0.5 bg-background rounded-full" />
                                        )}
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-xs">
                                      <p className="font-medium">{member.name}</p>
                                      <p className="text-muted-foreground">Not yet confirmed</p>
                                      {member.isSwappedIn && (
                                        <p className="text-blue-400 text-[10px]">Swapped in</p>
                                      )}
                                    </TooltipContent>
                                  </Tooltip>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </TooltipProvider>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
