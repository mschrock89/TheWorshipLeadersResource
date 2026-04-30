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
import { MINISTRY_TYPES, POSITION_CATEGORIES, normalizeWeekendWorshipMinistryType } from "@/lib/constants";
import { useScheduledTeamForDate } from "@/hooks/useScheduledTeamForDate";
import { useTeamRosterForDate, type RosterMember } from "@/hooks/useTeamRosterForDate";

interface SetlistMember {
  userId: string;
  name: string;
  avatarUrl: string | null;
  isSwappedIn: boolean;
}

interface ConfirmedSetlistMember extends SetlistMember {
  confirmedAt: string;
}

interface SetlistDetails {
  confirmed: ConfirmedSetlistMember[];
  unconfirmed: SetlistMember[];
  totalScheduled: number;
  audition_start_time?: string | null;
  audition_end_time?: string | null;
}

interface PublishedSetlist {
  id: string;
  campus_id: string;
  plan_date: string;
  ministry_type: string;
  custom_service_id: string | null;
  published_at: string;
  campuses: { name: string } | null;
}

interface SetlistConfirmationWidgetProps {
  selectedCampusId: string;
}

const WEEKEND_MINISTRY_ALIASES = new Set(["weekend", "weekend_team", "sunday_am"]);

function getTargetRosterMinistry(ministryFilter: string, setlistMinistry: string) {
  return ministryFilter === "all" ? setlistMinistry : ministryFilter;
}

function getMinistryLabel(type: string) {
  return MINISTRY_TYPES.find((ministry) => ministry.value === type)?.label || type;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function isAnnouncementRosterMember(member: RosterMember) {
  return member.positionSlots.includes("announcement") || member.positions.every((position) => position === "announcement");
}

function buildMembersFromRoster(roster: RosterMember[]): SetlistMember[] {
  return roster
    .filter((member) => member.userId && !isAnnouncementRosterMember(member))
    .map((member) => ({
      userId: member.userId!,
      name: member.memberName,
      avatarUrl: member.avatarUrl,
      isSwappedIn: member.isSwapped,
    }));
}

function buildConfirmationDetails(
  scheduledMembers: SetlistMember[],
  confirmations: Array<{ user_id: string; confirmed_at: string }> | null | undefined,
): SetlistDetails {
  const scheduledUserIdSet = new Set(scheduledMembers.map((member) => member.userId));
  const scopedConfirmations = (confirmations || []).filter((confirmation) =>
    scheduledUserIdSet.has(confirmation.user_id),
  );
  const confirmedByUserId = new Map(scopedConfirmations.map((confirmation) => [confirmation.user_id, confirmation.confirmed_at]));

  const confirmed = scheduledMembers
    .filter((member) => confirmedByUserId.has(member.userId))
    .map((member) => ({
      ...member,
      confirmedAt: confirmedByUserId.get(member.userId)!,
    }));

  const unconfirmed = scheduledMembers.filter((member) => !confirmedByUserId.has(member.userId));

  return {
    confirmed,
    unconfirmed,
    totalScheduled: scheduledMembers.length,
  };
}

function SetlistRow({
  setlist,
  selectedCampusId,
  ministryFilter,
  isExpanded,
  onToggle,
}: {
  setlist: PublishedSetlist;
  selectedCampusId: string;
  ministryFilter: string;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const targetRosterMinistry = getTargetRosterMinistry(ministryFilter, setlist.ministry_type);
  const setDate = useMemo(() => new Date(`${setlist.plan_date}T00:00:00`), [setlist.plan_date]);
  const isAudition = setlist.ministry_type === "audition";
  const isCustomServiceSet = !!setlist.custom_service_id;
  const usesScheduledRoster = !isAudition && !isCustomServiceSet;

  const { data: scheduledTeam, isLoading: isScheduledTeamLoading } = useScheduledTeamForDate(
    usesScheduledRoster ? setDate : null,
    usesScheduledRoster ? setlist.campus_id : null,
    usesScheduledRoster ? targetRosterMinistry : null,
  );

  const { data: roster = [], isLoading: isRosterLoading } = useTeamRosterForDate(
    usesScheduledRoster ? setDate : null,
    usesScheduledRoster ? scheduledTeam?.teamId : undefined,
    usesScheduledRoster
      ? normalizeWeekendWorshipMinistryType(targetRosterMinistry) === "weekend"
        ? "weekend_team"
        : targetRosterMinistry
      : undefined,
    usesScheduledRoster ? setlist.campus_id : undefined,
  );

  const { data: confirmations = [], isLoading: isConfirmationsLoading } = useQuery({
    queryKey: ["setlist-confirmations", setlist.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("setlist_confirmations")
        .select("user_id, confirmed_at")
        .eq("draft_set_id", setlist.id);

      if (error) throw error;
      return data || [];
    },
  });

  const { data: specialSetDetails, isLoading: isSpecialDetailsLoading } = useQuery({
    queryKey: ["setlist-special-details", setlist.id, targetRosterMinistry, setlist.custom_service_id],
    queryFn: async (): Promise<SetlistDetails | null> => {
      if (!isAudition && !isCustomServiceSet) {
        return null;
      }

      if (isAudition) {
        const { data: assignments, error: assignmentsError } = await supabase
          .from("audition_setlist_assignments")
          .select("user_id")
          .eq("draft_set_id", setlist.id);

        if (assignmentsError) throw assignmentsError;

        const userIds = [...new Set((assignments || []).map((row) => row.user_id).filter(Boolean))];
        const { data: basicProfiles, error: profilesError } = await supabase.rpc("get_basic_profiles");
        if (profilesError) throw profilesError;

        const profileMap = new Map(
          (basicProfiles || [])
            .filter((profile: any) => userIds.includes(profile.id))
            .map((profile: any) => [profile.id, profile]),
        );

        const { data: auditionRows, error: auditionRowsError } = userIds.length > 0
          ? await supabase
              .from("auditions")
              .select("candidate_id, start_time, end_time")
              .in("candidate_id", userIds)
              .eq("audition_date", setlist.plan_date)
              .eq("status", "scheduled")
              .eq("campus_id", setlist.campus_id)
          : { data: [] as Array<{ candidate_id: string; start_time: string | null; end_time: string | null }>, error: null };

        if (auditionRowsError) throw auditionRowsError;

        const scheduledMembers = userIds.map((userId) => ({
          userId,
          name: profileMap.get(userId)?.full_name || "Unknown",
          avatarUrl: profileMap.get(userId)?.avatar_url || null,
          isSwappedIn: false,
        }));

        const details = buildConfirmationDetails(scheduledMembers, confirmations);
        const primaryAudition = (auditionRows || [])[0] || null;

        return {
          ...details,
          audition_start_time: primaryAudition?.start_time || null,
          audition_end_time: primaryAudition?.end_time || null,
        };
      }

      const { data: assignments, error: assignmentsError } = await supabase
        .from("custom_service_assignments")
        .select("user_id, role")
        .eq("custom_service_id", setlist.custom_service_id!)
        .eq("assignment_date", setlist.plan_date);

      if (assignmentsError) throw assignmentsError;

      const profileIds = [...new Set((assignments || []).map((assignment) => assignment.user_id).filter(Boolean))];
      const { data: basicProfiles, error: profilesError } = await supabase.rpc("get_basic_profiles");
      if (profilesError) throw profilesError;

      const profileMap = new Map(
        (basicProfiles || [])
          .filter((profile: any) => profileIds.includes(profile.id))
          .map((profile: any) => [profile.id, profile]),
      );

      const customRoleMatchesFilter = (role: string) => {
        if (targetRosterMinistry === "all") return true;
        if (targetRosterMinistry === "production") return POSITION_CATEGORIES.audio.includes(role);
        if (targetRosterMinistry === "video") return POSITION_CATEGORIES.video.includes(role);
        return true;
      };

      const membersByUser = new Map<string, SetlistMember>();
      for (const assignment of assignments || []) {
        if (!assignment.user_id || !customRoleMatchesFilter(assignment.role)) continue;
        if (!membersByUser.has(assignment.user_id)) {
          const profile = profileMap.get(assignment.user_id);
          membersByUser.set(assignment.user_id, {
            userId: assignment.user_id,
            name: profile?.full_name || "Unknown",
            avatarUrl: profile?.avatar_url || null,
            isSwappedIn: false,
          });
        }
      }

      return buildConfirmationDetails(Array.from(membersByUser.values()), confirmations);
    },
    enabled: isAudition || isCustomServiceSet,
  });

  const details = useMemo(() => {
    if (isAudition || isCustomServiceSet) {
      return specialSetDetails;
    }

    return buildConfirmationDetails(buildMembersFromRoster(roster), confirmations);
  }, [confirmations, isAudition, isCustomServiceSet, roster, specialSetDetails]);

  const isLoading = isConfirmationsLoading || isSpecialDetailsLoading || (usesScheduledRoster && (isScheduledTeamLoading || isRosterLoading));

  if (!details) {
    return null;
  }

  const confirmRate = details.totalScheduled > 0
    ? Math.round((details.confirmed.length / details.totalScheduled) * 100)
    : 0;
  const isFullyConfirmed = details.confirmed.length >= details.totalScheduled && details.totalScheduled > 0;

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <CollapsibleTrigger asChild>
        <div className="w-full p-4 rounded-lg border border-border bg-secondary/20 hover:bg-secondary/30 cursor-pointer transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-foreground">
                  {format(new Date(`${setlist.plan_date}T00:00:00`), "MMM d, yyyy")}
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
                    {isLoading ? "Loading..." : `${details.totalScheduled} scheduled`}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {isFullyConfirmed ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <Clock className="h-4 w-4 text-yellow-500" />
                  )}
                  <span className={isFullyConfirmed ? "text-green-500" : "text-yellow-500"}>
                    {isLoading ? "Loading confirmations..." : `${details.confirmed.length}/${details.totalScheduled} confirmed (${confirmRate}%)`}
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
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          <TooltipProvider>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <h4 className="font-medium text-green-500 flex items-center gap-1.5 mb-2 text-sm">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Confirmed ({details.confirmed.length})
                </h4>
                {details.confirmed.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No confirmations yet</p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {details.confirmed.map((member) => (
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

              <div className="flex-1">
                <h4 className="font-medium text-yellow-500 flex items-center gap-1.5 mb-2 text-sm">
                  <Clock className="h-3.5 w-3.5" />
                  Pending ({details.unconfirmed.length})
                </h4>
                {details.unconfirmed.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Everyone confirmed!</p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {details.unconfirmed.map((member) => (
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
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function SetlistConfirmationWidget({ selectedCampusId }: SetlistConfirmationWidgetProps) {
  const [ministryFilter, setMinistryFilter] = useState<string>("all");
  const [expandedSetlistId, setExpandedSetlistId] = useState<string | null>(null);

  const { data: setlists = [], isLoading } = useQuery({
    queryKey: ["admin-setlist-confirmations", selectedCampusId, ministryFilter],
    queryFn: async (): Promise<PublishedSetlist[]> => {
      let query = supabase
        .from("draft_sets")
        .select(`
          id,
          campus_id,
          plan_date,
          ministry_type,
          custom_service_id,
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

      if (ministryFilter !== "all" && ministryFilter !== "production" && ministryFilter !== "video") {
        query = query.eq("ministry_type", ministryFilter);
      }

      const { data: publishedSets, error } = await query;
      if (error) throw error;
      if (!publishedSets || publishedSets.length === 0) return [];

      const auditionSetIds = publishedSets
        .filter((set) => set.ministry_type === "audition")
        .map((set) => set.id);

      const auditionAssignmentMap = new Map<string, string>();
      if (auditionSetIds.length > 0) {
        const { data: auditionAssignments, error: auditionAssignmentsError } = await supabase
          .from("audition_setlist_assignments")
          .select("draft_set_id, user_id")
          .in("draft_set_id", auditionSetIds);

        if (auditionAssignmentsError) throw auditionAssignmentsError;

        for (const row of auditionAssignments || []) {
          if (!auditionAssignmentMap.has(row.draft_set_id)) {
            auditionAssignmentMap.set(row.draft_set_id, row.user_id);
          }
        }
      }

      const dedupedPublishedMap = new Map<string, (typeof publishedSets)[number]>();
      for (const set of publishedSets) {
        const auditionCandidateId = set.ministry_type === "audition"
          ? (auditionAssignmentMap.get(set.id) || "")
          : "";
        const serviceScope = set.custom_service_id || "none";
        const dedupeKey = `${set.campus_id}|${set.plan_date}|${set.ministry_type}|${serviceScope}|${auditionCandidateId}`;
        const existing = dedupedPublishedMap.get(dedupeKey);

        if (!existing) {
          dedupedPublishedMap.set(dedupeKey, set);
          continue;
        }

        const existingPublishedAt = existing.published_at ? new Date(existing.published_at).getTime() : 0;
        const nextPublishedAt = set.published_at ? new Date(set.published_at).getTime() : 0;
        if (nextPublishedAt >= existingPublishedAt) {
          dedupedPublishedMap.set(dedupeKey, set);
        }
      }

      const dedupedPublishedSets = Array.from(dedupedPublishedMap.values())
        .sort((a, b) => a.plan_date.localeCompare(b.plan_date));

      const unresolved = dedupedPublishedSets.filter((set) => !set.custom_service_id);
      const customServiceByKey = new Map<string, string>();
      if (unresolved.length > 0) {
        const dates = [...new Set(unresolved.map((set) => set.plan_date))];
        const campusIds = [...new Set(unresolved.map((set) => set.campus_id))];
        const ministryTypes = [...new Set(unresolved.map((set) => set.ministry_type))];
        const { data: customServices, error: customServicesError } = await supabase
          .from("custom_services")
          .select("id, service_date, campus_id, ministry_type, is_active")
          .eq("is_active", true)
          .in("service_date", dates)
          .in("campus_id", campusIds)
          .in("ministry_type", ministryTypes);

        if (customServicesError) throw customServicesError;

        const grouped = new Map<string, string[]>();
        for (const customService of customServices || []) {
          const key = `${customService.service_date}|${customService.campus_id}|${customService.ministry_type}`;
          const existing = grouped.get(key) || [];
          existing.push(customService.id);
          grouped.set(key, existing);
        }

        for (const [key, ids] of grouped.entries()) {
          if (ids.length === 1) {
            customServiceByKey.set(key, ids[0]);
          }
        }
      }

      return dedupedPublishedSets.map((set) => ({
        ...set,
        custom_service_id:
          set.custom_service_id ||
          customServiceByKey.get(`${set.plan_date}|${set.campus_id}|${set.ministry_type}`) ||
          null,
      }));
    },
  });

  const visibleSetlists = useMemo(() => {
    if (ministryFilter === "all" || ministryFilter === "production" || ministryFilter === "video") {
      return setlists;
    }

    return setlists.filter((setlist) => {
      if (setlist.ministry_type === ministryFilter) return true;
      return WEEKEND_MINISTRY_ALIASES.has(setlist.ministry_type) && WEEKEND_MINISTRY_ALIASES.has(ministryFilter);
    });
  }, [ministryFilter, setlists]);

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
              {MINISTRY_TYPES.filter((ministry) => ministry.value !== "weekend_team").map((ministry) => (
                <SelectItem key={ministry.value} value={ministry.value}>
                  {ministry.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {visibleSetlists.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Music className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>No published setlists found</p>
            <p className="text-sm mt-1">Publish a setlist from Set Builder to track confirmations</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[500px]">
            <div className="space-y-3">
              {visibleSetlists.map((setlist) => (
                <SetlistRow
                  key={setlist.id}
                  setlist={setlist}
                  selectedCampusId={selectedCampusId}
                  ministryFilter={ministryFilter}
                  isExpanded={expandedSetlistId === setlist.id}
                  onToggle={() => setExpandedSetlistId(expandedSetlistId === setlist.id ? null : setlist.id)}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
